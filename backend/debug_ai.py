import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'core.settings'
import django
django.setup()

import requests
from django.conf import settings

print("=== LIVE DEBUG ===")
print(f"Model from settings: {settings.OPENROUTER_MODEL}")
print(f"Key from settings: {settings.OPENROUTER_API_KEY[:25]}...")
print()

# Make the exact same call the service makes
headers = {
    'Authorization': f'Bearer {settings.OPENROUTER_API_KEY}',
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://flowstate.app',
    'X-Title': 'FlowState',
}
payload = {
    'model': settings.OPENROUTER_MODEL,
    'messages': [{'role': 'user', 'content': 'Say: WORKING'}],
    'max_tokens': 100,
}

print(f"Calling: {settings.OPENROUTER_BASE_URL}/chat/completions")
print(f"Payload model: {payload['model']}")
print()

r = requests.post(
    f'{settings.OPENROUTER_BASE_URL}/chat/completions',
    headers=headers,
    json=payload,
    timeout=30,
)
print(f"HTTP Status: {r.status_code}")
print(f"Full response: {r.text[:600]}")
