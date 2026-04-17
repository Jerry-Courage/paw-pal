import os
import sys

# Ensure django can find core.settings
sys.path.append(r'c:\Users\DONEX\Downloads\Compressed\paw-pal\paw-pal\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

import django
django.setup()

from ai_assistant.services import AIService

class DummyResource:
    id = 1
    title = 'Test Title'
    subject = 'Test Subject'
    ai_summary = ''
    ai_notes_json = {}
    ai_concepts = []
    
    def get_resource_type_display(self):
        return 'article'

print("Initializing AI Service...")
ai = AIService()

print("Triggering Quad-Burst AI Engine via fast mock...")
try:
    # 200,000 characters to stress-test the new 50-chunk limit
    large_text = ("FlowState Data Science Chapter " + "x" * 100 + " ") * 1500
    kit = ai.generate_study_kit(DummyResource(), context=large_text)
    if kit and isinstance(kit, dict):
        print("SUCCESS! Parallel Engine resolved perfectly.")
    else:
        print("FAILED. Engine did not crash, but returned empty output.")
except Exception as e:
    import traceback
    traceback.print_exc()
    print("FAILED with Exception:", e)
