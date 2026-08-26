from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.urls import resolve
from rest_framework.test import APIClient

from library.models import Resource
from learning.models import ConceptNode, LearningPath, Unit


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
