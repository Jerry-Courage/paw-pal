import os
import sys

# Ensure django can find core.settings
sys.path.append(r'c:\Users\DONEX\Downloads\Compressed\paw-pal\paw-pal\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

import django
django.setup()

from library.tasks import process_resource_task
from library.models import Resource

print("Cleaning up previous data for Resource 36...")
res = Resource.objects.get(id=36)
res.ai_notes_json = {}
res.ai_concepts = []
res.status = 'processing'
res.save()

print("Re-triggering process_resource_task(36)...")
process_resource_task(36)
print("COMPLETED reprocessing.")
