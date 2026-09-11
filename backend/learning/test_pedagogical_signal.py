"""E.5.2D acceptance. Adjacent prose is synthetic; the failure quote is exact."""
import copy
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings

from library.pedagogical_knowledge import (
    NON_PRIMARY, classify_proposition, objective_valid, objectives_from_knowledge,
)
from library.source_understanding import build_understanding, grounding_bundle, understand_with_ai
from learning.material_grounding import assessment_ready, grounded_objectives
from learning.teaching_plan import generate_teaching_plan, get_or_create_teaching_plan
from learning.tutor_contract import validate_tutor_plan
from learning.tutor_engine import evaluate, learning_signal

FIXTURES = json.loads((Path(__file__).parent / 'fixtures/pedagogical_signal.json').read_text(encoding='utf-8'))


def lesson_fixture(domain='respiration'):
    fixture = FIXTURES[domain]
    source = '\n'.join([fixture['editorial'], fixture.get('caption', ''), fixture['instructional']])
    model = build_understanding(domain, source)
    grounding = grounding_bundle(model, fixture['instructional'])
    objectives = objectives_from_knowledge(grounding)
    concept = SimpleNamespace(id='concept', title=domain, summary='', description='', difficulty='medium',
                              path=SimpleNamespace(goal='Understand', subject=domain))
    plan = generate_teaching_plan(concept, objectives[0], grounding, allow_ai=False)
    return model, grounding, objectives[0], plan


