"""
Management command to delete all resources stuck in 'processing' status.
Run once via: python manage.py clear_processing
Or trigger via CLEAR_PROCESSING=true env var on startup.
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Delete all resources stuck in processing status'

    def handle(self, *args, **options):
        from library.models import Resource
        qs = Resource.objects.filter(status='processing')
        count = qs.count()
        if count == 0:
            self.stdout.write('No processing resources found.')
            return
        qs.delete()
        self.stdout.write(self.style.SUCCESS(f'Deleted {count} processing resources.'))
