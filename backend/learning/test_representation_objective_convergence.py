import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from library.pedagogical_knowledge import concept_label_valid, objective_valid, objectives_from_knowledge
from library.source_understanding import build_understanding, grounding_bundle
from learning.teaching_plan import (
    generate_teaching_plan, learner_generation_state, teaching_activities_from_plan,
)
from learning.tutor_contract import validate_tutor_plan


FIXTURES = json.loads((Path(__file__).parent / 'fixtures/domain_generalization.json').read_text(encoding='utf-8'))
BIOLOGY = (
    'Cellular respiration is a process that transfers chemical energy from glucose into ATP.\n'
    'Glycolysis occurs in the cytoplasm and splits one glucose molecule into two pyruvate molecules.\n'
    'When oxygen is available, later stages in mitochondria use electron carriers to support ATP production.\n'
    'The electron transport chain creates a proton gradient, and ATP synthase uses that gradient to make ATP.\n'
    'Oxygen accepts electrons at the end of the chain, allowing electron transport to continue.'
)


def fixture(domain):
    cases = {
        'mathematics': ('Finite differencing', 'Mathematics', 'forward difference derivative', FIXTURES['finite_differencing']),
        'computer_science': ('Software architecture', 'Computer Science', 'client interface request service database', FIXTURES['software_architecture']),
        'biology': ('Cellular energy transfer', 'Biology', 'cellular respiration energy glucose oxygen ATP', BIOLOGY),
        'literature': ('Claim and evidence', 'Literature', 'honesty reputation claim concealed action evidence', FIXTURES['literature']),
    }
    title, subject, query, source = cases[domain]
    model = build_understanding(title, source)
    grounding = grounding_bundle(model, query)
    objective = objectives_from_knowledge(grounding)[0]
    resource = SimpleNamespace(id=domain, title=title, source_understanding=model)
    concept = SimpleNamespace(id=domain, title=title, summary='', description='', difficulty='medium',
        source_resource=resource, source_resource_id=domain, source_section='', source_page=None,
        path=SimpleNamespace(goal=f'Understand {title}', subject=subject))
    plan = generate_teaching_plan(concept, objective, grounding, allow_ai=False)
    activities = teaching_activities_from_plan(concept, objective, plan, lambda suffix: f'{domain}:{suffix}')
    return model, grounding, objective, plan, activities


