import copy
import json
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings

from library.pedagogical_knowledge import REVISION, learner_preview, objectives_from_knowledge
from library.source_understanding import build_understanding, grounding_bundle
from learning.material_grounding import resource_knowledge
from learning.teaching_plan import generate_teaching_plan, teaching_plan_fingerprint
from learning.tutor_engine import deterministic_remediation
from learning.views import _extract_resource_concepts, _generate_preview_structure


def concept(model, title='Stored energy'):
    resource = SimpleNamespace(id=7, title='Generic material', source_understanding=model, ai_concepts=[])
    return SimpleNamespace(id='concept', title=title, source_resource=resource, source_resource_id=7,
        source_page=None, source_section='', summary='', description='', difficulty='medium',
        knowledge_binding={}, path=SimpleNamespace(goal='Understand the material', subject=''))


CURRENT_SOURCE = ('Momentum means mass multiplied by velocity for a moving object in a measured reference frame. '
                  'Velocity refers to displacement measured per unit time along a stated direction of travel. '
                  'A net force causes momentum to change over the time interval during which that force acts. '
                  'A larger net force produces a larger change in momentum when the same interval is considered. '
                  'Predicting later motion requires the initial momentum, the net force, and the duration of the force. '
                  'These supported relationships allow a learner to calculate and explain changes in motion from measured quantities.')


class ProductionPathConvergenceTests(SimpleTestCase):
    def test_metadata_heading_cannot_become_learner_concept(self):
        model = build_understanding('Packet', 'SAMPLE EDITIONS\nPublished by Example Press\nStored energy means energy retained for later use.\nStored energy can drive a later process.')
        titles = [item['title'] for item in learner_preview(model)['concepts']]
        self.assertNotIn('SAMPLE EDITIONS', titles)
        self.assertIn('Stored energy', titles)

    def test_preview_count_comes_from_validated_knowledge(self):
        model = build_understanding('Packet', 'ARCHIVE COPY\nForce means a push or pull on an object.\nAcceleration changes when net force changes.')
        preview = learner_preview(model)
        self.assertEqual(preview['concept_count'], len(model['learner_concepts']))
        self.assertEqual(preview['count_source'], 'validated_knowledge_objects')
        self.assertNotEqual(preview['concept_count'], 1 if model.get('topics') else 0)

    def test_scope_prose_never_becomes_objective(self):
        model = build_understanding('Packet', 'Topic briefly describes the outline of several structures.\nPressure means force distributed over area.\nPressure changes when the same force acts over a different area.')
        objectives = objectives_from_knowledge(grounding_bundle(model, 'pressure force area'))
        self.assertTrue(objectives)
        self.assertNotIn('briefly describes', json.dumps(objectives).lower())

    def test_adjacent_lowercase_block_reconstructs_split_proposition(self):
        pages = [{'number': 1, 'text': 'A catalyst increases reaction rate by'},
                 {'number': 2, 'text': 'lowering the activation barrier.'}]
        model = build_understanding('Packet', '', pages=pages)
        texts = [item['text'] for item in model['knowledge']['knowledge_objects']]
        self.assertIn('A catalyst increases reaction rate by lowering the activation barrier.', texts)
        joined = next(item for item in model['knowledge']['knowledge_objects'] if item['text'] == texts[0])
        self.assertEqual(len(joined['source_refs']), 2)

    def test_unreconstructable_truncation_is_rejected(self):
        model = build_understanding('Packet', 'A catalyst increases reaction rate and')
        self.assertEqual(model['knowledge']['knowledge_objects'], [])

    def test_lexical_overlap_cannot_create_connect_moment(self):
        model = build_understanding('Packet', 'A secure cache stores signed objects.\nA storage object records a checksum for verification.')
        grounding = grounding_bundle(model, 'storage object')
        objective = objectives_from_knowledge(grounding)[0]
        plan = generate_teaching_plan(concept(model, objective['text']), objective, grounding, allow_ai=False)
        rendered = json.dumps(plan)
        self.assertNotIn('connect through', rendered.lower())
        self.assertNotIn('CONNECT', [moment['arc_phase'] for moment in plan['teaching_moments']])

    def test_check_names_one_capability_and_knowledge_id(self):
        model = build_understanding('Packet', 'Momentum means mass multiplied by velocity.')
        grounding = grounding_bundle(model, 'momentum')
        objective = objectives_from_knowledge(grounding)[0]
        plan = generate_teaching_plan(concept(model, 'Momentum'), objective, grounding, allow_ai=False)
        check = plan['teaching_moments'][-1]
        self.assertEqual(check['tests'], objective['knowledge_ids'][:1])
        self.assertNotIn('other ideas', check['content']['prompt'].lower())

    def test_teaching_body_adds_information_beyond_title(self):
        model = build_understanding('Packet', 'Momentum means mass multiplied by velocity.')
        grounding = grounding_bundle(model, 'momentum')
        objective = objectives_from_knowledge(grounding)[0]
        plan = generate_teaching_plan(concept(model, 'Momentum'), objective, grounding, allow_ai=False)
        moment = plan['teaching_moments'][0]
        self.assertNotEqual(moment['content']['title'].casefold(), moment['content']['body'].casefold())

    def test_current_resource_uses_knowledge_bindings_without_legacy(self):
        model = build_understanding('Packet', CURRENT_SOURCE)
        rows = _extract_resource_concepts(SimpleNamespace(id=4, title='Packet', source_understanding=model, ai_concepts=[]))
        self.assertTrue(rows)
        self.assertTrue(all(row['knowledge_binding']['concept_source'] == 'validated_knowledge_objects' for row in rows))
        self.assertTrue(all(row['knowledge_binding']['revision'].startswith(f'2:{REVISION}:') for row in rows))

    def test_validated_zone_name_comes_from_bound_concept(self):
        model = build_understanding('Packet', CURRENT_SOURCE)
        rows = _extract_resource_concepts(SimpleNamespace(id=4, title='Packet', source_understanding=model, ai_concepts=[]))
        preview = _generate_preview_structure('Learn mechanics', rows, 'standard')
        first = preview['units'][0]
        expected = first['concepts'][0]['title'] if len(first['concepts']) == 1 else f"{first['concepts'][0]['title']} and related concepts"
        self.assertEqual(first['title'], expected)

    def test_revision_changes_invalidate_plan_fingerprint(self):
        model = build_understanding('Packet', 'Momentum means mass multiplied by velocity.')
        grounding = grounding_bundle(model, 'momentum')
        objective = objectives_from_knowledge(grounding)[0]
        item = concept(model, 'Momentum')
        first = teaching_plan_fingerprint(item, objective, grounding)
        changed = copy.deepcopy(grounding); changed['pedagogy_revision'] += 1
        self.assertNotEqual(first, teaching_plan_fingerprint(item, objective, changed))

    def test_targeted_remediation_changes_representation(self):
        model = build_understanding('Packet', 'Momentum means mass multiplied by velocity.')
        grounding = grounding_bundle(model, 'momentum')
        objective = objectives_from_knowledge(grounding)[0]
        item = concept(model, 'Momentum')
        plan = generate_teaching_plan(item, objective, grounding, allow_ai=False)
        session = SimpleNamespace(concept=item, state={'teaching_plans': {objective['id']: {'plan': plan, 'grounding_input': grounding}}})
        activity = {'tutor': {'tests': objective['knowledge_ids'][:1]}, 'tested_knowledge_ids': objective['knowledge_ids'][:1], 'content': {'expected_answer': plan['teaching_moments'][-1]['content']['expected_answer']}}
        remediation = deterministic_remediation(session, objective, activity, {'text': 'momentum'})
        self.assertEqual(remediation['teaching_moments'][0]['representation'], 'EVIDENCE_HIGHLIGHT')
        self.assertEqual(remediation['diagnosed_gap'], 'named_topic_without_explanation')


