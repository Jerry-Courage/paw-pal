import os
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, override_settings

from .teaching_plan import (
    TeachingPlanValidationError, generate_teaching_plan, get_or_create_teaching_plan,
    safe_fallback_plan, select_interaction, select_representation,
    teaching_activity_from_plan, validate_teaching_plan,
)
from .teaching_plan_eval import AUDITED_MODEL_CANDIDATES, compare_candidate_outputs
from core.settings import _environment_flag


def concept(title, summary='', subject='', goal='Understand it'):
    return SimpleNamespace(id='concept-1', title=title, summary=summary, description=summary,
                           difficulty='medium', path=SimpleNamespace(subject=subject, goal=goal))


class TeachingPlanSchemaTests(SimpleTestCase):
    def test_malformed_plan_is_rejected(self):
        with self.assertRaises(TeachingPlanValidationError): validate_teaching_plan({'objective_id': 'one'})

    def test_unsupported_representation_is_rejected(self):
        raw = safe_fallback_plan(concept('A definition'), {'id': 'one', 'text': 'Define the idea'}, {})
        raw['recommended_representation'] = 'GENERATED_REACT_COMPONENT'
        with self.assertRaises(TeachingPlanValidationError): validate_teaching_plan(raw)

    def test_ui_code_is_rejected(self):
        raw = safe_fallback_plan(concept('A definition'), {'id': 'one', 'text': 'Define the idea'}, {})
        raw['teaching_moments'][0]['content']['body'] = '<svg><script /></svg>'
        with self.assertRaises(TeachingPlanValidationError): validate_teaching_plan(raw)

    def test_moment_belongs_to_expected_objective(self):
        raw = safe_fallback_plan(concept('A definition'), {'id': 'one', 'text': 'Define the idea'}, {})
        with self.assertRaises(TeachingPlanValidationError): validate_teaching_plan(raw, 'two')

    def test_interactive_moment_requires_evidence_contract(self):
        raw = safe_fallback_plan(concept('A definition'), {'id': 'one', 'text': 'Define the idea'}, {})
        raw['teaching_moments'].append({
            'id': 'check', 'type': 'CHECK', 'representation': 'GROUNDED_EXPLANATION',
            'interaction': 'SHORT_ANSWER',
            'content': {'body': 'Use the idea you just learned.', 'prompt': 'Explain the idea in your own words.'},
        })
        with self.assertRaises(TeachingPlanValidationError):
            validate_teaching_plan(raw, 'one')

    def test_valid_interactive_moment_preserves_expected_evidence(self):
        raw = safe_fallback_plan(concept('A definition'), {'id': 'one', 'text': 'Define the idea'}, {})
        raw['teaching_moments'].append({
            'id': 'check', 'type': 'CHECK', 'representation': 'GROUNDED_EXPLANATION',
            'interaction': 'SHORT_ANSWER',
            'content': {
                'body': 'Use the idea you just learned.', 'prompt': 'Explain the idea in your own words.',
                'expected_answer': 'A grounded explanation of the idea.',
                'evidence_concepts': ['grounded explanation'],
            },
        })
        plan = validate_teaching_plan(raw, 'one')
        check = plan['teaching_moments'][-1]
        self.assertEqual(check['content']['evidence_concepts'], ['grounded explanation'])

    def test_collection_fields_reject_strings(self):
        raw = safe_fallback_plan(concept('A definition'), {'id': 'one', 'text': 'Define the idea'}, {})
        raw['teaching_moments'][0]['content']['nodes'] = 'not-a-list'
        with self.assertRaises(TeachingPlanValidationError):
            validate_teaching_plan(raw, 'one')


class JourneyTeachingFeatureFlagTests(SimpleTestCase):
    @patch.dict(os.environ, {}, clear=False)
    def test_absent_environment_variable_enables_teaching_generation(self):
        os.environ.pop('JOURNEY_TEACHING_AI_ENABLED', None)
        self.assertTrue(_environment_flag('JOURNEY_TEACHING_AI_ENABLED', default=True))

    @patch.dict(os.environ, {'JOURNEY_TEACHING_AI_ENABLED': 'true'}, clear=False)
    def test_true_environment_variable_enables_teaching_generation(self):
        self.assertTrue(_environment_flag('JOURNEY_TEACHING_AI_ENABLED', default=True))

    @patch.dict(os.environ, {'JOURNEY_TEACHING_AI_ENABLED': 'false'}, clear=False)
    def test_false_environment_variable_disables_teaching_generation(self):
        self.assertFalse(_environment_flag('JOURNEY_TEACHING_AI_ENABLED', default=True))

    @patch.dict(os.environ, {'JOURNEY_TEACHING_AI_ENABLED': 'off'}, clear=False)
    def test_common_false_values_preserve_the_kill_switch(self):
        self.assertFalse(_environment_flag('JOURNEY_TEACHING_AI_ENABLED', default=True))


