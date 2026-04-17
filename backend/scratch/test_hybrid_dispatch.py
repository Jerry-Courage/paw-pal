import os
import django
import sys

# Setup Django environment
sys.path.append(os.path.join(os.getcwd()))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from ai_assistant.services import AIService
from django.conf import settings

def test_hybrid_dispatch():
    print("MISSION: HYBRID DISPATCH VERIFICATION")
    ai = AIService()
    
    # 1. Test Primary Dispatch (Should be Groq)
    print("\n--- STAGE 1: PRIMARY DISPATCH ---")
    messages = [{"role": "user", "content": "Respond with the word 'Success'."}]
    try:
        response = ai.chat(messages)
        print(f"Final Response: {response}")
        
        # Check logs to see what was used
        log_path = os.path.join(settings.BASE_DIR, 'podcast_debug.log')
        if os.path.exists(log_path):
            with open(log_path, 'r') as f:
                last_logs = f.readlines()[-5:]
                print("Recent Logs:")
                for log in last_logs:
                    print(f"  > {log.strip()}")
    except Exception as e:
        print(f"Critical Failure: {e}")

if __name__ == "__main__":
    test_hybrid_dispatch()
