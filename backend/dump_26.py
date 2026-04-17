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
    data = {
        "id": r.id,
        "title": r.title,
        "status": r.status,
        "notes": r.ai_notes_json
    }
    with open('res_26_debug.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("SUCCESS: res_26_debug.json created.")
except Exception as e:
    print(f"FAILED: {e}")
