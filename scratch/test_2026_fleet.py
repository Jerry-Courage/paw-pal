import os
from google import genai
from dotenv import load_dotenv

# Load credentials
load_dotenv('backend/.env')

def test_2026_fleet():
    print("--- Infinite 2026 Study Fleet: Pre-Flight Test ---")
    
    api_key = os.getenv('GOOGLE_STUDIO_API_KEY')
    if not api_key:
        print("ERROR: GOOGLE_STUDIO_API_KEY not found in .env")
        return

    client = genai.Client(api_key=api_key)

    # 1. Test Gemma 3 27B (High Capacity Chat)
    print("\n[Test 1] Engaging Gemma 3 27B (High-Volume Engine)...")
    try:
        response = client.models.generate_content(
            model='models/gemma-3-27b-it',
            contents="Hello! Confirm your identity and current daily request capacity.",
            config={'max_output_tokens': 100}
        )
        # Strip potential emojis/non-ASCII for terminal safety
        clean_text = response.text.encode('ascii', 'ignore').decode('ascii').strip()
        print(f"SUCCESS: Gemma 3 Response: {clean_text}")
    except Exception as e:
        print(f"FAILED: Gemma 3 failed: {e}")

    # 2. Test Imagen 4 (Premium Visuals)
    print("\n[Test 2] Engaging Imagen 4 Fast (Visual Engine)...")
    try:
        # Trying the 'fast' identifier which often has more free quota
        response = client.models.generate_images(
            model='models/imagen-4.0-fast-generate-001',
            prompt="A futuristic holographic study assistant, ultra-detailed 2026 aesthetic.",
            config={'number_of_images': 1}
        )
        if response and hasattr(response, 'generated_images') and response.generated_images:
            print(f"SUCCESS: Imagen 4 generated {len(response.generated_images)} image(s) successfully.")
        else:
            print("FAILED: Imagen 4 returned no images.")
    except Exception as e:
        print(f"FAILED: Imagen 4 failed: {e}")

    print("\n--- Test Complete ---")

if __name__ == "__main__":
    test_2026_fleet()
