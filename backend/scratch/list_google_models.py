import os
import sys
import django
from google import genai

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

def list_google_models():
    print("--- GOOGLE MODEL LISTER ---")
    key = os.getenv('GOOGLE_STUDIO_API_KEY')
    if not key:
        print("No Google Key found.")
        return

    try:
        client = genai.Client(api_key=key)
        print("Connected. Fetching models...")
        
        # In newer SDKs, list_models might be under models.list
        for model in client.models.list():
            print(f"- {model.name}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_google_models()
