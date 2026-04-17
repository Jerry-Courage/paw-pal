import os
import sys
import django
from google import genai

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

def test_google_direct():
    print("--- GOOGLE SDK DIAGNOSTIC ---")
    key = os.getenv('GOOGLE_STUDIO_API_KEY')
    print(f"Key found: {'Yes' if key else 'No'} (Starts with: {key[:5] if key else 'None'})")
    
    if not key:
        return

    try:
        # Use the correct API key from .env
        client = genai.Client(api_key=key)
        print("Client initialized. Requesting generation...")
        
        # Test 1: Generate Content
        # Specify a known good model
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents='Say "Google is online" in one word.'
        )
        print(f"Response: {response.text}")
        
    except Exception as e:
        print(f"\nGOOGLE ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_google_direct()