class RepresentationObjectiveConvergenceTests(SimpleTestCase):
    def test_four_frozen_domains_emit_the_selected_representation(self):
        expected = {'mathematics': 'WORKED_EXAMPLE', 'computer_science': 'ARCHITECTURE',
                    'biology': 'PROCESS_FLOW', 'literature': 'EVIDENCE_HIGHLIGHT'}
        for domain, representation in expected.items():
            with self.subTest(domain=domain):
                _, grounding, objective, plan, activities = fixture(domain)
                self.assertTrue(objective_valid(objective, grounding))
                self.assertEqual(plan['selected_representation'], representation)
                self.assertEqual(plan['recommended_representation'], representation)
                self.assertEqual(plan['representation_fallback_reason'], '')
                self.assertEqual(plan['teaching_moments'][0]['representation'], representation)
                self.assertEqual(activities[0]['content']['knowledge_type'], representation)

    def test_worked_example_retains_structured_source_fields(self):
        _, _, _, plan, activities = fixture('mathematics')
        content = plan['teaching_moments'][0]['content']
        self.assertTrue(all(content[key] for key in ('problem', 'givens', 'known', 'formula', 'steps', 'result', 'interpretation')))
        self.assertGreaterEqual(len(content['steps']), 3)
        self.assertIn('substitut', ' '.join(content['substitutions']).casefold())
        self.assertEqual(activities[0]['type'], 'worked_example')

    def test_architecture_activity_contains_supported_components_and_connections(self):
        _, grounding, _, plan, activities = fixture('computer_science')
        content = plan['teaching_moments'][0]['content']
        source = grounding['excerpt']
        self.assertGreaterEqual(len(content['components']), 4)
        self.assertGreaterEqual(len(content['connections']), 3)
        self.assertTrue(all(node in source for node in content['components']))
        self.assertEqual(activities[0]['type'], 'architecture')

    def test_process_objective_and_activity_are_complete(self):
        model, _, objective, plan, activities = fixture('biology')
        self.assertNotRegex(objective['concept_label'], r'^(?:when|because|the two|later)\b')
        self.assertTrue(concept_label_valid(objective['concept_label']))
        self.assertNotIn('When oxygen', [item['title'] for item in model['learner_concepts']])
        content = plan['teaching_moments'][0]['content']
        self.assertGreaterEqual(len(content['steps']), 2)
        self.assertTrue(content['edges'])
        self.assertEqual(activities[0]['type'], 'process')

    def test_evidence_activity_keeps_claim_evidence_and_relationship(self):
        _, _, _, plan, activities = fixture('literature')
        content = plan['teaching_moments'][0]['content']
        self.assertTrue(content['claim'])
        self.assertTrue(content['evidence'])
        self.assertTrue(content['relationship'])
        self.assertEqual(activities[0]['type'], 'evidence_highlight')

    def test_labels_reject_clause_and_transition_fragments(self):
        for label in ('When oxygen', 'Because the', 'The two', 'Later', 'Together the evidence'):
            with self.subTest(label=label):
                self.assertFalse(concept_label_valid(label))

    def test_silent_representation_downgrade_is_rejected(self):
        _, grounding, objective, plan, _ = fixture('biology')
        plan['selected_representation'] = 'ARCHITECTURE'
        plan['representation_fallback_reason'] = ''
        with self.assertRaisesMessage(ValueError, 'silently downgraded'):
            validate_tutor_plan(plan, objective, grounding)

    def test_learner_state_uses_only_persisted_authoritative_values(self):
        session = SimpleNamespace(state={'objective_evidence': {'objective-1': {
            'taught': True, 'interactions': 2, 'best_score': 60, 'evidence_ids': ['attempt-1'],
            'source': 'activity', 'misconception_ids': ['misconception-1'],
            'unresolved_misconception': 'free text is not copied'}},
            'teaching_plans': {'other': {'plan': {'teaching_moments': [{'representation': 'COMPARISON'}]}}},
            'recent_remediation_modes': ['PROCESS_FLOW', 'unknown']})
        result = learner_generation_state(session, 'objective-1', [
            {'id': 'known', 'state': 'KNOWN'}, {'id': 'missing', 'state': 'MISSING'}])
        self.assertEqual(result['known_prerequisite_knowledge_ids'], ['known'])
        self.assertEqual(result['prior_objective_evidence']['evidence_ids'], ['attempt-1'])
        self.assertEqual(result['observed_misconception_ids'], ['misconception-1'])
        self.assertEqual(result['previously_used_representations'], ['COMPARISON', 'PROCESS_FLOW'])
        self.assertNotIn('unresolved_misconception', result['prior_objective_evidence'])

    def test_tutor_generation_receives_authoritative_learner_state(self):
        from learning.tutor_engine import generate
        _, grounding, objective, _, _ = fixture('biology')
        concept = SimpleNamespace(id='biology', path=SimpleNamespace(goal='Understand energy transfer'))
        learner_state = {'known_prerequisite_knowledge_ids': ['known'],
                         'prior_objective_evidence': {'best_score': 60},
                         'observed_misconception_ids': ['misconception-1'],
                         'previously_used_representations': ['PROCESS_FLOW']}
        with patch('learning.tutor_engine.structured_task', return_value={'accepted': True}) as task:
            generate(concept, objective, grounding, [], learner_state=learner_state)
        self.assertEqual(task.call_args.args[3]['learner_state'], learner_state)

    def test_acceptance_phrases_are_absent_from_runtime(self):
        root = Path(__file__).resolve().parent.parent
        runtime = '\n'.join((root / path).read_text(encoding='utf-8') for path in
            ('library/pedagogical_knowledge.py', 'learning/teaching_plan.py', 'learning/tutor_contract.py'))
        for phrase in ('When oxygen', 'React Native', 'Mara slipped'):
            self.assertNotIn(phrase, runtime)
