import os
import sys
import django
from dotenv import load_dotenv

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
load_dotenv()
django.setup()

from library.models import Resource
from library.youtube import process_youtube_url
from django_q.tasks import async_task

try:
    # We find the 'Data' resource by title 
    res = Resource.objects.filter(title='Data').first()
    if not res:
        # Try finding by the specific URL
        res = Resource.objects.filter(url='https://youtu.be/X3paOmcrTjQ?si=O6VydIudyVcQ_z4s').first()
        
    if res:
        print(f"Restoring Authenticity for Resource {res.id} ({res.title})...")
        
        # Reset intelligence state
        res.has_study_kit = False
        res.ai_notes_json = {}
        res.status = 'processing'
        res.ai_concepts = []
        res.save()
        
        # Trigger High-Fidelity Extraction (Whisper)
        # The updated library.tasks.process_resource_task will use my new youtube.py logic
        async_task('library.tasks.process_resource_task', res.id)
        
        print("Authenticity Restoration successfully triggered. Whisper extraction in progress.")
    else:
        print("Resource 'Data' not found. Please check your Library and click the 'Re-Analyze' button.")
except Exception as e:
    print(f"Restoration failed: {e}")
