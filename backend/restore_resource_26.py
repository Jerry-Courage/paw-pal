import os
import sys
import django
from dotenv import load_dotenv

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
load_dotenv()
django.setup()

from library.models import Resource
from django_q.tasks import async_task

try:
    res = Resource.objects.get(id=26)
    print(f"Restoring Visibility for Resource {res.id} ({res.title})...")
    
    # Reset intelligence state to force a fresh hardened generation
    res.has_study_kit = False
    res.ai_notes_json = {}
    res.status = 'processing'
    res.save()
    
    # Trigger the newly hardened task logic
    async_task('library.tasks.process_resource_task', res.id)
    
    print("Intelligence Resilience restoration triggered. Re-building sections with Self-Healing logic.")
except Exception as e:
    print(f"Restoration failed: {e}")