class PedagogicalSignalTests(SimpleTestCase):
    def test_exact_production_failure_is_context_only(self):
        model, grounding, objective, plan = lesson_fixture()
        sentence = FIXTURES['respiration']['editorial']
        rejected = next(item for item in model['propositions'] if item['text'] == sentence)
        self.assertEqual(rejected['semantic_type'], 'FURTHER_READING')
        self.assertFalse(rejected['accepted'])
        self.assertNotIn(sentence, json.dumps(model['knowledge']['knowledge_objects']))
        self.assertNotIn(sentence, json.dumps(objective))
        self.assertNotIn(sentence, json.dumps(plan['teaching_moments']))
        self.assertNotIn(sentence, json.dumps(model['topics']))

    def test_six_domains_reject_editorial_asides_and_teach_knowledge(self):
        for domain, fixture in FIXTURES.items():
            with self.subTest(domain=domain):
                model, grounding, objective, plan = lesson_fixture(domain)
                self.assertTrue(objective_valid(objective, grounding))
                self.assertNotIn(fixture['editorial'], json.dumps(plan['teaching_moments']))
                self.assertTrue(model['knowledge']['knowledge_objects'])
                self.assertEqual(plan['version'], 3)

    def test_discourse_language_can_itself_be_instructional(self):
        for text in ('Citation means a reference identifying the source of a claim.',
                     'Research bias causes systematic errors in measured outcomes.',
                     'A chapter is a division of a book that groups related scenes.'):
            self.assertNotIn(classify_proposition(text), NON_PRIMARY)

    def test_structurally_different_editorial_discourse(self):
        for text in ('Our article examines orbital mechanics.', 'Several critics have discussed the novel.',
                     'Consult the bibliography for additional examples.', 'We now turn to the next section.',
                     'There are numerous publications concerning the archive.'):
            self.assertIn(classify_proposition(text), NON_PRIMARY)

    def test_caption_alone_cannot_establish_knowledge(self):
        model = build_understanding('Figure', FIXTURES['respiration']['caption'])
        self.assertEqual(model['knowledge']['knowledge_objects'], [])
        self.assertEqual(model['topics'], [])

    def test_editorial_sentence_does_not_hide_adjacent_instruction_in_same_block(self):
        source = FIXTURES['respiration']
        model = build_understanding('Exchange', source['editorial'] + ' ' + source['instructional'])
        self.assertTrue(model['topics'])
        self.assertNotIn(source['editorial'], json.dumps(model['topics']))
        self.assertIn('Gas exchange', json.dumps(model['topics']))
        self.assertEqual(len(model['knowledge']['knowledge_objects']), 3)

    def test_knowledge_ids_are_stable_and_have_provenance(self):
        first, _, _, _ = lesson_fixture()
        second, _, _, _ = lesson_fixture()
        self.assertEqual(first['knowledge']['knowledge_objects'], second['knowledge']['knowledge_objects'])
        for item in first['knowledge']['knowledge_objects']:
            self.assertTrue(item['source_refs'])
            self.assertTrue(item['assessment_possibilities'])
            self.assertIn('citation_further_reading_likelihood', item['scores'])

    def test_objective_quality_rejects_arbitrary_statement_and_wrong_ids(self):
        _, grounding, objective, _ = lesson_fixture()
        self.assertFalse(objective_valid({**objective, 'text': 'Explain the meaning and significance of this source statement.'}, grounding))
        self.assertFalse(objective_valid({**objective, 'knowledge_ids': ['page:page-1']}, grounding))

    def test_cross_sentence_synthesis_retains_each_provenance(self):
        model, grounding, objective, plan = lesson_fixture()
        self.assertGreater(len(objective['knowledge_ids']), 1)
        taught = set().union(*(set(moment['teaches']) for moment in plan['teaching_moments']))
        self.assertGreater(len(taught), 1)
        self.assertTrue(set(objective['knowledge_ids']) <= taught)
        for moment in plan['teaching_moments']:
            self.assertTrue(moment['source_refs'])

    def test_check_records_dependencies_and_teaches_before_test(self):
        _, grounding, objective, plan = lesson_fixture()
        established = set()
        for moment in plan['teaching_moments']:
            if moment['tests']:
                self.assertEqual(moment['tested_knowledge_ids'], moment['tests'])
                self.assertTrue(set(moment['tests']) <= established)
            established.update(moment['teaches'])
        raw = copy.deepcopy(plan)
        raw['teaching_moments'].insert(0, raw['teaching_moments'].pop())
        with self.assertRaisesMessage(ValueError, 'not yet taught'):
            validate_tutor_plan(raw, objective, grounding)

    def test_citation_or_title_cannot_forge_taught_knowledge(self):
        _, grounding, objective, plan = lesson_fixture()
        raw = copy.deepcopy(plan)
        raw['teaching_moments'][0]['content']['body'] = 'Figure 2. Gas exchange through skin and primitive lungs.'
        with self.assertRaisesMessage(ValueError, 'does not establish'):
            validate_tutor_plan(raw, objective, grounding)

    def test_page_id_is_not_assessment_permission(self):
        _, grounding, objective, plan = lesson_fixture()
        plan['teaching_moments'][-1]['tests'] = ['page:' + grounding['pages'][0]['id']]
        with self.assertRaisesMessage(ValueError, 'unknown knowledge'):
            validate_tutor_plan(plan, objective, grounding)

    def test_valid_id_cannot_disguise_editorial_assessment(self):
        _, grounding, objective, plan = lesson_fixture()
        plan['teaching_moments'][-1]['content']['expected_answer'] = FIXTURES['respiration']['editorial']
        with self.assertRaisesMessage(ValueError, 'editorial or caption'):
            validate_tutor_plan(plan, objective, grounding)

    def test_completed_unrelated_lesson_is_not_permission(self):
        session = SimpleNamespace(state={'player': {'completed_stage_ids': ['o:learn']}})
        lesson = {'id': 'learn', 'objective_id': 'o', 'purpose': 'learn', 'tutor': {'teaches': ['a']}}
        check = {'id': 'check', 'objective_id': 'o', 'requires_teaching': True, 'tutor': {'tests': ['b']}}
        self.assertFalse(assessment_ready(session, check, [lesson, check]))
        check['tutor']['tests'] = ['a']
        self.assertTrue(assessment_ready(session, check, [lesson, check]))

    def test_learning_signals_are_not_graded(self):
        for answer in ("I don't know", 'I dont really know wasnt taught', "I wasn't taught", "I don't understand", 'no idea', 'can you explain again'):
            with self.subTest(answer=answer):
                self.assertTrue(learning_signal({'text': answer}))
                correct, score, _, outcome = evaluate({'type': 'short_answer'}, {'text': answer})
                self.assertIsNone(correct)
                self.assertIsNone(score)
                self.assertEqual(outcome, 'learning_signal')

    def test_conceptual_answer_is_still_an_attempt(self):
        self.assertFalse(learning_signal({'text': 'Diffusion moves gas across the surface.'}))

    def test_ai_assistance_cannot_promote_editorial_context(self):
        model, _, _, _ = lesson_fixture()
        result = understand_with_ai(model, lambda *args, **kwargs: '{}')
        self.assertNotIn(FIXTURES['respiration']['editorial'], json.dumps(result['knowledge']['knowledge_objects']))

    def test_first_moment_starts_with_teachable_knowledge(self):
        model, _, _, plan = lesson_fixture()
        first = plan['teaching_moments'][0]
        self.assertTrue(first['teaches'])
        self.assertTrue(first['attention_cue'])
        self.assertTrue(first['understanding_change'])
        self.assertNotIn('Figure', first['content']['body'])

    def test_no_fixture_phrase_runtime_branches(self):
        root = Path(__file__).resolve().parent.parent
        runtime = '\n'.join((root / name).read_text(encoding='utf-8') for name in
            ('library/pedagogical_knowledge.py', 'learning/teaching_plan.py', 'learning/material_grounding.py', 'learning/tutor_contract.py'))
        for fixture in FIXTURES.values():
            self.assertNotIn(fixture['editorial'], runtime)
        self.assertNotIn('respiration', runtime.casefold())


