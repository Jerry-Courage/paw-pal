import json
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from learning.models import TeachingSession
from learning.diagnostics import objective_trace


class Command(BaseCommand):
    help = 'Development-only source-to-lesson diagnostic (read-only)'

    def add_arguments(self, parser):
        parser.add_argument('session_id')
        parser.add_argument('objective_id')

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError('Material diagnostics are development-only')
        try:
            session = TeachingSession.objects.select_related('concept__source_resource').get(pk=options['session_id'])
            self.stdout.write(json.dumps(objective_trace(session, options['objective_id']), indent=2, default=str))
        except (TeachingSession.DoesNotExist, ValueError) as exc:
            raise CommandError(str(exc)) from exc
