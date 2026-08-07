"""
Management command: add_curriculum_kit
Adds a curriculum study kit from a URL and triggers AI processing.

Usage:
  python manage.py add_curriculum_kit \
    --url "https://example.com/cell-biology" \
    --title "Cell Biology" \
    --subject integrated-science \
    --topic bio-cell \
    --year shs1 \
    --features flashcards,quiz,practice
"""
import threading
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model


class Command(BaseCommand):
    help = 'Add a curriculum study kit from a URL and process it'

    def add_arguments(self, parser):
        parser.add_argument('--url', required=True, help='URL to extract content from')
        parser.add_argument('--title', required=True, help='Resource title')
        parser.add_argument('--subject', required=True, help='Curriculum subject ID (e.g. core-math, physics)')
        parser.add_argument('--topic', required=True, help='Curriculum topic ID (e.g. bio-cell, algebra)')
        parser.add_argument('--year', required=True, help='SHS year: shs1, shs2, shs3')
        parser.add_argument('--features', default='flashcards,quiz,practice', help='Comma-separated features to generate')
        parser.add_argument('--user-email', default=None, help='Owner email (defaults to first admin user)')

    def handle(self, *args, **options):
        from library.models import Resource
        from library.tasks import process_resource_task

        User = get_user_model()

        # Get owner
        email = options.get('user_email')
        if email:
            user = User.objects.get(email=email)
        else:
            user = User.objects.filter(is_staff=True).first() or User.objects.first()

        if not user:
            self.stdout.write(self.style.ERROR('No users found. Create a user first.'))
            return

        features = [f.strip() for f in options['features'].split(',') if f.strip()]

        # Create the resource
        resource = Resource.objects.create(
            owner=user,
            title=options['title'],
            url=options['url'],
            resource_type='other',
            subject=options['subject'],
            is_public=True,
            author_name='FlowState Curriculum',
            curriculum_subject=options['subject'],
            curriculum_topic_id=options['topic'],
            curriculum_year=options['year'],
            selected_features=features,
            status='processing',
        )

        self.stdout.write(self.style.SUCCESS(
            f'Created resource: {resource.title} (ID: {resource.id})\n'
            f'  Subject: {resource.curriculum_subject}\n'
            f'  Topic: {resource.curriculum_topic_id}\n'
            f'  Year: {resource.curriculum_year}\n'
            f'  URL: {resource.url}\n'
            f'  Features: {features}\n'
            f'  Processing...'
        ))

        # Process in background thread
        def run_processing():
            try:
                process_resource_task(resource.id)
                self.stdout.write(self.style.SUCCESS(f'Done: {resource.title}'))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'Failed: {resource.title} — {e}'))

        thread = threading.Thread(target=run_processing, daemon=True)
        thread.start()

        self.stdout.write(self.style.SUCCESS(f'Processing started in background. Resource ID: {resource.id}'))
