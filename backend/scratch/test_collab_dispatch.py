import os
import django
import sys

# Setup Django environment
sys.path.append(os.path.join(os.getcwd()))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from ai_assistant.services import AIService
from django.conf import settings

def test_collab_dispatch():
    print("MISSION: COLLAB DISPATCH VERIFICATION")
    ai = AIService()
    
    # Clear log for clean signal
    log_path = os.path.join(settings.BASE_DIR, 'podcast_debug.log')
    if os.path.exists(log_path):
        with open(log_path, 'w') as f: f.write("")

    # 1. Test Collab Dispatch (Should be Groq First)
    print("\n--- STAGE 1: COLLAB DISPATCH (EXPECTED: GROQ FIRST) ---")
    messages = [{"role": "user", "content": "Respond with 'Collab Success'."}]
    response = ai.collab_chat(messages)
    print(f"Collab Response: {response}")
    
    # 2. Test General Dispatch (Should be OpenRouter First)
    print("\n--- STAGE 2: GENERAL DISPATCH (EXPECTED: OPENROUTER FIRST) ---")
    messages = [{"role": "user", "content": "Respond with 'General Success'."}]
    response = ai.chat(messages)
    print(f"General Response: {response}")
    
    # 3. Verify Logs
    if os.path.exists(log_path):
        with open(log_path, 'r') as f:
            print("\nMISSION LOG ANALYSIS:")
            for line in f.readlines():
                print(f"  > {line.strip()}")

if __name__ == "__main__":
    test_collab_dispatch()
