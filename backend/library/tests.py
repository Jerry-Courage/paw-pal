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
