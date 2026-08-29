from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.test import TestCase
from unittest.mock import patch
from rest_framework.test import APIClient

from learning.models import ConceptNode, EncounterAttempt, LearningPath, TeachingSession
from library.models import Resource

from .agent import FlowAgent, GlobalContextBuilder
from .capabilities import execute_capability, flow_object, resolve_capability
from .models import ChatMessage, ChatSession

class UniversalFlowContextTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='flow-context-learner',
            email='flow-context@example.com',
            password='test-password',
            onboarding_status={
                'teaching_preferences': {
                    'explanation_length': 'short',
                    'analogy_preference': 'on',
                }
            },
        )
        self.path = LearningPath.objects.create(
            user=self.user,
            title='Numerical Analysis',
            goal='Prepare for the exam',
            status='active',
            total_concepts=4,
            concepts_completed=2,
        )
        self.concept = ConceptNode.objects.create(
            path=self.path,
            title='Newton-Raphson',
            status='current',
        )
        TeachingSession.objects.create(
            user=self.user,
            concept=self.concept,
            status='remediation',
            mastery=62,
            unresolved_misconceptions=['Derivative evaluated at the wrong point'],
        )

    def test_context_uses_real_journey_state_and_learning_preferences(self):
        context = GlobalContextBuilder.get_context(self.user)

        self.assertIn('Numerical Analysis', context)
        self.assertIn('Newton-Raphson', context)
        self.assertIn('2/4', context)
        self.assertIn('Derivative evaluated at the wrong point', context)
        self.assertIn('"explanation_length": "short"', context)

    def test_explicit_context_is_kept_separate_and_authoritative(self):
        agent = FlowAgent(self.user)
        agent.context = GlobalContextBuilder.get_context(self.user)
        messages = async_to_sync(agent._build_messages)(
            'Help me with question three',
            'ASSIGNMENT 12: Interpolation worksheet',
            [],
            False,
        )

        self.assertIn('EXPLICIT LEARNING CONTEXT', messages[0]['content'])
        self.assertEqual(messages[-2]['content'], 'Current Page Context: ASSIGNMENT 12: Interpolation worksheet')
        self.assertEqual(messages[-1]['content'], 'Help me with question three')


class FlowCapabilityRoutingTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='router', password='test-password')
        self.resource = Resource.objects.create(owner=self.user, title='Integration', status='ready')

    def test_explicit_capability_priority(self):
        self.assertEqual(resolve_capability('I need a podcast on this').name, 'podcast')
        self.assertEqual(resolve_capability('Find me a video that explains this').name, 'video')
        self.assertEqual(resolve_capability('Make me a flashcard').name, 'flashcards')
        self.assertEqual(resolve_capability('Test me with active recall').name, 'active_recall')
        self.assertEqual(resolve_capability('Let me teach you this').name, 'general_feynman')

    def test_podcast_without_source_clarifies_and_never_routes_to_image(self):
        result = execute_capability(self.user, 'I need a podcast on this', '')
        self.assertEqual(result['capability'], 'podcast')
        self.assertTrue(result['needs_context'])
        self.assertEqual(result['objects'], [])
        self.assertNotIn('image', result)

    def test_acknowledgement_is_not_mastery_evidence(self):
        result = execute_capability(self.user, 'okay got it', '')
        self.assertEqual(result['capability'], 'acknowledgement')
        self.assertNotIn('master', result['reply'].lower())
        self.assertIn('quick check', result['reply'].lower())

    def test_native_object_schema_rejects_unknown_types_and_states(self):
        with self.assertRaises(ValueError):
            flow_object('fake_markdown_card', {})
        with self.assertRaises(ValueError):
            flow_object('video', {}, state='pretend')

    def test_active_recall_returns_structured_object_without_answer(self):
        result = execute_capability(self.user, 'Test me with active recall', '')
        obj = result['objects'][0]
        self.assertEqual(obj['type'], 'active_recall')
        self.assertFalse(obj['payload']['answer_revealed'])
        self.assertNotIn('answer', obj['payload'])

    def test_feynman_is_explicitly_non_journey_authority(self):
        result = execute_capability(self.user, 'Let me teach you recursion', '')
        obj = result['objects'][0]
        self.assertEqual(obj['type'], 'feynman')
        self.assertFalse(obj['payload']['journey_authority'])

    @patch('ai_assistant.youtube_search.search_youtube')
    def test_video_phrase_returns_native_video_object(self, search):
        search.return_value = [{'video_id': 'abc123', 'title': 'Newton method', 'channel': 'Tutor', 'duration': 420, 'duration_str': '7:00', 'url': 'https://www.youtube.com/watch?v=abc123'}]
        result = execute_capability(self.user, 'Find me a video on Newton method', '')
        self.assertEqual(result['objects'][0]['type'], 'video')
        self.assertEqual(result['objects'][0]['payload']['videos'][0]['video_id'], 'abc123')

    @patch('ai_assistant.services.AIService.generate_flashcards')
    def test_flashcard_phrase_returns_native_flashcard_object(self, generate):
        generate.return_value = [{'question': 'What is integration?', 'answer': 'Accumulation.'}]
        result = execute_capability(self.user, 'Make me a flashcard', f'SOURCE {self.resource.id}: Integration')
        self.assertEqual(result['objects'][0]['type'], 'flashcards')
        self.assertEqual(result['objects'][0]['provenance']['source_id'], self.resource.id)

    @patch('ai_assistant.capabilities.threading.Thread')
    def test_explicit_source_reaches_podcast_and_failure_never_becomes_image(self, thread):
        result = execute_capability(self.user, 'I need a podcast on this', f'SOURCE {self.resource.id}: Integration')
        self.assertEqual(result['capability'], 'podcast')
        self.assertEqual(result['objects'][0]['type'], 'podcast')
        self.assertEqual(result['objects'][0]['provenance']['source_id'], self.resource.id)
        self.assertNotIn('image', str(result).lower())
        thread.return_value.start.assert_called_once()

    def test_unknown_capability_is_not_faked(self):
        self.assertIsNone(resolve_capability('materialize a holographic memory palace'))

    @patch('ai_assistant.youtube_search.search_youtube')
    def test_followup_video_uses_recent_conversation_topic(self, search):
        search.return_value = [{'video_id': 'newton1', 'title': 'Newton method', 'channel': 'Tutor'}]
        session = ChatSession.objects.create(user=self.user, title='Newton')
        ChatMessage.objects.create(session=session, role='user', content="Explain Newton's method")
        ChatMessage.objects.create(session=session, role='assistant', content='It improves a guess using the derivative.')
        ChatMessage.objects.create(session=session, role='user', content='Find me a video that explains this')
        result = execute_capability(self.user, 'Find me a video that explains this', '', session=session)
        self.assertEqual(result['objects'][0]['type'], 'video')
        self.assertIn("Newton's method", search.call_args.args[0])

    def test_practice_routes_to_real_journey_activity_without_hidden_answer(self):
        path = LearningPath.objects.create(user=self.user, title='Numerical Analysis', status='active', goal='Understand it')
        concept = ConceptNode.objects.create(path=path, title="Newton's Method", description='Improve a guess using a derivative.', status='current')
        TeachingSession.objects.create(user=self.user, concept=concept, status='teaching')
        result = execute_capability(self.user, 'Quiz me on this', '')
        practice = result['objects'][0]
        self.assertEqual(practice['type'], 'practice')
        self.assertEqual(practice['payload']['mode'], 'journey')
        self.assertEqual(practice['payload']['concept_id'], str(concept.id))
        self.assertNotIn('correct_choice', practice['payload']['questions'][0])
        self.assertNotIn('accepted_keywords', practice['payload']['questions'][0])

    def test_practice_without_resolvable_context_clarifies(self):
        result = execute_capability(self.user, 'quiz me', '')
        self.assertTrue(result['needs_context'])
        self.assertEqual(result['objects'], [])


class FlowPracticeRuntimeTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='practice-runtime', email='practice-runtime@example.com', password='test-password')
        self.path = LearningPath.objects.create(user=self.user, title='Numerical Analysis', status='active', goal='Understand it')
        self.concept = ConceptNode.objects.create(path=self.path, title="Newton's Method", description='Improve a guess using a derivative.', status='current')
        TeachingSession.objects.create(user=self.user, concept=self.concept, status='teaching')
        self.session = ChatSession.objects.create(user=self.user, title='Practice')
        result = execute_capability(self.user, 'Give me one question', f'CONCEPT {self.concept.id}')
        self.practice = result['objects'][0]
        ChatMessage.objects.create(session=self.session, role='assistant', content=result['reply'], flow_objects=[self.practice])
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_journey_practice_records_evidence_once_and_restores_completed_state(self):
        question = self.practice['payload']['questions'][0]
        response = {'choice': 0} if question['type'] in {'mcq', 'predict', 'scenario'} else {'text': 'The method improves the current guess using derivative information.'}
        url = f'/api/ai/sessions/{self.session.id}/objects/{self.practice["id"]}/respond/'
        first = self.client.post(url, {'response': response, 'idempotency_key': 'same-answer'}, content_type='application/json')
        second = self.client.post(url, {'response': response, 'idempotency_key': 'same-answer'}, content_type='application/json')
        self.assertIn(first.status_code, (200, 201))
        self.assertEqual(second.status_code, 200)
        self.assertEqual(EncounterAttempt.objects.filter(user=self.user, concept=self.concept).count(), 1)
        saved = ChatMessage.objects.get(session=self.session, role='assistant').flow_objects[0]
        self.assertEqual(saved['payload']['status'], 'completed')
        self.assertTrue(second.json()['idempotent'])

    def test_object_id_is_scoped_to_owning_user(self):
        other = get_user_model().objects.create_user(username='practice-intruder', email='practice-intruder@example.com', password='test-password')
        self.client.force_authenticate(other)
        url = f'/api/ai/sessions/{self.session.id}/objects/{self.practice["id"]}/respond/'
        response = self.client.post(url, {'response': {'choice': 0}, 'idempotency_key': 'intruder'}, content_type='application/json')
        self.assertEqual(response.status_code, 404)
        self.assertFalse(EncounterAttempt.objects.filter(user=other).exists())
