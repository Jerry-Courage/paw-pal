import os
import sys
import django
from django.conf import settings

# Set up Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from ai_assistant.image_service import generate_ai_image

def test():
    prompt = "A professional diagram of the human digestive system showing the esophagus and stomach"
    print(f"Testing Pollinations.ai fallback with prompt: '{prompt}'...")
    
    # This will try HF first (failing with 402) and then hit Pollinations
    url = generate_ai_image(prompt)
    
    if url and "pollinations.ai" in url:
        print("\n✅ SUCCESS: Pollinations.ai Fallback Triggered!")
        print(f"URL: {url}")
    elif url and "data:image" in url:
        print("\n✅ SUCCESS: Got a Base64 image (likely from HF).")
    else:
        print("\n❌ FAILURE: No image URL returned.")

if __name__ == "__main__":
    test()
