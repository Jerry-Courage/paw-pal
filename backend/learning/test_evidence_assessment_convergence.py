from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from library.source_understanding import build_understanding, grounding_bundle
from library.pedagogical_knowledge import objectives_from_knowledge
from learning.assessment import (
    build_assessment_target, capability_prompt, evaluate_open_text, feedback_for, semantic_terms,
)
from learning.teaching_plan import generate_teaching_plan, teaching_activities_from_plan
from learning.tutor_engine import deterministic_remediation, evaluate, learning_signal


def target(proposition, capability='EXPLAIN_MECHANISM', relationships=None):
    words = sorted(semantic_terms(proposition))
    return {
        'objective_id': 'objective', 'tested_knowledge_ids': ['knowledge-1'],
        'capability': capability,
        'expected_concepts': [{'knowledge_id': 'knowledge-1', 'label': 'target idea',
                               'proposition': proposition, 'required_terms': words}],
        'required_relationships': relationships or [], 'acceptable_paraphrases': [proposition],
        'source_support': [{'knowledge_id': 'knowledge-1', 'source_refs': [{'page_id': 'page-1'}]}],
        'prohibited_unsupported_claims': [], 'evidence_threshold': .68,
        'additional_evidence_required': False,
        'scoring_rubric': {'passing_score': 70, 'partial_score': 35},
    }


class EvidenceAssessmentUnitTests(SimpleTestCase):
    biology = 'Larger organisms using surface gas exchange need circulation to distribute gases throughout the body.'

    @override_settings(JOURNEY_TEACHING_AI_ENABLED=True)
    def test_exact_grounded_answer_never_requires_provider(self):
        with patch('ai_assistant.task_routing.structured_task') as provider:
            result = evaluate_open_text(self.biology, target(self.biology))
        self.assertEqual(result['outcome'], 'correct')
        self.assertEqual(result['path'], 'grounded_exact')
        provider.assert_not_called()

    @override_settings(JOURNEY_TEACHING_AI_ENABLED=True)
    def test_equivalent_and_concise_answers_are_scored_by_meaning(self):
        cases = [
            'Large organisms require circulation so gases from surface exchange can reach the whole body.',
            'Surface exchange in a larger animal needs circulation to move gases through its body.',
            'In plain terms, gases enter at the surface and circulation carries them around a large body; extra wording does not change that.',
        ]
        semantic_result = {'outcome': 'correct', 'score': 92, 'missing_evidence': [], 'path': 'provider'}
        with patch('ai_assistant.task_routing.structured_task', return_value=semantic_result):
            for answer in cases:
                with self.subTest(answer=answer):
                    self.assertEqual(evaluate_open_text(answer, target(self.biology))['outcome'], 'correct')

    @override_settings(JOURNEY_TEACHING_AI_ENABLED=False)
    def test_partial_incorrect_and_contradiction_are_learner_outcomes(self):
        partial = evaluate_open_text('Larger organisms exchange gases at their surface.', target(self.biology))
        incorrect = evaluate_open_text('They need lungs.', target(self.biology))
        contradiction = evaluate_open_text('Larger organisms do not need circulation for surface gas exchange.', target(self.biology))
        self.assertEqual(partial['outcome'], 'partial')
        self.assertEqual(incorrect['outcome'], 'incorrect')
        self.assertEqual(contradiction['outcome'], 'incorrect')
        self.assertIn('missing conceptual element', feedback_for(partial, target(self.biology)))

    def test_learning_signal_is_distinct_from_evaluation(self):
        self.assertEqual(learning_signal({'text': "I don't know"}), 'needs_explanation')
        self.assertEqual(learning_signal({'text': "That wasn't taught"}), 'missing_teaching')

    @override_settings(JOURNEY_TEACHING_AI_ENABLED=True,
                       AI_TASK_ROUTES={'MASTERY_EVALUATION': [{'provider': 'configured-provider', 'model': 'configured-model'}]})
    def test_provider_schema_failure_is_ungraded_system_error(self):
        with patch('ai_assistant.task_routing.structured_task', side_effect=ValueError('bad schema')):
            result = evaluate_open_text('An unrelated response.', target(self.biology))
        self.assertEqual(result['outcome'], 'ungradable_system_error')
        self.assertIsNone(result['score'])

    @override_settings(JOURNEY_TEACHING_AI_ENABLED=True)
    def test_provider_receives_structured_target_and_preserves_partial_evidence(self):
        semantic_result = {'outcome': 'partial', 'score': 55,
                           'missing_evidence': ['the causal relationship']}
        with patch('ai_assistant.task_routing.structured_task', return_value=semantic_result) as provider:
            result = evaluate_open_text('Larger organisms exchange gases.', target(self.biology))
        payload = provider.call_args.args[3]
        self.assertEqual(payload['learner_answer'], 'Larger organisms exchange gases.')
        self.assertEqual(payload['assessment_target']['tested_knowledge_ids'], ['knowledge-1'])
        self.assertNotIn('lesson', payload)
        self.assertEqual(result['outcome'], 'partial')
        self.assertEqual(result['missing_evidence'], ['the causal relationship'])

    @override_settings(JOURNEY_TEACHING_AI_ENABLED=True)
    def test_near_exact_can_require_additional_capability_evidence(self):
        evidence_target = target(self.biology)
        evidence_target['additional_evidence_required'] = True
        semantic_result = {'outcome': 'partial', 'score': 62,
                           'missing_evidence': ['explain why circulation is required']}
        with patch('ai_assistant.task_routing.structured_task', return_value=semantic_result) as provider:
            result = evaluate_open_text(self.biology, evidence_target)
        provider.assert_called_once()
        self.assertEqual(result['outcome'], 'partial')

    def test_capability_questions_assess_domain_understanding(self):
        expected = {
            'DEFINE': 'mean', 'EXPLAIN_MECHANISM': 'how or why', 'COMPARE': 'difference',
            'TRACE': 'Trace how', 'APPLY': 'new situation', 'CALCULATE': 'method',
            'INTERPRET': 'mean', 'IDENTIFY_EVIDENCE': 'evidence',
        }
        for capability, phrase in expected.items():
            prompt = capability_prompt(capability, 'the target')
            self.assertIn(phrase.casefold(), prompt.casefold())
            self.assertNotIn('what is its subject', prompt.casefold())

    @override_settings(JOURNEY_TEACHING_AI_ENABLED=True)
    def test_cross_domain_semantic_evidence(self):
        cases = {
            'mathematics': (
                'The forward difference approximates a derivative by subtracting f(x) from f(x+h) and dividing by h.',
                'Approximate the derivative: subtract f(x) from f(x+h), then divide the difference by h.'),
            'computer_science': (
                'The controller sends a validated request to the service, which reads the database and returns the result.',
                'A validated request moves from controller to service; the service gets the result from the database and returns it.'),
            'biology': (self.biology, 'Large organisms require circulation to move gases from surface exchange through the body.'),
            'literature': (
                'The concealed letter supports the claim that the character is dishonest.',
                'Hiding the letter is evidence for the claim that the character lacks honesty.'),
            'history': (
                'Food shortages caused public unrest, which led the government to change policy.',
                'Because food became scarce, unrest rose and the government changed its policy.'),
        }
        semantic_result = {'outcome': 'correct', 'score': 90, 'missing_evidence': [], 'path': 'provider'}
        with patch('ai_assistant.task_routing.structured_task', return_value=semantic_result):
            for domain, (expected, answer) in cases.items():
                with self.subTest(domain=domain):
                    self.assertEqual(evaluate_open_text(answer, target(expected))['outcome'], 'correct')

    @override_settings(JOURNEY_TEACHING_AI_ENABLED=False)
    def test_cross_domain_missing_relationships_are_partial_or_incorrect(self):
        cases = [
            ('The forward difference subtracts f(x) from f(x+h) and divides by h.',
             'Subtract f(x).'),
            ('The controller sends the request to the service, which reads the database.',
             'The controller and database exist.'),
            (self.biology, 'Larger organisms exchange gases at the surface.'),
            ('Food shortages caused unrest, which led the government to change policy.',
             'Food shortages happened before a policy change.'),
        ]
        for expected, answer in cases:
            with self.subTest(expected=expected):
                self.assertIn(evaluate_open_text(answer, target(expected))['outcome'], {'partial', 'incorrect'})


