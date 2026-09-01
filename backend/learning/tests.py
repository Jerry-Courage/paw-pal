from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.urls import resolve
from rest_framework.test import APIClient
from unittest.mock import patch

from library.models import Resource
from gamification.models import XPTransaction
from learning.completion import evaluate_session_completion, record_objective_evidence
from learning.models import ConceptNode, EncounterAttempt, LearningPath, TeachingSession, TeachingTurn, Unit
from learning.views import _concept_activities, _objective_activities, _valid_activity


class LearningPathRouteTests(SimpleTestCase):
    def test_generate_preview_resolves_to_collection_post_action(self):
        match = resolve('/api/learning/paths/generate-preview/')

        self.assertEqual(match.url_name, 'learningpath-generate-preview-explicit')
        self.assertEqual(match.func.actions, {'post': 'generate_preview'})


class ActiveJourneySelectionTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(email='active@example.com', username='active', password='test-pass-123')
        self.first = LearningPath.objects.create(user=self.user, title='First', status='active')
        self.second = LearningPath.objects.create(user=self.user, title='Second', status='paused')
        self.client = APIClient(); self.client.force_authenticate(self.user)

    def test_selecting_active_journey_pauses_the_previous_one(self):
        response = self.client.post(f'/api/learning/paths/{self.second.id}/set-active/')
        self.assertEqual(response.status_code, 200)
        self.first.refresh_from_db(); self.second.refresh_from_db()
        self.assertEqual(self.first.status, 'paused')
        self.assertEqual(self.second.status, 'active')


class JourneyBuildRegressionTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email='journey@example.com', username='journey', password='test-pass-123'
        )
        self.resource = Resource.objects.create(
            owner=self.user,
            title='Linear Systems',
            status='ready',
            has_study_kit=True,
            ai_concepts=[
                {'title': f'Concept {index}', 'difficulty': 'medium'}
                for index in range(1, 7)
            ],
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_build_persists_one_complete_ordered_graph(self):
        response = self.client.post('/api/learning/paths/build/', {
            'title': 'Linear Systems Journey',
            'goal': 'Understand and explain linear systems',
            'resources': [self.resource.id],
            'depth': 'quick',
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(LearningPath.objects.count(), 1)

        path = LearningPath.objects.get()
        self.assertEqual(path.goal, 'Understand and explain linear systems')
        self.assertEqual(path.depth, 'quick')
        self.assertEqual(path.units.count(), response.data['units'].__len__())
        self.assertGreater(Unit.objects.filter(path=path).count(), 0)

        nodes = list(ConceptNode.objects.filter(path=path).order_by('order_index'))
        self.assertEqual([node.order_index for node in nodes], list(range(len(nodes))))
        self.assertTrue(all(node.source_resource_id == self.resource.id for node in nodes))
        self.assertEqual(nodes[0].status, 'current')
        self.assertTrue(all(node.status == 'locked' for node in nodes[1:]))
        for previous, node in zip(nodes, nodes[1:]):
            self.assertEqual(list(node.prerequisites.values_list('id', flat=True)), [previous.id])

        self.assertEqual(response.data['id'], str(path.id))


class EncounterEvidenceTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email='encounter@example.com', username='encounter', password='test-pass-123'
        )
        self.path = LearningPath.objects.create(
            user=self.user, title='Biology Journey', goal='Prepare for my biology exam', depth='standard'
        )
        self.unit = Unit.objects.create(path=self.path, title='Cell Systems', order_index=0)
        self.concept = ConceptNode.objects.create(
            path=self.path, unit=self.unit, title='Cell membrane', summary='The cell membrane controls what enters and leaves the cell.',
            description='A selectively permeable boundary.', order_index=0, status='current'
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_activities_are_goal_adaptive_and_attempt_is_server_scored(self):
        response = self.client.get(f'/api/learning/concepts/{self.concept.id}/activities/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['goal_mode'], 'exam')
        self.assertEqual(response.data['depth'], 'standard')
        self.assertEqual([item['purpose'] for item in response.data['activities']], ['diagnose', 'learn', 'apply', 'check', 'reflect'])
        self.assertTrue(all(item.get('grounding') is not None for item in response.data['activities']))
        self.assertTrue(all('correct_choice' not in item for item in response.data['activities']))

        check = next(item for item in response.data['activities'] if item['purpose'] == 'check')
        attempt = self.client.post(f'/api/learning/concepts/{self.concept.id}/attempt/', {
            'activity_id': check['id'], 'response': {'choice': 99},
        }, format='json')
        self.assertEqual(attempt.status_code, 201)
        self.assertFalse(attempt.data['correct'])
        self.assertEqual(attempt.data['score'], 25)
        self.assertEqual(EncounterAttempt.objects.count(), 1)

    def test_iterative_solver_benchmark_is_specific_and_never_exposes_placeholders(self):
        self.concept.title = 'Core Iterative Techniques: Jacobi, Seidel, and SOR'
        self.concept.summary = 'Jacobi uses old iterate values. Gauss-Seidel reuses new values immediately. SOR adds a relaxation factor.'
        self.concept.save(update_fields=['title', 'summary'])

        response = self.client.get(f'/api/learning/concepts/{self.concept.id}/activities/')
        rendered = ' '.join([item['prompt'] + ' ' + ' '.join(item.get('options', [])) for item in response.data['activities']])
        self.assertIn('Jacobi', rendered)
        self.assertIn('Gauss–Seidel', rendered)
        self.assertIn('relaxation factor', rendered)
        self.assertNotIn('Key Concept', rendered)
        self.assertNotIn('unrelated to this material', rendered)
        self.assertIn('ordering', [item['type'] for item in response.data['activities']])
        banned = ['mechanism in the source', 'relationship in the source', 'expected relationship', 'source alignment']
        self.assertFalse(any(phrase.lower() in str(response.data).lower() for phrase in banned))

    def test_wrong_choice_feedback_teaches_the_specific_misconception(self):
        self.concept.title = 'Core Iterative Techniques: Jacobi, Seidel, and SOR'
        self.concept.save(update_fields=['title'])
        diagnostic = next(item for item in _concept_activities(self.concept, self.user) if item['purpose'] == 'diagnose')
        gauss_seidel = diagnostic['options'].index('Gauss–Seidel')
        response = self.client.post(f'/api/learning/concepts/{self.concept.id}/attempt/', {
            'activity_id': diagnostic['id'], 'response': {'choice': gauss_seidel},
        }, format='json')
        self.assertFalse(response.data['correct'])
        self.assertIn('immediately reuses each new value', response.data['feedback'])
        self.assertNotIn('evaluation', response.data['feedback'].lower())

    def test_ordering_is_server_scored_and_private_order_is_hidden(self):
        self.concept.title = 'Core Iterative Techniques: Jacobi, Seidel, and SOR'
        self.concept.save(update_fields=['title'])
        public = self.client.get(f'/api/learning/concepts/{self.concept.id}/activities/').data['activities']
        ordering_public = next(item for item in public if item['type'] == 'ordering')
        self.assertNotIn('correct_order', ordering_public)
        ordering = next(item for item in _concept_activities(self.concept, self.user) if item['type'] == 'ordering')
        response = self.client.post(f'/api/learning/concepts/{self.concept.id}/attempt/', {
            'activity_id': ordering['id'], 'response': {'order': ordering['correct_order']},
        }, format='json')
        self.assertTrue(response.data['correct'])
        self.assertEqual(response.data['score'], 100)

    def test_depth_changes_real_activity_count(self):
        self.path.depth = 'quick'
        self.path.save(update_fields=['depth'])
        quick = self.client.get(f'/api/learning/concepts/{self.concept.id}/activities/').data['activities']
        self.path.depth = 'deep'
        self.path.save(update_fields=['depth'])
        deep = self.client.get(f'/api/learning/concepts/{self.concept.id}/activities/').data['activities']
        self.assertLess(len(quick), len(deep))
        self.assertIn('transfer', [item['purpose'] for item in deep])

    def test_malformed_activity_guard_rejects_generic_or_invalid_choices(self):
        self.assertFalse(_valid_activity({'prompt': 'Which description best fits Key Concept?', 'type': 'mcq', 'options': ['a'], 'correct_choice': 0}))
        self.assertFalse(_valid_activity({'prompt': 'Real question', 'type': 'mcq', 'options': ['a', 'b'], 'correct_choice': 4}))

    def test_retry_persists_each_attempt_and_surfaces_remediation(self):
        check = next(item for item in _concept_activities(self.concept, self.user) if item['purpose'] == 'check')
        wrong = next(index for index in range(len(check['options'])) if index != check['correct_choice'])
        endpoint = f'/api/learning/concepts/{self.concept.id}/attempt/'
        first = self.client.post(endpoint, {'activity_id': check['id'], 'response': {'choice': wrong}}, format='json')
        second = self.client.post(endpoint, {'activity_id': check['id'], 'response': {'choice': wrong}}, format='json')
        self.assertEqual(first.data['attempt_number'], 1)
        self.assertEqual(second.data['attempt_number'], 2)
        self.assertTrue(second.data['recommend_flow'])
        self.assertEqual(EncounterAttempt.objects.count(), 2)
        adapted = self.client.get(f'/api/learning/concepts/{self.concept.id}/activities/').data['activities']
        self.assertIn('remediate', [item['purpose'] for item in adapted])

    def test_successful_retry_drives_mastery_and_reward_is_idempotent(self):
        next_concept = ConceptNode.objects.create(path=self.path, unit=self.unit, title='Transport', order_index=1, status='locked')
        next_concept.prerequisites.add(self.concept)
        check = next(item for item in _concept_activities(self.concept, self.user) if item['purpose'] == 'check')
        endpoint = f'/api/learning/concepts/{self.concept.id}/attempt/'
        wrong = next(index for index in range(len(check['options'])) if index != check['correct_choice'])
        self.client.post(endpoint, {'activity_id': check['id'], 'response': {'choice': wrong}}, format='json')
        self.client.post(endpoint, {'activity_id': check['id'], 'response': {'choice': check['correct_choice']}}, format='json')
        first = self.client.post(f'/api/learning/concepts/{self.concept.id}/complete/', {'score': 0}, format='json')
        second = self.client.post(f'/api/learning/concepts/{self.concept.id}/complete/', {'score': 0}, format='json')
        self.concept.refresh_from_db()
        self.assertEqual(first.status_code, 200)
        self.assertEqual(self.concept.mastery, 100)
        next_concept.refresh_from_db()
        self.assertEqual(next_concept.status, 'current')
        self.assertEqual(first.data['unlocked'], [str(next_concept.id)])
        self.assertEqual(first.data['reward']['xp'], second.data['reward']['xp'])

    def test_unknown_activity_is_not_persisted(self):
        response = self.client.post(f'/api/learning/concepts/{self.concept.id}/attempt/', {
            'activity_id': 'invented', 'response': {'choice': 0},
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(EncounterAttempt.objects.exists())

    @patch('ai_assistant.services.AIService.chat_sync', return_value='**Concise** grounded help.')
    def test_contextual_flow_receives_activity_and_learning_state(self, chat_sync):
        activity = next(item for item in _concept_activities(self.concept, self.user) if item['purpose'] == 'check')
        response = self.client.post(f'/api/learning/concepts/{self.concept.id}/ask-flow/', {
            'action': 'Why was I wrong?', 'stage': 'check', 'activity_id': activity['id'],
            'learner_response': {'choice': 2}, 'correct': False,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        prompt = chat_sync.call_args.args[0][0]['content']
        self.assertIn(self.path.goal, prompt)
        self.assertIn('Depth: standard', prompt)
        self.assertIn(activity['prompt'], prompt)
        self.assertIn("Learner response: {'choice': 2}", prompt)
        self.assertIn('at most 80 words', prompt)
        self.assertIn('patient human tutor', prompt)


class ConversationalTeachingSessionTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(email='flow-session@example.com', username='Jerry', password='test-pass-123', onboarding_status={'completed': True, 'onboarding_v2': {'learner_type': 'university', 'difficulty_areas': ['understanding concepts']}})
        self.resource = Resource.objects.create(owner=self.user, title='Numerical Analysis', subject='Mathematics', status='ready', ai_notes_json={'sections': [{'title': 'Iterative methods', 'page': 14, 'plain_english': 'Jacobi keeps old values for a sweep. Gauss-Seidel reuses new values immediately. SOR controls the size of the update.'}]})
        self.path = LearningPath.objects.create(user=self.user, title='Numerical Analysis Journey', goal='Master iterative solvers for my exam', depth='deep')
        self.unit = Unit.objects.create(path=self.path, title='Stationary Methods', order_index=0)
        self.concept = ConceptNode.objects.create(path=self.path, unit=self.unit, title='Core Iterative Techniques: Jacobi, Gauss-Seidel, and SOR', summary='Jacobi uses old values; Gauss-Seidel reuses fresh values; SOR adds relaxation.', source_resource=self.resource, source_section='Iterative methods', source_page=14, order_index=0, status='current')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.base = f'/api/learning/concepts/{self.concept.id}'

    def _response_for(self, activity, correct=True):
        if activity['type'] in {'predict', 'mcq', 'scenario'}:
            choice = activity['correct_choice'] if correct else next(index for index in range(len(activity['options'])) if index != activity['correct_choice'])
            return {'choice': choice}
        if activity['type'] == 'ordering':
            order = activity['correct_order']
            return {'order': order if correct else list(reversed(order))}
        return {'text': ('Jacobi uses previous values during a sweep while Gauss Seidel immediately reuses each fresh update.' if correct else 'I do not know.')}

    def _active_activity(self, response):
        return next(item['payload']['activity'] for item in reversed(response.data['turns']) if item['payload'].get('activity'))

    def test_session_is_created_lazily_and_resumes_without_duplicate_opening(self):
        first = self.client.get(f'{self.base}/teaching-session/')
        second = self.client.get(f'{self.base}/teaching-session/')
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(TeachingSession.objects.count(), 1)
        self.assertEqual(TeachingTurn.objects.filter(role='flow').count(), 2)
        self.assertIn('Ready to learn', first.data['turns'][0]['content'])
        self.assertEqual(first.data['turns'][-1]['payload']['pedagogical_action'], 'CHECK')
        self.assertEqual(first.data['teaching_phase'], 'CHECK')
        self.assertEqual(self._active_activity(first)['id'], self._active_activity(second)['id'])
        self.assertEqual(TeachingTurn.objects.filter(session__concept=self.concept, role='flow', kind='activity').count(), 1)
        self.assertEqual(len(first.data['objectives']), 6)

    def test_interruption_preserves_resume_point_and_continue_restores_it(self):
        self.client.get(f'{self.base}/teaching-session/')
        started = self.client.post(f'{self.base}/teaching-message/', {'message': "let's go", 'idempotency_key': 'start'}, format='json')
        self.assertEqual(started.data['current_point'], 0)
        interrupted = self.client.post(f'{self.base}/teaching-message/', {'message': "I don't understand that", 'idempotency_key': 'interrupt'}, format='json')
        self.assertEqual(interrupted.data['status'], 'remediation')
        self.assertEqual(interrupted.data['resume_point'], 0)
        resumed = self.client.post(f'{self.base}/teaching-message/', {'message': 'okay continue', 'idempotency_key': 'resume'}, format='json')
        self.assertEqual(resumed.data['status'], 'practicing')
        self.assertEqual(resumed.data['teaching_phase'], 'CHECK')
        self.assertEqual(resumed.data['current_point'], 0)
        self.assertEqual(resumed.data['turns'][-1]['payload']['pedagogical_action'], 'CHECK')
        self.assertTrue(resumed.data['turns'][-1]['payload']['reused'])

    def test_message_idempotency_prevents_duplicate_turns(self):
        self.client.get(f'{self.base}/teaching-session/')
        payload = {'message': 'yes', 'idempotency_key': 'same-message'}
        self.client.post(f'{self.base}/teaching-message/', payload, format='json')
        count = TeachingTurn.objects.count()
        self.client.post(f'{self.base}/teaching-message/', payload, format='json')
        self.assertEqual(TeachingTurn.objects.count(), count)

    def test_activity_response_reuses_attempt_evidence_and_voice_context(self):
        self.client.get(f'{self.base}/teaching-session/')
        self.client.post(f'{self.base}/teaching-message/', {'message': 'yes', 'idempotency_key': 'start'}, format='json')
        activity = next(item for item in _concept_activities(self.concept, self.user) if item['purpose'] == 'apply' and item['type'] != 'ordering')
        response = self.client.post(f'{self.base}/teaching-response/', {'activity_id': activity['id'], 'response': {'choice': activity['correct_choice']}}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data['evaluation']['correct'])
        self.assertEqual(EncounterAttempt.objects.count(), 1)
        voice = self.client.get(f'{self.base}/teaching-voice-context/')
        self.assertEqual(voice.data['teaching_session_id'], response.data['id'])
        self.assertEqual(voice.data['current_teaching_point'], 1)
        self.assertIn('recent_context', voice.data)

    @patch('ai_assistant.youtube_search.search_youtube', return_value=[{'video_id': 'abc', 'title': 'Jacobi vs Gauss-Seidel', 'channel': 'MIT', 'duration': 480, 'duration_str': '8:00', 'thumbnail': 'https://img.youtube.com/vi/abc/mqdefault.jpg', 'url': 'https://www.youtube.com/watch?v=abc'}])
    def test_video_action_contract_and_flashcard_save_reuse_existing_model(self, _search):
        video = self.client.post(f'{self.base}/teaching-message/', {'message': 'show me a video', 'idempotency_key': 'video'}, format='json')
        self.assertEqual(video.data['turns'][-1]['kind'], 'video')
        self.assertEqual(video.data['turns'][-1]['payload']['videos'][0]['video_id'], 'abc')
        cards = [{'question': 'Which values does Jacobi use?', 'answer': 'Values from the previous iterate.', 'difficulty': 'medium'}]
        saved = self.client.post(f'{self.base}/teaching-flashcards/save/', {'cards': cards}, format='json')
        self.assertEqual(saved.status_code, 201)
        self.assertEqual(saved.data['saved'], 1)
        self.assertEqual(self.resource.flashcards.filter(owner=self.user).count(), 1)

    def test_voice_evidence_requires_a_valid_demonstration(self):
        session = self.client.get(f'{self.base}/teaching-session/').data
        objective_id = session['objectives'][0]['id']
        invalid = self.client.post(f'{self.base}/teaching-voice-event/', {
            'event': 'point_understood', 'objective_id': objective_id,
            'summary': 'The learner explained why Jacobi uses old values.',
            'evidence_type': 'explanation', 'evidence_score': 100,
        }, format='json')
        self.assertNotIn(objective_id, invalid.data['objectives_understood'])
        voice_turn = TeachingTurn.objects.create(
            session=TeachingSession.objects.get(id=session['id']), role='system', kind='voice',
            content='Verified voice demonstration.',
            payload={'verified_evidence': {
                'server_verified': True, 'objective_id': objective_id,
                'evidence_type': 'explanation', 'score': 86,
            }},
        )
        valid = self.client.post(f'{self.base}/teaching-voice-event/', {
            'event': 'point_understood', 'objective_id': objective_id,
            'evidence_type': 'prediction', 'evidence_score': 0, 'evidence_id': str(voice_turn.id),
        }, format='json')
        self.assertIn(objective_id, valid.data['objectives_understood'])
        objective = valid.data['completion_evaluation']['objectives'][0]
        self.assertTrue(objective['satisfied'])

    def _satisfy_all_objectives(self, score=88, feynman=True):
        session = TeachingSession.objects.get(user=self.user, concept=self.concept)
        for index, objective in enumerate(session.objectives):
            record_objective_evidence(session, objective['id'], taught=True, interaction=True, score=score, source='activity', evidence_id=f'attempt-{index}')
            session.objectives_covered = list(dict.fromkeys([*session.objectives_covered, objective['id']]))
            session.objectives_understood = list(dict.fromkeys([*session.objectives_understood, objective['id']]))
        if feynman:
            session.state = {**session.state, 'feynman_evidence': {'server_verified': True, 'score': score, 'passed': True, 'critical_misconceptions': [], 'feedback': 'Verified in test.', 'dimensions': {}}}
        session.save()
        return session

    def test_objectives_alone_reach_feynman_but_cannot_complete(self):
        self.client.get(f'{self.base}/teaching-session/')
        session = self._satisfy_all_objectives(feynman=False)
        evaluation = evaluate_session_completion(session)
        self.assertFalse(evaluation['complete'])
        self.assertTrue(evaluation['normal_requirements_met'])
        self.assertEqual(evaluation['recommended_next_action'], 'start_feynman')
        self.assertEqual(self.client.post(f'{self.base}/teaching-completion/', format='json').status_code, 409)

    def test_feynman_score_is_server_derived_and_text_fallback_persists(self):
        self.client.get(f'{self.base}/teaching-session/')
        self._satisfy_all_objectives(feynman=False)
        response = self.client.post(f'{self.base}/feynman-evaluation/', {
            'explanation': 'Jacobi uses old values during each iteration because updates wait for the next sweep, while Gauss Seidel uses fresh values immediately and SOR controls relaxation.',
            'source': 'text', 'score': 100, 'idempotency_key': 'feynman-text',
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertNotEqual(response.data['result']['score'], 100)
        self.assertTrue(response.data['result']['server_verified'])
        self.assertEqual(TeachingTurn.objects.filter(session__concept=self.concept, idempotency_key='feynman-text').count(), 1)

    def test_failed_feynman_remediates_and_retry_is_idempotent(self):
        self.client.get(f'{self.base}/teaching-session/')
        self._satisfy_all_objectives(feynman=False)
        failed = self.client.post(f'{self.base}/feynman-evaluation/', {'explanation': 'It is a thing that does some useful calculations.', 'source': 'voice', 'idempotency_key': 'weak'}, format='json')
        self.assertFalse(failed.data['result']['passed'])
        self.assertEqual(failed.data['status'], 'remediation')
        count = TeachingTurn.objects.count()
        retry = self.client.post(f'{self.base}/feynman-evaluation/', {'explanation': 'It is a thing that does some useful calculations.', 'source': 'voice', 'idempotency_key': 'weak'}, format='json')
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(TeachingTurn.objects.count(), count)

    def test_critical_misconception_blocks_passing_feynman(self):
        self.client.get(f'{self.base}/teaching-session/')
        session = self._satisfy_all_objectives(feynman=False)
        session.unresolved_misconceptions = ['Jacobi uses fresh values immediately.']
        session.save()
        response = self.client.post(f'{self.base}/feynman-evaluation/', {'explanation': 'Jacobi iteration uses old values for a sweep because calculations update an approximation and Gauss Seidel uses fresh values.', 'source': 'text'}, format='json')
        self.assertEqual(response.status_code, 409)
        self.assertFalse(response.data['complete'])

    def test_acknowledgement_moves_to_check_instead_of_repeating_explanation(self):
        self.client.get(f'{self.base}/teaching-session/')
        response = self.client.post(f'{self.base}/teaching-message/', {'message': 'got it', 'idempotency_key': 'ack'}, format='json')
        turn = response.data['turns'][-1]
        self.assertEqual(turn['payload']['pedagogical_action'], 'CHECK')
        self.assertTrue(turn['payload']['reused'])
        self.assertEqual(TeachingTurn.objects.filter(session__concept=self.concept, role='flow', kind='activity').count(), 1)
        self.assertEqual(EncounterAttempt.objects.count(), 0)
        repeated = self.client.post(f'{self.base}/teaching-message/', {'message': 'ok', 'idempotency_key': 'ack-again'}, format='json')
        repeated_turn = next(item for item in repeated.data['turns'] if item['id'] == repeated.data['new_turn_id'])
        self.assertTrue(repeated_turn['payload']['reused'])
        self.assertEqual(repeated_turn['payload']['active_activity_id'], turn['payload']['active_activity_id'])
        self.assertEqual(TeachingTurn.objects.filter(session__concept=self.concept, role='flow', kind='activity').count(), 1)

    def test_ok_and_whats_next_route_to_native_check(self):
        for message, key in [('ok', 'ok'), ("what's next", 'next')]:
            session = TeachingSession.objects.filter(user=self.user, concept=self.concept).first()
            if session:
                session.turns.all().delete()
                session.delete()
            self.client.get(f'{self.base}/teaching-session/')
            if message == "what's next":
                session = TeachingSession.objects.get(user=self.user, concept=self.concept)
                session.state = {**session.state, 'teaching_phase': 'ADVANCE'}
                session.save(update_fields=['state'])
            response = self.client.post(f'{self.base}/teaching-message/', {'message': message, 'idempotency_key': key}, format='json')
            turn = response.data['turns'][-1]
            self.assertEqual(turn['payload']['pedagogical_action'], 'CHECK', message)
            self.assertTrue(turn['payload']['reused'], message)
            self.assertNotIn('numerical analysis is essentially', turn['content'].lower())
            self.assertEqual(TeachingTurn.objects.filter(session__concept=self.concept, role='flow', kind='activity').count(), 1)
            self.assertEqual(EncounterAttempt.objects.count(), 0)
            self.assertEqual(response.data['current_point'], 0)
            self.assertEqual(response.data['completion_evaluation']['objectives_satisfied'], 0)

    def test_initial_start_proactively_presents_small_check(self):
        response = self.client.post(f'{self.base}/teaching-message/', {'message': "let's go", 'idempotency_key': 'start-check'}, format='json')
        turn = response.data['turns'][-1]
        self.assertEqual(response.data['teaching_phase'], 'CHECK')
        self.assertTrue(turn['payload']['reused'])
        self.assertIn(self._active_activity(response)['purpose'], {'check', 'apply', 'transfer'})

    def test_wrong_evidence_remediates_with_different_representation(self):
        check = self.client.post(f'{self.base}/teaching-message/', {'message': 'ok', 'idempotency_key': 'check'}, format='json')
        activity = self._active_activity(check)
        private = next(item for item in _concept_activities(self.concept, self.user) if item['id'] == activity['id'])
        response = self.client.post(f'{self.base}/teaching-response/', {'activity_id': activity['id'], 'response': self._response_for(private, correct=False)}, format='json')
        turn = response.data['turns'][-1]
        self.assertEqual(response.data['teaching_phase'], 'REMEDIATE')
        self.assertEqual(turn['payload']['pedagogical_action'], 'REMEDIATE')
        self.assertIn(turn['payload']['activity']['type'], {'worked_example', 'comparison'})
        self.assertEqual(response.data['completion_evaluation']['objectives_satisfied'], 0)

    def test_correct_evidence_updates_progress_and_selects_next_objective(self):
        check = self.client.post(f'{self.base}/teaching-message/', {'message': "what's next", 'idempotency_key': 'check'}, format='json')
        activity = self._active_activity(check)
        private = next(item for item in _concept_activities(self.concept, self.user) if item['id'] == activity['id'])
        response = self.client.post(f'{self.base}/teaching-response/', {'activity_id': activity['id'], 'response': self._response_for(private)}, format='json')
        evaluation = response.data['completion_evaluation']
        self.assertEqual(evaluation['objectives_satisfied'], 1)
        self.assertEqual(response.data['current_point'], 1)
        self.assertEqual(response.data['teaching_phase'], 'INTRODUCE')
        self.assertEqual(response.data['turns'][-1]['payload']['pedagogical_action'], 'ADVANCE')
        self.assertIn(response.data['objectives'][1]['text'], response.data['turns'][-1]['content'])
        self.assertEqual(round(evaluation['objectives_satisfied'] / evaluation['objectives_total'] * 100), 17)

    def test_explicit_explain_again_still_allows_teaching(self):
        response = self.client.post(f'{self.base}/teaching-message/', {'message': 'explain that again', 'idempotency_key': 'again'}, format='json')
        turn = response.data['turns'][-1]
        self.assertEqual(response.data['teaching_phase'], 'TEACH')
        self.assertEqual(turn['payload']['pedagogical_action'], 'EXPLAIN')

    def test_is_that_all_uses_authoritative_completion_state(self):
        self.client.get(f'{self.base}/teaching-session/')
        response = self.client.post(f'{self.base}/teaching-message/', {'message': 'Is that all?', 'idempotency_key': 'completeness'}, format='json')
        turn = response.data['turns'][-1]
        self.assertIn('completion_evaluation', turn['payload'])
        self.assertEqual(turn['payload']['completion_evaluation']['objectives_satisfied'], 0)
        self.assertNotIn('yes — the evidence is there', turn['content'].lower())

    def test_quiz_me_returns_native_activity_turn(self):
        response = self.client.post(f'{self.base}/teaching-message/', {'message': 'I need a quiz on this', 'idempotency_key': 'native-quiz'}, format='json')
        turn = next(item for item in response.data['turns'] if item['id'] == response.data['new_turn_id'])
        self.assertEqual(turn['payload']['pedagogical_action'], 'CHECK')
        self.assertTrue(turn['payload']['reused'])
        self.assertIn('activity', next(item['payload'] for item in response.data['turns'] if item['kind'] == 'activity'))
        self.assertNotIn('A.', turn['content'])

    def test_incomplete_objectives_cannot_complete_or_reward(self):
        self.client.get(f'{self.base}/teaching-session/')
        response = self.client.post(f'{self.base}/teaching-completion/', format='json')
        self.assertEqual(response.status_code, 409)
        self.concept.refresh_from_db()
        self.assertNotEqual(self.concept.status, 'completed')
        self.assertFalse(XPTransaction.objects.filter(source_id=str(self.concept.id)).exists())

    def test_critical_misconception_prevents_completion(self):
        self.client.get(f'{self.base}/teaching-session/')
        session = self._satisfy_all_objectives()
        objective_id = session.objectives[0]['id']
        record_objective_evidence(session, objective_id, misconception='The learner still swaps old and fresh values.')
        session.save()
        evaluation = evaluate_session_completion(session)
        self.assertFalse(evaluation['complete'])
        self.assertEqual(evaluation['recommended_next_action'], 'remediate_misconception')

    def test_satisfied_objectives_complete_once_and_return_next_node(self):
        next_node = ConceptNode.objects.create(path=self.path, unit=self.unit, title='Convergence', order_index=1, status='locked')
        next_node.prerequisites.add(self.concept)
        self.client.get(f'{self.base}/teaching-session/')
        self._satisfy_all_objectives(score=88)
        first = self.client.post(f'{self.base}/teaching-completion/', format='json')
        second = self.client.post(f'{self.base}/teaching-completion/', format='json')
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data['mastery'], 88)
        self.assertEqual(first.data['next_node'], str(next_node.id))
        self.assertEqual(XPTransaction.objects.filter(source_id=str(self.concept.id), source_type='concept_completion').count(), 1)
        self.assertEqual(TeachingTurn.objects.filter(session__concept=self.concept, kind='completion').count(), 1)
        next_node.refresh_from_db()
        self.assertEqual(next_node.status, 'current')

    def test_refresh_cannot_duplicate_completion(self):
        self.client.get(f'{self.base}/teaching-session/')
        self._satisfy_all_objectives()
        self.client.post(f'{self.base}/teaching-completion/', format='json')
        refreshed = self.client.get(f'{self.base}/teaching-session/')
        retried = self.client.post(f'{self.base}/teaching-completion/', format='json')
        self.assertTrue(refreshed.data['completed'])
        self.assertEqual(retried.status_code, 200)
        self.assertEqual(XPTransaction.objects.filter(source_id=str(self.concept.id), source_type='concept_completion').count(), 1)

    @patch('ai_assistant.youtube_search.search_youtube', return_value=[{'video_id': 'only-video', 'title': 'Visual', 'url': 'https://youtube.com/watch?v=only-video'}])
    def test_video_and_flashcards_alone_never_complete(self, _search):
        self.client.post(f'{self.base}/teaching-message/', {'message': 'show me a video', 'idempotency_key': 'video-only'}, format='json')
        self.client.post(f'{self.base}/teaching-message/', {'message': 'make flashcards', 'idempotency_key': 'cards-only'}, format='json')
        evaluation = self.client.get(f'{self.base}/teaching-completion/')
        self.assertFalse(evaluation.data['complete'])
        self.assertEqual(evaluation.data['objectives_satisfied'], 0)

    def test_skip_pauses_without_mastery_or_reward(self):
        skipped = self.client.post(f'{self.base}/teaching-message/', {'message': 'skip this topic', 'idempotency_key': 'skip'}, format='json')
        self.assertEqual(skipped.data['status'], 'paused')
        completed = self.client.post(f'{self.base}/teaching-completion/', format='json')
        self.assertEqual(completed.status_code, 409)
        self.assertFalse(XPTransaction.objects.filter(source_id=str(self.concept.id)).exists())

    def test_direct_teaching_preferences_persist_across_concepts(self):
        response = self.client.post(f'{self.base}/teaching-message/', {
            'message': 'Keep it short and ask fewer questions.', 'idempotency_key': 'preferences'
        }, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['teaching_preferences']['explanation_length'], 'short')
        self.assertEqual(response.data['teaching_preferences']['check_frequency'], 'low')
        self.user.refresh_from_db()
        self.assertEqual(self.user.onboarding_status['teaching_preferences']['check_frequency'], 'low')
        other = ConceptNode.objects.create(path=self.path, unit=self.unit, title='Convergence', order_index=1, status='current')
        resumed = self.client.get(f'/api/learning/concepts/{other.id}/teaching-session/')
        self.assertEqual(resumed.data['teaching_preferences']['explanation_length'], 'short')

    @patch('ai_assistant.youtube_search.search_youtube', return_value=[{'video_id': 'embed1', 'title': 'A visual explanation', 'channel': 'Tutor', 'duration_str': '6:20', 'url': 'https://www.youtube.com/watch?v=embed1'}])
    def test_video_payload_prefers_privacy_enhanced_inline_embed(self, _search):
        response = self.client.post(f'{self.base}/teaching-message/', {
            'message': 'show me a video', 'idempotency_key': 'inline-video'
        }, format='json')
        video = response.data['turns'][-1]['payload']['videos'][0]
        self.assertEqual(video['embed_url'], 'https://www.youtube-nocookie.com/embed/embed1?rel=0')
        self.assertIn('why', video)
        self.assertIn('objective_id', video)
        resumed = self.client.post(f'{self.base}/teaching-message/', {
            'message': 'cool continue', 'idempotency_key': 'after-video'
        }, format='json')
        self.assertEqual(resumed.data['turns'][-1]['kind'], 'activity')
        self.assertEqual(resumed.data['turns'][-1]['payload']['supported_by_video'], 'embed1')

    def _definition_concept(self):
        resource = Resource.objects.create(
            owner=self.user, title='Introduction to Numerical Analysis', subject='Mathematics', status='ready',
            ai_notes_json={'sections': [{'title': 'Definition', 'plain_english':
                'Numerical analysis uses computational algorithms to obtain useful approximate solutions when exact symbolic solutions are difficult.'}]},
        )
        return ConceptNode.objects.create(
            path=self.path, unit=self.unit, title='Defining Numerical Analysis',
            summary='Numerical analysis uses computational algorithms to obtain useful approximate solutions when exact symbolic solutions are difficult.',
            source_resource=resource, source_section='Definition', order_index=9, status='current',
        )

    def test_definition_check_is_objective_grounded_and_self_contained(self):
        concept = self._definition_concept()
        response = self.client.get(f'/api/learning/concepts/{concept.id}/teaching-session/')
        activity = self._active_activity(response)
        self.assertEqual(activity['purpose'], 'check')
        self.assertIn('numerical analysis', activity['prompt'].lower())
        self.assertNotIn('what quantity or relationship', activity['prompt'].lower())
        self.assertGreaterEqual(len(activity['options']), 3)
        self.assertTrue(all(str(option).strip() for option in activity['options']))

    def test_free_response_non_answer_preserves_check_without_evidence(self):
        concept = self._definition_concept()
        activities = _concept_activities(concept, self.user)
        activity = next(item for item in activities if item['type'] == 'short_answer' and item['purpose'] == 'apply')
        session = self.client.get(f'/api/learning/concepts/{concept.id}/teaching-session/').data
        teaching_session = TeachingSession.objects.get(id=session['id'])
        teaching_session.state = {**teaching_session.state, 'last_learning_object': {
            'type': 'practice', 'activity_id': activity['id'], 'objective_id': teaching_session.objectives[0]['id']}}
        teaching_session.save(update_fields=['state'])
        result = self.client.post(f'/api/learning/concepts/{concept.id}/teaching-response/', {
            'activity_id': activity['id'], 'response': {'text': 'got it'}, 'idempotency_key': 'non-answer',
        }, format='json')
        self.assertEqual(result.data['evaluation']['outcome'], 'insufficient')
        self.assertEqual(EncounterAttempt.objects.filter(concept=concept).count(), 0)
        self.assertEqual(result.data['teaching_phase'], 'CHECK')
        self.assertEqual(result.data['unresolved_misconceptions'], [])
        resumed = self.client.post(f'/api/learning/concepts/{concept.id}/teaching-message/', {
            'message': 'ok', 'idempotency_key': 'after-non-answer'}, format='json')
        self.assertEqual(resumed.data['turns'][-1]['payload']['active_activity_id'], activity['id'])

    def test_incorrect_definition_answer_gets_specific_focused_remediation(self):
        concept = self._definition_concept()
        response = self.client.get(f'/api/learning/concepts/{concept.id}/teaching-session/')
        public = self._active_activity(response)
        private = next(item for item in _concept_activities(concept, self.user) if item['id'] == public['id'])
        wrong = next(index for index in range(len(private['options'])) if index != private['correct_choice'])
        result = self.client.post(f'/api/learning/concepts/{concept.id}/teaching-response/', {
            'activity_id': public['id'], 'response': {'choice': wrong},
        }, format='json')
        turn = result.data['turns'][-1]
        self.assertEqual(result.data['evaluation']['outcome'], 'incorrect')
        self.assertEqual(turn['payload']['pedagogical_action'], 'REMEDIATE')
        self.assertEqual(turn['payload']['activity']['purpose'], 'remediate')
        self.assertIn(turn['payload']['activity']['content']['mode'], {'comparison', 'example', 'steps'})
        self.assertNotIn('start with the idea', str(turn['payload']['activity']).lower())

    def test_ambiguous_activity_is_rejected_by_quality_guard(self):
        broken = {'id': 'broken', 'type': 'short_answer', 'purpose': 'apply',
                  'prompt': 'What matters first in this situation?', 'accepted_keywords': ['method']}
        self.assertFalse(_valid_activity(broken))

    def test_social_greeting_preserves_active_check_and_authority(self):
        initial = self.client.get(f'{self.base}/teaching-session/')
        activity_id = self._active_activity(initial)['id']
        before = TeachingSession.objects.get(user=self.user, concept=self.concept)
        mastery = before.mastery
        response = self.client.post(f'{self.base}/teaching-message/', {
            'message': 'hello', 'idempotency_key': 'hello'}, format='json')
        turn = response.data['turns'][-1]
        self.assertEqual(turn['payload']['conversational_intent'], 'SOCIAL')
        self.assertEqual(turn['payload']['pedagogical_action'], 'PRESERVE')
        self.assertEqual(turn['payload']['active_activity_id'], activity_id)
        self.assertEqual(EncounterAttempt.objects.count(), 0)
        self.assertEqual(response.data['mastery'], mastery)
        self.assertEqual(response.data['current_point'], 0)

    def test_social_start_then_acknowledgement_keeps_controller_sequence(self):
        hello = self.client.post(f'{self.base}/teaching-message/', {'message': 'hey', 'idempotency_key': 'hey'}, format='json')
        self.assertEqual(hello.data['turns'][-1]['payload']['conversational_intent'], 'SOCIAL')
        started = self.client.post(f'{self.base}/teaching-message/', {'message': "let's go", 'idempotency_key': 'go'}, format='json')
        self.assertEqual(started.data['turns'][-1]['payload']['pedagogical_action'], 'CHECK')
        self.assertTrue(started.data['turns'][-1]['payload']['reused'])
        self.assertEqual(EncounterAttempt.objects.count(), 0)

    def _advance_definition_objective(self):
        concept = self._definition_concept()
        opened = self.client.get(f'/api/learning/concepts/{concept.id}/teaching-session/')
        public = self._active_activity(opened)
        session = TeachingSession.objects.get(id=opened.data['id'])
        private = next(item for item in _objective_activities(session, self.user) if item['id'] == public['id'])
        result = self.client.post(f'/api/learning/concepts/{concept.id}/teaching-response/', {
            'activity_id': public['id'], 'response': {'choice': private['correct_choice']},
        }, format='json')
        return concept, public, result

    def test_advancement_clears_old_check_and_resets_new_objective_phase(self):
        concept, old_activity, result = self._advance_definition_objective()
        self.assertEqual(result.data['current_point'], 1)
        self.assertEqual(result.data['teaching_phase'], 'INTRODUCE')
        self.assertEqual(result.data['active_activity_id'], '')
        session = TeachingSession.objects.get(user=self.user, concept=concept)
        self.assertNotIn('last_learning_object', session.state)
        self.assertEqual(result.data['current_objective_id'], session.objectives[1]['id'])
        historical = next(turn for turn in result.data['turns'] if turn['payload'].get('activity', {}).get('id') == old_activity['id'])
        self.assertEqual(historical['payload']['activity']['objective_id'], session.objectives[0]['id'])

    def test_refresh_after_advancement_never_restores_old_check(self):
        concept, old_activity, _result = self._advance_definition_objective()
        refreshed = self.client.get(f'/api/learning/concepts/{concept.id}/teaching-session/')
        self.assertEqual(refreshed.data['current_point'], 1)
        self.assertEqual(refreshed.data['active_activity_id'], '')
        self.assertNotEqual(refreshed.data['active_activity_id'], old_activity['id'])

    def test_explicit_example_and_test_requests_use_current_objective(self):
        concept, old_activity, _result = self._advance_definition_objective()
        base = f'/api/learning/concepts/{concept.id}'
        example = self.client.post(f'{base}/teaching-message/', {
            'message': 'Show me an example', 'idempotency_key': 'objective-two-example'}, format='json')
        example_turn = example.data['turns'][-1]
        self.assertEqual(example_turn['payload']['pedagogical_action'], 'EXAMPLE')
        self.assertEqual(example_turn['payload']['activity']['objective_id'], example.data['current_objective_id'])
        self.assertNotEqual(example_turn['payload']['activity']['id'], old_activity['id'])
        check = self.client.post(f'{base}/teaching-message/', {
            'message': 'Test me on this checkpoint', 'idempotency_key': 'objective-two-check'}, format='json')
        check_turn = check.data['turns'][-1]
        self.assertEqual(check_turn['payload']['pedagogical_action'], 'CHECK')
        self.assertEqual(check_turn['payload']['activity']['objective_id'], check.data['current_objective_id'])
        self.assertEqual(check.data['active_activity_id'], check_turn['payload']['activity']['id'])
        self.assertNotEqual(check.data['active_activity_id'], old_activity['id'])
        private = next(item for item in _objective_activities(
            TeachingSession.objects.get(user=self.user, concept=concept), self.user
        ) if item['id'] == check.data['active_activity_id'])
        self.assertTrue(_valid_activity(private))

    def test_current_objective_check_idempotency_remains_intact(self):
        concept, old_activity, _result = self._advance_definition_objective()
        base = f'/api/learning/concepts/{concept.id}'
        first = self.client.post(f'{base}/teaching-message/', {
            'message': 'Test me', 'idempotency_key': 'objective-two-first'}, format='json')
        activity_id = first.data['active_activity_id']
        second = self.client.post(f'{base}/teaching-message/', {
            'message': 'Test me', 'idempotency_key': 'objective-two-second'}, format='json')
        self.assertEqual(second.data['active_activity_id'], activity_id)
        self.assertNotEqual(activity_id, old_activity['id'])
        self.assertEqual(EncounterAttempt.objects.filter(concept=concept).count(), 1)
