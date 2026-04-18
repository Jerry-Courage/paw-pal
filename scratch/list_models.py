import os
from google import genai
from dotenv import load_dotenv

# Load credentials
load_dotenv('backend/.env')

def list_and_test():
    print("--- Infinite 2026 SDK Audit ---")
    
    api_key = os.getenv('GOOGLE_STUDIO_API_KEY')
    client = genai.Client(api_key=api_key)

    print("\n[Scanning API for available models...]")
    try:
        print("\n[Inspecting client.models attributes...]")
        print(dir(client.models))
        
        # Also just try listing to be safe
        for model in client.models.list():
            if 'imagen-4.0-ultra' in model.name:
                print(f"TARGET: {model.name} | ACTIONS: {model.supported_actions}")
    except Exception as e:
        print(f"ERROR listing models: {e}")

    print("\n--- Audit Complete ---")

if __name__ == "__main__":
    list_and_test()