class EvidenceContractPlanTests(SimpleTestCase):
    source = (
        'A gateway validates each request before sending it to the service. '
        'The service reads stored records from the database and returns a response. '
        'Validation prevents malformed requests from reaching storage.'
    )

    def setUp(self):
        model = build_understanding('Request flow', self.source)
        self.grounding = grounding_bundle(model, 'gateway service request database validation')
        self.objective = objectives_from_knowledge(self.grounding)[0]
        resource = SimpleNamespace(id='resource', title='Request flow', source_understanding=model)
        self.concept = SimpleNamespace(id='concept', title='Request flow', summary='', description='', difficulty='medium',
            source_resource=resource, source_resource_id='resource', source_section='', source_page=None,
            path=SimpleNamespace(goal='Understand request flow', subject='Computer Science'))
        self.plan = generate_teaching_plan(self.concept, self.objective, self.grounding, allow_ai=False)
        self.activities = teaching_activities_from_plan(self.concept, self.objective, self.plan, lambda suffix: suffix)

    def test_plan_activity_and_evaluator_share_one_target(self):
        check = next(item for item in self.activities if item['purpose'] == 'check')
        plan_check = next(item for item in self.plan['teaching_moments'] if item['interaction'] != 'NONE')
        target_data = check['assessment_target']
        self.assertEqual(plan_check['tested_knowledge_ids'], target_data['tested_knowledge_ids'])
        self.assertEqual(check['tested_knowledge_ids'], target_data['tested_knowledge_ids'])
        self.assertEqual(target_data['objective_id'], self.objective['id'])
        self.assertEqual(target_data['capability'], self.objective['capability'])
        self.assertTrue(target_data['source_support'])
        self.assertEqual(evaluate(check, {'text': check['content']['expected_answer']})[3], 'correct')

    def test_remediation_teaches_gap_and_asks_fresh_capability_question(self):
        check = next(item for item in self.activities if item['purpose'] == 'check')
        session = SimpleNamespace(concept=self.concept, state={'teaching_plans': {
            self.objective['id']: {'grounding_input': self.grounding, 'plan': self.plan}}})
        repair = deterministic_remediation(session, self.objective, check, {'text': 'It uses a database.'})
        teaching = next(item for item in repair['teaching_moments'] if item['interaction'] == 'NONE')
        fresh = next(item for item in repair['teaching_moments'] if item['interaction'] != 'NONE')
        self.assertEqual(teaching['representation'], 'EVIDENCE_HIGHLIGHT')
        self.assertTrue(teaching['content']['what_matters'])
        self.assertTrue(teaching['content']['why_it_matters'])
        self.assertNotIn('what is its subject', fresh['content']['prompt'].casefold())
        self.assertNotEqual(fresh['content']['prompt'], check['content']['prompt'])

    def test_required_check_has_no_continue_bypass(self):
        source = (Path(__file__).parents[2] / 'frontend/components/journey-world/JourneyWorld.tsx').read_text(encoding='utf-8')
        self.assertIn("{!evidenceStage &&", source)
        self.assertIn("!teaching && activity.type !== 'reveal'", source)
