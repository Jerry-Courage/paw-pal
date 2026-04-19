import os
import sys
import django
import json

# SETUP
sys.path.append('c:\\Users\\DONEX\\Downloads\\Compressed\\paw-pal\\paw-pal\\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from library.models import Resource

resources = Resource.objects.filter(id__in=[69, 70, 71, 72])
harvest = []

for r in resources:
    harvest.append({
        'title': r.title,
        'resource_type': r.resource_type,
        'url': r.url,
        'subject': r.subject,
        'status': 'ready',
        'ai_summary': r.ai_summary,
        'ai_notes_json': r.ai_notes_json,
        'ai_concepts': r.ai_concepts,
        'has_study_kit': r.has_study_kit,
        'is_public': True,
        'author_name': r.author_name,
    })

output_path = 'c:\\Users\\DONEX\\.gemini\\antigravity\\brain\\8a9d2376-edf7-404c-8e7f-b6f5629338cc\\curated_harvest.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(harvest, f, indent=2)

print(f"--- HARVEST COMPLETE ---")
print(f"Items harvested: {len(harvest)}")
print(f"Path: {output_path}")
print(f"--- END HARVEST ---")