@override_settings(JOURNEY_TEACHING_AI_ENABLED=False)
class PedagogicalSignalSessionTests(TestCase):
    def setUp(self):
        from library.models import Resource
        from learning.models import LearningPath, ConceptNode, TeachingSession
        self.user = get_user_model().objects.create_user(username='signal-learner')
        model, _, _, _ = lesson_fixture()
        resource = Resource.objects.create(owner=self.user, title='Gas exchange', source_understanding=model)
        path = LearningPath.objects.create(user=self.user, title='Knowledge')
        self.concept = ConceptNode.objects.create(path=path, title='Gas exchange', source_resource=resource, order_index=0)
        self.session = TeachingSession.objects.create(user=self.user, concept=self.concept, objectives=grounded_objectives(self.concept))

    def respond(self, answer, key):
        from learning.views import _objective_activities, submit_teaching_activity
        activities = _objective_activities(self.session, self.user)
        check = activities[-1]
        self.session.state['player'] = {'active_activity_id': check['id'], 'completed_stage_ids':
            [f"{item['objective_id']}:{item['id']}" for item in activities[:-1]]}
        self.session.save()
        return submit_teaching_activity(self.concept, self.user, check['id'], {'text': answer}, key)

    def test_dont_know_reenters_teaching_without_attempt_or_mastery(self):
        from learning.models import EncounterAttempt
        session, result, created = self.respond("I don't know", 'signal')
        self.assertTrue(created)
        self.assertEqual(result['controller_action'], 'RETEACH')
        self.assertEqual(session.status, 'teaching')
        self.assertEqual(session.state['player'], {})
        self.assertEqual(session.objectives_understood, [])
        self.assertEqual(EncounterAttempt.objects.count(), 0)

    def test_wasnt_taught_bridges_and_is_idempotent(self):
        from learning.views import submit_teaching_activity
        from learning.models import EncounterAttempt
        session, result, _ = self.respond('I dont really know wasnt taught', 'gap')
        _, repeated, created = submit_teaching_activity(self.concept, self.user, 'stale', {'text': 'wasnt taught'}, 'gap')
        self.assertFalse(created)
        self.assertEqual(repeated, result)
        self.assertEqual(result['controller_action'], 'BRIDGE_MISSING_KNOWLEDGE')
        self.assertEqual(EncounterAttempt.objects.count(), 0)

    def test_bad_existing_objective_is_regenerated_before_planning(self):
        from learning.material_grounding import objective_grounding
        self.session.objectives = [{'id': 'bad', 'text': 'Explain this source statement.', 'knowledge_ids': ['page:page-1']}]
        self.session.save()
        plan = get_or_create_teaching_plan(self.session, objective_grounding(self.concept), allow_ai=False)
        self.assertNotEqual(self.session.objectives[0]['id'], 'bad')
        self.assertIn('bad', self.session.state['invalidated_objectives'])
        self.assertEqual(plan['objective_id'], self.session.objectives[0]['id'])

    def test_older_v2_record_rebuild_preserves_page_provenance(self):
        from learning.material_grounding import resource_knowledge
        resource = self.concept.source_resource
        old = build_understanding('Old source', '[PAGE_4_START]Gas exchange means diffusion across a respiratory surface.[PAGE_4_END]')
        old.pop('pedagogy_revision')
        old['knowledge'].pop('knowledge_objects')
        resource.source_understanding = old
        resource.save()
        rebuilt = resource_knowledge(resource)
        self.assertEqual(rebuilt['version'], 2)
        self.assertEqual(rebuilt['pedagogy_revision'], 1)
        self.assertEqual(rebuilt['pages'][0]['number'], 4)
        self.assertTrue(rebuilt['knowledge']['knowledge_objects'])
