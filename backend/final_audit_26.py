import os
import django
import json
from dotenv import load_dotenv

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
load_dotenv()
django.setup()

from library.models import Resource

try:
    r = Resource.objects.get(id=26)
    notes = r.ai_notes_json
    
    with open('res_26_final_audit.txt', 'w', encoding='utf-8') as f:
        f.write(f"RESOURCE: {r.id}\n")
        f.write(f"HAS KIT: {r.has_study_kit}\n")
        f.write(f"OVERVIEW: {notes.get('overview', {})}\n")
        sections = notes.get('sections', [])
        f.write(f"SECTION COUNT: {len(sections)}\n")
        for i, s in enumerate(sections):
            f.write(f"SECTION {i}: {s.get('title')} (Content len: {len(s.get('content', ''))})\n")
    print("SUCCESS: res_26_final_audit.txt created.")
except Exception as e:
    print(f"FAILED: {e}")
