import os
from google import genai
from google.genai.types import HttpOptions

def list_models():
    api_key = os.getenv('GOOGLE_STUDIO_API_KEY')
    if not api_key:
        print("Error: GOOGLE_STUDIO_API_KEY not found in environment.")
        return

    # Try listing with v1beta
    print("--- Listing Models (v1beta) ---")
    try:
        client = genai.Client(api_key=api_key, http_options=HttpOptions(api_version="v1beta"))
        for m in client.models.list():
            print(f"Name: {m.name}, DisplayName: {m.display_name}")
    except Exception as e:
        print(f"v1beta listing failed: {e}")

    # Try listing with default (v1)
    print("\n--- Listing Models (v1) ---")
    try:
        client = genai.Client(api_key=api_key)
        for m in client.models.list():
            print(f"Name: {m.name}, DisplayName: {m.display_name}")
    except Exception as e:
        print(f"v1 listing failed: {e}")

if __name__ == "__main__":
    list_models()
