"""
Test vision capabilities. Run: python test_vision.py
"""
import os, sys, django, requests, time
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()
from django.conf import settings

# 1x1 red pixel PNG
RED = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=="

GROQ_KEY = os.environ.get('GROQ_API_KEY', '').strip()
GOOGLE_KEY = os.environ.get('GOOGLE_AI_KEY', '').strip()

print("=" * 55)
print("FlowState Vision Test")
print("=" * 55)

# ── Test Groq ─────────────────────────────────────────────
if GROQ_KEY:
    print(f"\n[Groq] Testing llama-3.2-11b-vision with key {GROQ_KEY[:8]}...")
    try:
        resp = requests.post(
            'https://api.groq.com/openai/v1/chat/completions',
            headers={'Authorization': f'Bearer {GROQ_KEY}', 'Content-Type': 'application/json'},
            json={
                'model': 'meta-llama/llama-4-scout-17b-16e-instruct',
                'messages': [{
                    'role': 'user',
                    'content': [
                        {'type': 'text', 'text': 'What color is this image? One word.'},
                        {'type': 'image_url', 'image_url': {'url': f'data:image/png;base64,{RED}'}}
                    ]
                }],
                'max_tokens': 20,
            },
            timeout=30,
        )
        if resp.status_code == 200:
            answer = resp.json()['choices'][0]['message']['content'].strip()
            print(f"  ✓ Groq vision works! Response: '{answer}'")
        else:
            err = resp.json().get('error', {}).get('message', resp.text[:80])
            print(f"  ✗ Groq failed {resp.status_code}: {err}")
    except Exception as e:
        print(f"  ✗ Groq error: {e}")
else:
    print("\n[Groq] No GROQ_API_KEY set — skipping")
    print("  → Get a free key at console.groq.com")

# ── Test Google ───────────────────────────────────────────
if GOOGLE_KEY:
    print(f"\n[Google] Testing Gemini 2.0 Flash with key {GOOGLE_KEY[:8]}...")
    try:
        resp = requests.post(
            f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GOOGLE_KEY}',
            json={
                'contents': [{'role': 'user', 'parts': [
                    {'text': 'What color is this 1x1 pixel? One word.'},
                    {'inline_data': {'mime_type': 'image/png', 'data': RED}}
                ]}],
                'generationConfig': {'maxOutputTokens': 20}
            },
            timeout=15,
        )
        if resp.status_code == 200:
            answer = resp.json()['candidates'][0]['content']['parts'][0]['text'].strip()
            print(f"  ✓ Google vision works! Response: '{answer}'")
        else:
            err = resp.json().get('error', {}).get('message', '')[:80]
            print(f"  ✗ Google failed {resp.status_code}: {err}")
    except Exception as e:
        print(f"  ✗ Google error: {e}")
else:
    print("\n[Google] No GOOGLE_AI_KEY set — skipping")

print("\n" + "=" * 55)
if not GROQ_KEY and not GOOGLE_KEY:
    print("No vision keys configured.")
    print("Add GROQ_API_KEY to .env (free at console.groq.com)")
