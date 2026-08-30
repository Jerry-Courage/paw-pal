from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Resource, SourceBookmark

class SourceBookmarkTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='reader', email='reader@example.com', password='test-pass-123')
        self.other = get_user_model().objects.create_user(username='other', email='other@example.com', password='test-pass-123')
        self.resource = Resource.objects.create(owner=self.user, title='Numerical Analysis', status='ready', has_study_kit=True)
        self.client = APIClient(); self.client.force_authenticate(self.user)

    def test_bookmarks_are_persistent_unique_and_user_scoped(self):
        url = f'/api/library/resources/{self.resource.id}/bookmarks/'
        response = self.client.post(url, {'section_key': 'sec-1', 'section_title': 'Convergence', 'excerpt': 'A sequence converges.'}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.client.get(url).data[0]['section_title'], 'Convergence')
        self.assertEqual(SourceBookmark.objects.filter(user=self.user).count(), 1)
        other_client = APIClient(); other_client.force_authenticate(self.other)
        self.assertEqual(other_client.get(url).status_code, 404)


class ResourceReadingTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='source-reader', email='source@example.com', password='test-pass-123')
        self.other = get_user_model().objects.create_user(username='source-other', email='source-other@example.com', password='test-pass-123')
        self.client = APIClient(); self.client.force_authenticate(self.user)

    def test_processed_content_survives_missing_original(self):
        resource = Resource.objects.create(owner=self.user, title='Durable notes', status='ready', has_study_kit=True, ai_summary='A persisted summary.', ai_notes_json={'sections': [{'title': 'Convergence', 'plain_english': 'A durable explanation.'}]})
        response = self.client.get(f'/api/library/resources/{resource.id}/reading/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['processed_content_available'])
        self.assertFalse(response.data['original_available'])
        self.assertEqual(response.data['sections'][0]['title'], 'Convergence')

    def test_reading_payload_is_user_scoped(self):
        resource = Resource.objects.create(owner=self.other, title='Private notes', ai_summary='Private')
        response = self.client.get(f'/api/library/resources/{resource.id}/reading/')
        self.assertEqual(response.status_code, 404)