class LegacyIsolationTests(TestCase):
    def test_only_unreconstructable_old_resource_uses_legacy_concepts(self):
        from library.models import Resource
        user = get_user_model().objects.create_user(username='legacy-isolation')
        resource = Resource.objects.create(owner=user, title='Old', ai_concepts=[{'title': 'Archived concept', 'description': 'Legacy only'}])
        self.assertEqual(_extract_resource_concepts(resource)[0]['title'], 'Archived concept')
        resource.source_understanding = {'version': 2, 'pages': [{'id': 'page-1', 'text': 'Force means a push or pull.', 'blocks': [], 'number': 1}]}
        resource.save()
        rebuilt = resource_knowledge(resource)
        self.assertEqual(rebuilt['pedagogy_revision'], REVISION)

    def test_stale_persisted_journey_rebinds_and_invalidates_session_cache(self):
        from library.models import Resource
        from learning.models import ConceptNode, LearningPath, TeachingSession, Unit
        from learning.views import _get_teaching_session
        user = get_user_model().objects.create_user(username='stale-binding')
        model = build_understanding('Packet', CURRENT_SOURCE)
        resource = Resource.objects.create(owner=user, title='Packet', source_understanding=model)
        path = LearningPath.objects.create(user=user, title='Old route')
        unit = Unit.objects.create(path=path, title='ARCHIVE COPY')
        node = ConceptNode.objects.create(path=path, unit=unit, source_resource=resource, title='ARCHIVE COPY',
            knowledge_binding={'revision': '2:1:old', 'knowledge_ids': ['page:page-1']})
        TeachingSession.objects.create(user=user, concept=node, objectives=[{'id': 'old', 'text': 'ARCHIVE COPY'}],
            state={'teaching_plans': {'old': {'plan': {}}}, 'player': {'current_stage_id': 'old:intro'}})
        session = _get_teaching_session(node, user)
        node.refresh_from_db(); unit.refresh_from_db()
        self.assertEqual(node.knowledge_binding['concept_source'], 'validated_knowledge_objects')
        self.assertNotEqual(node.title, 'ARCHIVE COPY')
        self.assertEqual(unit.title, node.title)
        self.assertEqual(session.state['teaching_plans'], {})
        self.assertEqual(session.state['player'], {})
