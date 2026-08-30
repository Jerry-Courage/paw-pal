import json

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
        payload = self.client.get(url).data
        bookmarks = payload if isinstance(payload, list) else payload['results']
        self.assertEqual(bookmarks[0]['section_title'], 'Convergence')
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

    def test_processed_pdf_with_32_sections_is_serializable(self):
        sections = [{
            'title': f'Section {index + 1}', 'plain_english': f'Explanation {index + 1}',
            'deep_dive': None, 'key_points': ['Point A', {'text': 'Point B'}],
            'examples': None, 'page_number': str(index + 1),
        } for index in range(32)]
        resource = Resource.objects.create(
            owner=self.user, title='1. Introduction', resource_type='pdf', status='ready',
            has_study_kit=True, ai_summary='Persisted introduction.', ai_notes_json={'sections': sections},
        )
        response = self.client.get(f'/api/library/resources/{resource.id}/reading/')
        response.render()
        decoded = json.loads(response.content)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(decoded['sections']), 32)
        self.assertEqual(decoded['sections'][0]['key_points'], ['Point A', 'Point B'])
        self.assertTrue(decoded['processed_content_available'])
        self.assertFalse(decoded['original_file_available'])

    def test_legacy_section_shapes_are_normalized_without_original(self):
        resource = Resource.objects.create(
            owner=self.user, title='Legacy notes', resource_type='pdf', status='ready',
            ai_summary='Stored summary', ai_notes_json={'sections': {
                'first': {'heading': 'Legacy heading', 'content': {'text': 'Readable body'}, 'key_points': 'One point', 'examples': None, 'page': 'not-a-page'},
                'second': None,
            }},
        )
        response = self.client.get(f'/api/library/resources/{resource.id}/reading/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['sections'][0]['content'], 'Readable body')
        self.assertEqual(response.data['sections'][0]['key_points'], ['One point'])
        self.assertIsNone(response.data['sections'][0]['page'])
        self.assertFalse(response.data['original_file_available'])

    def test_missing_resource_returns_404(self):
        self.assertEqual(self.client.get('/api/library/resources/999999/reading/').status_code, 404)
