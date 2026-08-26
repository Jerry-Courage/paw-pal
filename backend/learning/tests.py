from django.test import SimpleTestCase
from django.urls import resolve


class LearningPathRouteTests(SimpleTestCase):
    def test_generate_preview_resolves_to_collection_post_action(self):
        match = resolve('/api/learning/paths/generate-preview/')

        self.assertEqual(match.url_name, 'learningpath-generate-preview-explicit')
        self.assertEqual(match.func.actions, {'post': 'generate_preview'})

