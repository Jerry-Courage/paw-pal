from copy import deepcopy
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from library.models import Resource
from library.pedagogical_knowledge import REVISION, learner_concepts, understanding_revision
from library.source_understanding import build_understanding
from learning.material_grounding import grounded_objectives
from learning.models import ConceptNode, EncounterAttempt, LearningPath, TeachingSession
from learning.views import _objective_activities
from learning.teaching_plan import TeachingPlanValidationError


SOURCE = (
    'A queue stores items until a consumer can process them. '
    'A first-in first-out queue removes the oldest stored item first. '
    'Backpressure limits producers when consumers cannot keep up.'
)


@override_settings(JOURNEY_TEACHING_AI_ENABLED=False)
class InteractionConvergenceTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='interaction-learner')
        model = build_understanding('Queue processing', SOURCE)
        resource = Resource.objects.create(owner=self.user, title='Queue processing', status='ready',
                                           has_study_kit=True, source_understanding=model)
        path = LearningPath.objects.create(user=self.user, title='Queue Journey')
        selected = learner_concepts(model)[0]
        self.concept = ConceptNode.objects.create(
            path=path, title=selected['title'], source_resource=resource, order_index=0,
            knowledge_binding={'revision': understanding_revision(model),
                               'knowledge_ids': selected['knowledge_ids'],
                               'concept_source': 'validated_knowledge_objects'},
        )
        self.session = TeachingSession.objects.create(
            user=self.user, concept=self.concept, objectives=grounded_objectives(self.concept),
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def activate_check(self):
        activities = _objective_activities(self.session, self.user)
        check = next(item for item in reversed(activities) if item.get('purpose') == 'check')
        objective_id = check['objective_id']
        completed = [f'{objective_id}:intro'] + [
            f"{item['objective_id']}:{item['id']}" for item in activities if item['id'] != check['id']
        ]
        self.session.state = {
            **self.session.state,
            'teaching_phase': 'CHECK',
            'player': {'objective_id': objective_id, 'objective_index': 0,
                       'stage_sequence': [*completed, f"{objective_id}:{check['id']}"],
                       'completed_stage_ids': completed,
                       'current_stage_id': f"{objective_id}:{check['id']}",
                       'active_activity_id': check['id']},
        }
        self.session.status = 'practicing'
        self.session.save()
        return check

    def submit(self, check, answer, key, revision=None):
        if revision is None:
            current_session = TeachingSession.objects.get(pk=self.session.pk)
            revision = current_session.state['teaching_plans'][check['objective_id']]['plan']['plan_revision']
        return self.client.post(
            f'/api/learning/concepts/{self.concept.id}/teaching-response/',
            {'activity_id': check['id'], 'response': {'text': answer}, 'idempotency_key': key,
             'objective_id': check['objective_id'], 'moment_id': check['tutor']['moment_id'],
             'plan_revision': revision},
            format='json',
        )

    def test_correct_answer_returns_explicit_advance_contract(self):
        check = self.activate_check()
        answer = check['content']['expected_answer']
        response = self.submit(check, answer, 'correct-once')
        self.assertEqual(response.status_code, 201, response.data)
        submission = response.data['submission']
        self.assertEqual(submission['outcome'], 'correct')
        self.assertEqual(submission['next_action'], 'ADVANCE')
        self.assertTrue(submission['progression_unlocked'])
        self.assertFalse(submission['state_reset'])
        self.assertEqual(submission['objective_id'], check['objective_id'])
        self.assertEqual(submission['tested_knowledge_ids'], check['tested_knowledge_ids'])

    def test_incorrect_answer_keeps_objective_and_enters_pinned_remediation(self):
        check = self.activate_check()
        response = self.submit(check, 'A disconnected claim that does not establish the requested relationship.', 'wrong-once')
        self.assertEqual(response.status_code, 201, response.data)
        submission = response.data['submission']
        self.assertIn(submission['outcome'], {'incorrect', 'partial'})
        self.assertEqual(submission['next_action'], 'REMEDIATE')
        self.assertTrue(submission['remediation_requested'])
        self.assertNotEqual(submission['next_stage']['type'], 'FLOW_INTRO')
        self.assertEqual(submission['next_stage']['objective_id'], check['objective_id'])
        self.assertTrue(submission['feedback'])
        session = TeachingSession.objects.get(pk=self.session.pk)
        cached = session.state['teaching_plans'][check['objective_id']]
        self.assertTrue(cached['remediation_active'])
        self.assertEqual(session.state['player']['current_stage_id'], submission['next_stage']['id'])

    def test_dont_know_is_ungraded_and_reteaches_without_intro_reset(self):
        check = self.activate_check()
        response = self.submit(check, "I don't know", 'learning-signal')
        self.assertEqual(response.status_code, 201)
        submission = response.data['submission']
        self.assertEqual(submission['outcome'], 'learning_signal')
        self.assertEqual(submission['next_action'], 'RETEACH')
        self.assertEqual(submission['attempt']['status'], 'ungraded')
        self.assertTrue(submission['remediation_requested'])
        self.assertNotEqual(submission['next_stage']['type'], 'FLOW_INTRO')
        self.assertEqual(EncounterAttempt.objects.count(), 0)

    def test_empty_answer_stays_on_current_check_for_retry(self):
        check = self.activate_check()
        response = self.submit(check, '', 'empty-answer')
        self.assertEqual(response.status_code, 201)
        submission = response.data['submission']
        self.assertEqual(submission['outcome'], 'insufficient')
        self.assertEqual(submission['next_action'], 'RETRY_CHECK')
        self.assertEqual(submission['next_stage']['activity_id'], check['id'])
        self.assertFalse(submission['state_reset'])
        self.assertTrue(submission['feedback'])

    def test_duplicate_submission_is_idempotent(self):
        check = self.activate_check()
        first = self.submit(check, 'A disconnected claim that cannot satisfy this check.', 'same-request')
        player_after_first = deepcopy(TeachingSession.objects.get(pk=self.session.pk).state['player'])
        repeated = self.submit(check, 'A different answer must not create another attempt.', 'same-request')
        self.assertEqual(first.status_code, 201)
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(repeated.data['submission']['attempt']['id'], first.data['submission']['attempt']['id'])
        self.assertEqual(repeated.data['submission']['outcome'], first.data['submission']['outcome'])
        self.assertFalse(repeated.data['submission']['attempt']['created'])
        self.assertEqual(EncounterAttempt.objects.count(), 1)
        self.assertEqual(repeated.data['submission']['next_stage'], first.data['submission']['next_stage'])
        self.assertEqual(TeachingSession.objects.get(pk=self.session.pk).state['player'], player_after_first)

    def test_stale_stage_is_recoverable_and_preserves_player_position(self):
        check = self.activate_check()
        before = deepcopy(TeachingSession.objects.get(pk=self.session.pk).state['player'])
        response = self.client.post(
            f'/api/learning/concepts/{self.concept.id}/teaching-response/',
            {'activity_id': 'missing-moment', 'response': {'text': 'An answer remains local.'},
             'idempotency_key': 'stale-stage'}, format='json',
        )
        self.assertEqual(response.status_code, 404)
        self.assertTrue(response.data['recoverable'])
        self.assertEqual(response.data['next_action'], 'RETRY')
        self.assertEqual(TeachingSession.objects.get(pk=self.session.pk).state['player'], before)

    def test_stale_plan_revision_is_a_recoverable_conflict(self):
        check = self.activate_check()
        before = deepcopy(TeachingSession.objects.get(pk=self.session.pk).state['player'])
        response = self.submit(check, 'The answer stays editable.', 'stale-revision', revision=999)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data['error'], 'stale_plan_revision')
        self.assertTrue(response.data['recoverable'])
        self.assertEqual(response.data['next_action'], 'REFRESH_SESSION')
        self.assertEqual(TeachingSession.objects.get(pk=self.session.pk).state['player'], before)

    def test_resource_preview_uses_current_pedagogical_concept_count(self):
        response = self.client.get(f'/api/library/resources/{self.concept.source_resource_id}/')
        preview = response.data['material_understanding']
        model = self.concept.source_resource.source_understanding
        self.assertEqual(preview['concept_count'], len(learner_concepts(model)))
        self.assertEqual(preview['count_source'], 'validated_knowledge_objects')
        self.assertEqual(preview['learner_topic_count'], len(learner_concepts(model)))
        self.assertGreaterEqual(preview['knowledge_object_count'], preview['learner_topic_count'])
        self.assertTrue(preview['current'])

    def test_cached_lesson_open_does_not_generate_tutor_plan(self):
        self.activate_check()
        with patch('learning.teaching_plan.generate_teaching_plan') as generate, \
             patch('django_q.tasks.async_task'):
            response = self.client.get(f'/api/learning/concepts/{self.concept.id}/teaching-session/')
        self.assertEqual(response.status_code, 200)
        generate.assert_not_called()

    def test_check_submission_does_not_regenerate_base_plan(self):
        check = self.activate_check()
        with patch('learning.teaching_plan.generate_teaching_plan') as generate:
            response = self.submit(check, check['content']['expected_answer'], 'fast-correct')
        self.assertEqual(response.status_code, 201)
        generate.assert_not_called()

    def test_incorrect_answer_preserves_cached_base_plan(self):
        check = self.activate_check()
        before = deepcopy(TeachingSession.objects.get(pk=self.session.pk).state['teaching_plans'][check['objective_id']]['plan'])
        response = self.submit(check, 'This does not establish the tested relationship.', 'base-preserved')
        self.assertEqual(response.status_code, 201)
        cached = TeachingSession.objects.get(pk=self.session.pk).state['teaching_plans'][check['objective_id']]
        self.assertEqual(cached['base_plan'], before)
        self.assertTrue(cached['remediation_active'])

    def test_internal_remediation_validation_error_is_not_returned(self):
        check = self.activate_check()
        internal = 'Evidence quotation is not in cited source'
        with patch('learning.views._activate_remediation_plan', side_effect=TeachingPlanValidationError(internal)):
            response = self.submit(check, 'An unsupported answer.', 'hidden-validation')
        self.assertEqual(response.status_code, 422)
        self.assertNotIn(internal, response.data['message'])
        self.assertIn('place and answer', response.data['message'])

    def test_next_objective_prefetch_is_bounded_and_idempotent(self):
        session = TeachingSession.objects.get(pk=self.session.pk)
        if len(session.objectives) < 2:
            session.objectives.append({'id': 'next-objective', 'text': 'Apply queue backpressure.', 'knowledge_ids': []})
            session.save(update_fields=['objectives', 'last_active_at'])
        from learning.tasks import queue_journey_lesson
        with patch('django_q.tasks.async_task') as queued:
            self.assertTrue(queue_journey_lesson(session, 1))
            session.refresh_from_db()
            self.assertFalse(queue_journey_lesson(session, 1))
        self.assertEqual(queued.call_count, 1)

    def test_first_lesson_is_queued_when_journey_becomes_visible(self):
        resource = Resource.objects.get(pk=self.concept.source_resource_id)
        model = deepcopy(resource.source_understanding)
        model['quality'] = {**model.get('quality', {}), 'status': 'ready'}
        resource.source_understanding = model
        resource.save(update_fields=['source_understanding', 'updated_at'])
        with patch('django_q.tasks.async_task') as queued, self.captureOnCommitCallbacks(execute=True):
            response = self.client.post('/api/learning/paths/build/', {
                'goal': 'Understand queue processing',
                'title': 'Prepared queue Journey',
                'resources': [self.concept.source_resource_id],
                'depth': 'quick',
            }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(any(call.args[0] == 'learning.tasks.prepare_journey_lesson' for call in queued.call_args_list))

    def test_knowledge_objects_are_grouped_into_learner_topics(self):
        objects = [
            {'id': 'k1', 'accepted': True, 'text': 'Queue buffering means storing items until a consumer processes them.',
             'concept': 'Queue buffering', 'semantic_type': 'DEFINITION', 'source_refs': []},
            {'id': 'k2', 'accepted': True, 'text': 'Queue buffering separates producer speed from consumer speed.',
             'concept': 'Queue buffering', 'semantic_type': 'CAUSE_EFFECT', 'source_refs': []},
        ]
        topics = learner_concepts({'pedagogy_revision': REVISION, 'knowledge': {'knowledge_objects': objects}})
        self.assertEqual(len(objects), 2)
        self.assertEqual(len(topics), 1)
        self.assertEqual(topics[0]['knowledge_ids'], ['k1', 'k2'])
