import os
import django
import sys
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from library.models import Resource

try:
    r = Resource.objects.get(id=26)
    print(f"RESOURCE: {r.id} - {r.title}")
    print(f"STATUS: {r.status}")
    print(f"HAS STUDY KIT: {r.has_study_kit}")
    
    notes = r.ai_notes_json
    print(f"NOTES TYPE: {type(notes)}")
    if notes:
        print("NOTES KEYS:", list(notes.keys()))
        print("OVERVIEW:", notes.get('overview'))
        sections = notes.get('sections', [])
        print(f"SECTION COUNT: {len(sections)}")
        if sections:
            print("FIRST SECTION TITLE:", sections[0].get('title'))
    else:
        print("NOTES IS EMPTY")
        
    if r.ai_concepts:
        for c in r.ai_concepts:
            if 'extracted_text' in c:
                print(f"EXTRACTED TEXT LENGTH: {len(c['extracted_text'])}")

except Exception as e:
    print(f"Error: {e}")
