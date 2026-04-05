"""Check available models and find any that support vision."""
import os, django, requests
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()
from django.conf import settings

API_KEY = settings.OPENROUTER_API_KEY
resp = requests.get(
    'https://openrouter.ai/api/v1/models',
    headers={'Authorization': f'Bearer {API_KEY}'},
    timeout=15
)
if resp.status_code != 200:
    print(f"Failed: {resp.status_code}")
    exit()

models = resp.json().get('data', [])
print(f"Total models available: {len(models)}\n")

# Find free vision models
vision_free = [m for m in models if
    any('vision' in str(m.get('architecture', {}).get('modality', '')).lower() or
        'image' in str(m.get('architecture', {}).get('input_modalities', [])).lower()
        for _ in [1]) and
    float(m.get('pricing', {}).get('prompt', '1') or '1') == 0
]

# Find all free models
free_models = [m for m in models if
    float(m.get('pricing', {}).get('prompt', '1') or '1') == 0
]

print(f"Free models: {len(free_models)}")
print(f"Free vision models: {len(vision_free)}\n")

if vision_free:
    print("FREE VISION MODELS:")
    for m in vision_free[:10]:
        print(f"  {m['id']}")
else:
    print("No free vision models found.")
    print("\nAll free models available:")
    for m in free_models[:15]:
        print(f"  {m['id']}")

# Also check what modalities the current model supports
current = settings.OPENROUTER_MODEL
current_model = next((m for m in models if m['id'] == current), None)
if current_model:
    print(f"\nYour current model ({current}):")
    print(f"  Architecture: {current_model.get('architecture', {})}")
    print(f"  Pricing: {current_model.get('pricing', {})}")
