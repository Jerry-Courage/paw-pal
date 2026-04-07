import os
import django
import sys

# Setup Django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from ai_assistant.services import AIService

def test_generation():
    ai = AIService()
    prompt = "A high-tech library for futuristic students, with glowing hologram study guides and a sleek modern interior, highly realistic, masterpiece quality."
    
    print(f"--- Testing Image Generation ---")
    print(f"Prompt: {prompt}")
    
    # This calls the new method we just added
    image_url = ai.generate_image(prompt)
    
    if image_url:
        print(f"\u2705 SUCCESS!")
        # Truncate if it's a long base64 string
        display_url = image_url[:100] + "..." if len(image_url) > 100 else image_url
        print(f"Image Data: {display_url}")
        
        # Save to file for manual preview
        if image_url.startswith('data:image'):
            try:
                import base64
                header, base64_str = image_url.split(',', 1)
                ext = header.split('/')[1].split(';')[0]
                with open(f"final_gen_test.{ext}", "wb") as f:
                    f.write(base64.b64decode(base64_str))
                print(f"Saved preview image to final_gen_test.{ext}")
            except Exception as e:
                print(f"Error saving image file: {e}")
        else:
            print(f"Result is a URL list: {image_url}")
    else:
        print(f"\u274c FAILED: Check vision_debug.log")

if __name__ == "__main__":
    test_generation()
