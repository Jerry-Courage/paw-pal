import os
import sys
import django
import json

# Setup Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.contrib.auth import get_user_model
from ai_assistant.agent import FlowAgent
from ai_assistant.services import AIService

User = get_user_model()

def run_test():
    print("--- AI Agent Flow Simulation Test ---")
    
    # 1. Get or create test user
    user, created = User.objects.get_or_create(username='testauditor', email='audit@test.com')
    if created:
        user.set_password('testpass123')
        user.save()
        print(f"Created temporary test user: {user.username}")
    else:
        print(f"Using existing test user: {user.username}")

    # 2. Check API Key
    if not os.getenv('OPENROUTER_API_KEY'):
        print("ERROR: OPENROUTER_API_KEY not found in environment.")
        return

    # 3. Initialize Agent
    print(f"Initializing FlowAgent for user: {user.username}")
    agent = FlowAgent(user)
    
    # 4. Test Text Query (Simulating browser-transcribed audio)
    test_queries = [
        "Hey Flow, what are my upcoming assignments?",
        "Can you create a new assignment for me? Title it 'History Essay' due tomorrow.",
    ]
    
    for query in test_queries:
        print(f"\n[USER QUERY]: {query}")
        try:
            reply, action = agent.process_request(query)
            print(f"[AGENT REPLY]: {reply}")
            
            if action:
                print(f"[AGENT ACTION]: {json.dumps(action, indent=2)}")
                result = agent.execute_action(action)
                print(f"[EXECUTION RESULT]: {result}")
            else:
                print("[INFO] No tool execution triggered.")
                
        except Exception as e:
            print(f"[ERROR]: {str(e)}")

    print("\n--- Test Complete ---")

if __name__ == "__main__":
    run_test()
