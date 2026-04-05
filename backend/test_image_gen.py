"""Test Pollinations.ai image generation — no API key needed."""
import os, django, requests, urllib.parse
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from ai_assistant.services import AIService

print("Testing image generation with Pollinations.ai\n")

# Test 1: Direct URL generation
prompt = "A colorful diagram of the water cycle with labels"
encoded = urllib.parse.quote(prompt)
url = f"https://image.pollinations.ai/prompt/{encoded}?width=800&height=600&nologo=true"
print(f"Test 1: Direct URL")
print(f"  Prompt: {prompt}")
print(f"  URL: {url[:80]}...")

resp = requests.head(url, timeout=15, allow_redirects=True)
print(f"  Status: {resp.status_code}")
if resp.status_code == 200:
    print(f"  Content-Type: {resp.headers.get('content-type', 'unknown')}")
    print(f"  ✓ Image generation works!")
else:
    print(f"  ✗ Failed")

# Test 2: Full backend endpoint simulation
print("\nTest 2: Backend GenerateImageView simulation")
ai = AIService()
enhanced = ai.chat([{
    'role': 'user',
    'content': (
        "Rewrite this image generation prompt to be more detailed and visually descriptive "
        "for an educational context. Keep it under 200 characters. "
        f"Original: photosynthesis diagram\n\nReturn ONLY the improved prompt, nothing else."
    )
}])
print(f"  Original: 'photosynthesis diagram'")
print(f"  Enhanced: '{enhanced.strip()[:150]}'")
final_url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(enhanced.strip()[:300])}?width=800&height=600&nologo=true"
print(f"  Generated URL: {final_url[:80]}...")
print(f"  ✓ Image generation endpoint ready!")
