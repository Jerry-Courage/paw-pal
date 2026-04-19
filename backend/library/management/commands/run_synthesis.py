import argparse
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
        self.stdout.write(self.style.SUCCESS(f'--- [GitHub Engine] Initializing Synthesis for Resource {resource_id} ---'))
        
        try:
            resource = Resource.objects.get(id=resource_id)
            self.stdout.write(f'[*] Processing: {resource.title}')
            
            # Use the existing process_resource_task logic
            process_resource_task(resource_id)
            
            self.stdout.write(self.style.SUCCESS(f'--- [GitHub Engine] Synthesis Complete for Resource {resource_id} ---'))
        except Resource.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'[!] ERROR: Resource {resource_id} not found in Database.'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'[!] CRITICAL ERROR: {str(e)}'))
