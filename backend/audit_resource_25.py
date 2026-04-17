import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from library.models import Resource

try:
    r = Resource.objects.get(id=25)
    print(f"Resource ID: {r.id}")
    print(f"Title: {r.title}")
    print(f"URL: {r.url}")
    print("-" * 50)
    
    if r.ai_concepts:
        for i, concept in enumerate(r.ai_concepts):
            for key, val in concept.items():
                print(f"Concept key: {key}")
                print(f"Content Sample (first 500 chars):\n{str(val)[:500]}")
                print(f"Total Length: {len(str(val))}")
    else:
        print("No ai_concepts found.")
        
except Exception as e:
    print(f"Error: {e}")