class SubjectPlanTests(SimpleTestCase):
    def test_invisible_servants_is_comparison_not_fragmented_sequence(self):
        item = concept('The Invisible Servants (And Invisible Bias)', "Mr. Green claims to understand Africans but ignores the African stewards.", 'Literature')
        plan = safe_fallback_plan(item, {'id': 'bias', 'text': "Compare Green's beliefs with his behaviour toward African stewards."}, {'excerpt': item.summary})
        self.assertEqual(plan['recommended_representation'], 'COMPARISON')
        activity = teaching_activity_from_plan(item, {'id': 'bias', 'index': 0}, plan, 'activity-1')
        self.assertEqual(activity['type'], 'comparison')
        self.assertFalse(activity['content']['steps'])
        self.assertFalse(any(row == ['Mr.'] for row in activity['content']['rows']))

    def test_biology_route_uses_cycle(self):
        item = concept('Pulmonary and systemic circulation', 'Blood travels from heart to lungs and body.', 'Biology')
        plan = safe_fallback_plan(item, {'id': 'routes', 'text': 'Explain the two circulation routes through the heart.'}, {'excerpt': item.summary})
        self.assertEqual(plan['recommended_representation'], 'CYCLE')
        self.assertEqual(plan['interaction_strategy'], 'TAP_TARGET')

    def test_newton_raphson_uses_worked_example(self):
        item = concept('Newton-Raphson', 'Use x next = x - f(x) / f prime(x).', 'Mathematics')
        plan = safe_fallback_plan(item, {'id': 'formula', 'text': 'Use the Newton-Raphson formula to calculate the next estimate.'}, {'excerpt': item.summary})
        self.assertEqual(plan['recommended_representation'], 'WORKED_EXAMPLE')
        self.assertEqual(plan['interaction_strategy'], 'STEP_SOLVER')

    def test_cs_layers_use_architecture(self):
        item = concept('Application architecture', 'React Native calls Spring Boot which queries PostgreSQL.', 'Computer Science')
        plan = safe_fallback_plan(item, {'id': 'layers', 'text': 'Explain frontend, backend, API and database layers.'}, {'excerpt': item.summary})
        self.assertEqual(plan['recommended_representation'], 'ARCHITECTURE')
        self.assertEqual(plan['interaction_strategy'], 'MATCHING')

    def test_semantic_interaction_selection(self):
        self.assertEqual(select_interaction('history', 'Order the events', 'TIMELINE'), 'ORDERING')
        self.assertEqual(select_interaction('literature', 'Interpret the quote', 'EVIDENCE_HIGHLIGHT'), 'EVIDENCE_HIGHLIGHT')
        self.assertEqual(select_representation('general', 'Explain the cause and effect', {}), 'CAUSE_EFFECT')


class TeachingPlanFallbackAndCacheTests(SimpleTestCase):
    @override_settings(JOURNEY_TEACHING_AI_ENABLED=True)
    @patch('ai_assistant.services.AIService.chat_sync', side_effect=RuntimeError('offline'))
    def test_ai_failure_uses_clean_grounded_fallback(self, _chat):
        item = concept('Convergence', 'The estimates approach a stable result.', 'Mathematics')
        plan = generate_teaching_plan(item, {'id': 'definition', 'text': 'Explain convergence.'}, {'excerpt': item.summary})
        self.assertEqual(plan['origin'], 'fallback')
        self.assertNotIn('sentence fragments', str(plan))

    def test_plan_is_cached_by_objective_and_not_regenerated_on_continue(self):
        item = concept('Convergence', 'The estimates approach a stable result.', 'Mathematics')
        session = SimpleNamespace(concept=item, current_point=0, objectives=[{'id':'definition','text':'Explain convergence.'}], state={}, save=Mock())
        first = get_or_create_teaching_plan(session, {'excerpt': item.summary}, allow_ai=False)
        second = get_or_create_teaching_plan(session, {'excerpt': item.summary}, allow_ai=False)
        self.assertEqual(first, second)
        self.assertEqual(session.save.call_count, 1)

    def test_new_objective_receives_separate_plan(self):
        item = concept('Convergence', 'The estimates approach a stable result.', 'Mathematics')
        session = SimpleNamespace(concept=item, current_point=0, objectives=[{'id':'definition','text':'Explain convergence.'},{'id':'apply','text':'Apply convergence.'}], state={}, save=Mock())
        get_or_create_teaching_plan(session, {'excerpt': item.summary}, allow_ai=False)
        session.current_point = 1
        get_or_create_teaching_plan(session, {'excerpt': item.summary}, allow_ai=False)
        self.assertEqual(set(session.state['teaching_plans']), {'definition','apply'})


class TeachingPlanEvaluationHarnessTests(SimpleTestCase):
    def test_harness_rejects_invalid_output_and_ranks_valid_plan(self):
        item = concept('Convergence', 'The estimates approach a stable result.', 'Mathematics')
        valid = safe_fallback_plan(item, {'id': 'definition', 'text': 'Explain convergence.'}, {'excerpt': item.summary})
        results = compare_candidate_outputs({'configured:valid': valid, 'configured:invalid': {'oops': True}}, 'definition')
        self.assertEqual(results[0]['candidate'], 'configured:valid')
        self.assertTrue(results[0]['valid'])
        self.assertFalse(results[1]['valid'])

    def test_harness_lists_only_audited_repository_models(self):
        self.assertIn('google:gemini-2.5-flash-native-audio-preview-12-2025', AUDITED_MODEL_CANDIDATES['realtime_voice'])
        self.assertIn('groq:openai/gpt-oss-120b', AUDITED_MODEL_CANDIDATES['structured_teaching'])
