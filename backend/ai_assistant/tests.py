from asgiref.sync import async_to_sync
from django.contrib.auth import get_user_model
from django.test import TestCase

from learning.models import ConceptNode, LearningPath, TeachingSession

from .agent import FlowAgent, GlobalContextBuilder

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
