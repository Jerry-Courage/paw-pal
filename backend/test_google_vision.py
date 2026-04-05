"""
Test Google Gemini vision.
Usage: python test_google_vision.py YOUR_GOOGLE_AI_KEY
Or set GOOGLE_AI_KEY in .env first.
"""
import os, sys, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from ai_assistant.services import AIService

# Allow passing key as argument for quick testing
if len(sys.argv) > 1:
    os.environ['GOOGLE_AI_KEY'] = sys.argv[1]

key = os.environ.get('GOOGLE_AI_KEY', '').strip()
if not key:
    print("No GOOGLE_AI_KEY found.")
    print("Usage: python test_google_vision.py YOUR_KEY")
    print("Or add GOOGLE_AI_KEY=your_key to backend/.env")
    sys.exit(1)

print(f"Testing Google Gemini vision with key: {key[:8]}...\n")

# 1x1 red pixel PNG
RED_PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=="

ai = AIService()
messages = [{
    'role': 'user',
    'content': [
        {'type': 'text', 'text': 'What color is this image? Reply in one word.'},
        {'type': 'image_url', 'image_url': {'url': f'data:image/png;base64,{RED_PIXEL}'}}
    ]
}]

result = ai._call_google_vision(messages, key)
if result:
    print(f"✓ Google vision works!")
    print(f"  Response: '{result.strip()}'")
    print(f"\nImage analysis is now enabled. Add GOOGLE_AI_KEY={key} to your .env")
else:
    print("✗ Google vision returned empty response. Check your key.")
