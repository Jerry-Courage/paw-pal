import traceback
from django.core.management.base import BaseCommand
from library.models import Resource
from library.tasks import process_resource_task
import logging

logger = logging.getLogger('flowstate')

class Command(BaseCommand):
    help = 'Runs the AI synthesis for a specific Resource via the GitHub Imperial Engine.'

    def add_arguments(self, parser):
        parser.add_argument('resource_id', type=int, help='The ID of the Resource to process')

    def handle(self, *args, **options):
        resource_id = options['resource_id']
        self.stdout.write(f'--- [GitHub Engine] Initializing Synthesis for Resource {resource_id} ---')

        try:
            resource = Resource.objects.get(id=resource_id)
            self.stdout.write(f'[*] Found resource: "{resource.title}" | type={resource.resource_type} | status={resource.status}')
        except Resource.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'[!] ERROR: Resource {resource_id} not found in Database.'))
            return

        try:
            process_resource_task(resource_id)
            # Re-fetch to confirm status was saved
            resource.refresh_from_db()
            self.stdout.write(self.style.SUCCESS(
                f'--- [GitHub Engine] Synthesis Complete | status={resource.status} has_kit={resource.has_study_kit} ---'
            ))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'[!] CRITICAL ERROR: {str(e)}'))
            self.stdout.write(self.style.ERROR(traceback.format_exc()))
            # Mark resource as failed so UI doesn't spin forever
            try:
                resource.refresh_from_db()
                resource.status = 'failed'
                resource.status_text = f'❌ GitHub Engine Error: {str(e)[:150]}'
                resource.save(update_fields=['status', 'status_text'])
            except Exception:
                pass
            raise SystemExit(1)
