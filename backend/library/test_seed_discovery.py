from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from .models import Flashcard, Quiz, Resource


class SeedDiscoveryTests(TestCase):
    def test_rerun_is_idempotent_and_preserves_unrelated_public_resources(self):
        owner = get_user_model().objects.create_user(username='curator', email='curator@example.com')
        unrelated = Resource.objects.create(owner=owner, title='Community respiration notes', is_public=True, status='ready')
        unrelated_quiz = Quiz.objects.create(resource=unrelated, owner=owner, title='Community quiz', questions=[])

        call_command('seed_discovery', stdout=StringIO())
        seeded = Resource.objects.filter(curriculum_topic_id__startswith='seed-discovery-')
        first_ids = list(seeded.order_by('curriculum_topic_id').values_list('id', flat=True))
        first_counts = (seeded.count(), Quiz.objects.filter(resource__in=seeded).count(), Flashcard.objects.filter(resource__in=seeded).count())

        call_command('seed_discovery', stdout=StringIO())
        seeded = Resource.objects.filter(curriculum_topic_id__startswith='seed-discovery-')
        self.assertEqual(list(seeded.order_by('curriculum_topic_id').values_list('id', flat=True)), first_ids)
        self.assertEqual((seeded.count(), Quiz.objects.filter(resource__in=seeded).count(), Flashcard.objects.filter(resource__in=seeded).count()), first_counts)
        self.assertTrue(Resource.objects.filter(pk=unrelated.pk, is_public=True).exists())
        self.assertTrue(Quiz.objects.filter(pk=unrelated_quiz.pk, resource=unrelated).exists())

    def test_same_title_user_resource_is_not_adopted_or_deleted(self):
        owner = get_user_model().objects.create_user(username='same-title', email='same-title@example.com')
        title = 'Deep Learning: The Analytical Masterclass'
        user_resource = Resource.objects.create(owner=owner, title=title, is_public=True, status='ready')
        call_command('seed_discovery', stdout=StringIO())
        user_resource.refresh_from_db()
        self.assertEqual(user_resource.owner, owner)
        self.assertEqual(user_resource.curriculum_topic_id, '')
        self.assertTrue(Resource.objects.filter(title=title, curriculum_topic_id__startswith='seed-discovery-').exists())
