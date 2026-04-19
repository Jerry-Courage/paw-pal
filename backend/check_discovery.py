import os
import django
import sys

# Setup django environment
sys.path.append('c:\\Users\\DONEX\\Downloads\\Compressed\\paw-pal\\paw-pal\\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from library.models import Resource

public_resources = Resource.objects.filter(is_public=True)

print(f"--- PUBLIC RESOURCE DEEP SCAN ---")
for r in public_resources:
    print(f"ID: {r.id} | Title: {r.title} | Status: {r.status} | Type: {r.resource_type} | Subject: {r.subject}")
print(f"--- END DEEP SCAN ---")
