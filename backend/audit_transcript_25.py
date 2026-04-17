import os
import django
import sys

# Set encoding for Windows terminal
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from library.models import Resource

try:
    r = Resource.objects.get(id=25)
    if r.ai_concepts:
        for concept in r.ai_concepts:
            if 'extracted_text' in concept:
                text = concept['extracted_text']
                print(f"TRANSCRIPT PREVIEW (Total {len(text)} chars):")
                print(text[:2000])
                break
    else:
        print("No concepts found.")
except Exception as e:
    print(f"Error: {e}")
