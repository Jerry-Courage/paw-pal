from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.urls import resolve
from rest_framework.test import APIClient
from unittest.mock import patch

from library.models import Resource
from learning.models import ConceptNode, EncounterAttempt, LearningPath, TeachingSession, TeachingTurn, Unit
from learning.views import _concept_activities, _valid_activity


class LearningPathRouteTests(SimpleTestCase):
    def test_generate_preview_resolves_to_collection_post_action(self):
        match = resolve('/api/learning/paths/generate-preview/')

        self.assertEqual(match.url_name, 'learningpath-generate-preview-explicit')
        self.assertEqual(match.func.actions, {'post': 'generate_preview'})


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

    def test_session_is_created_lazily_and_resumes_without_duplicate_opening(self):
        first = self.client.get(f'{self.base}/teaching-session/')
        second = self.client.get(f'{self.base}/teaching-session/')
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(TeachingSession.objects.count(), 1)
        self.assertEqual(TeachingTurn.objects.filter(role='flow').count(), 1)
        self.assertIn('Ready to learn', first.data['turns'][0]['content'])
        self.assertEqual(len(first.data['objectives']), 6)

    def test_interruption_preserves_resume_point_and_continue_restores_it(self):
        self.client.get(f'{self.base}/teaching-session/')
        started = self.client.post(f'{self.base}/teaching-message/', {'message': "let's go", 'idempotency_key': 'start'}, format='json')
        self.assertEqual(started.data['current_point'], 1)
        interrupted = self.client.post(f'{self.base}/teaching-message/', {'message': "I don't understand that", 'idempotency_key': 'interrupt'}, format='json')
        self.assertEqual(interrupted.data['status'], 'remediation')
        self.assertEqual(interrupted.data['resume_point'], 1)
        resumed = self.client.post(f'{self.base}/teaching-message/', {'message': 'okay continue', 'idempotency_key': 'resume'}, format='json')
        self.assertEqual(resumed.data['status'], 'teaching')
        self.assertEqual(resumed.data['current_point'], 1)
        self.assertIn('exact point we paused', resumed.data['turns'][-1]['content'])

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
        self.assertEqual(voice.data['current_teaching_point'], 2)
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

    def test_voice_events_merge_state_and_completion_closes_session(self):
        session = self.client.get(f'{self.base}/teaching-session/').data
        objective_id = session['objectives'][0]['id']
        voice = self.client.post(f'{self.base}/teaching-voice-event/', {
            'event': 'point_understood', 'objective_id': objective_id,
            'summary': 'The learner explained why Jacobi uses old values.',
        }, format='json')
        self.assertEqual(voice.status_code, 200)
        self.assertIn(objective_id, voice.data['objectives_understood'])
        completed = self.client.post(f'{self.base}/complete/', {'score': 90}, format='json')
        self.assertEqual(completed.status_code, 200)
        teaching = TeachingSession.objects.get(concept=self.concept, user=self.user)
        self.assertEqual(teaching.status, 'completed')
        self.assertEqual(teaching.mastery, 90)
        self.assertTrue(teaching.turns.filter(kind='completion').exists())
