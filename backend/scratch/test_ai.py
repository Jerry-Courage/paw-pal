import os
import sys
import django
import asyncio
import json
import logging

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

# Set logging to see our fallbacks
logging.basicConfig(level=logging.INFO)

from ai_assistant.services import AIService

async def test_streaming():
    print("--- STARTING TRIPLE-ENGINE AI CONNECTIVITY TEST ---")
    ai = AIService()
    messages = [
        {"role": "user", "content": "Rapid fire test: What is the capital of France? Keep it to one word."}
    ]
    
    print("\n[Requesting Stream...]")
    print("(Watch the logs below to see which engine takes the lead)\n")
    
    full_response = ""
    try:
        async for chunk in ai.chat_stream(messages):
            print(chunk, end="", flush=True)
            full_response += chunk
            
        print("\n\n--- TEST COMPLETE ---")
        if full_response:
            print(f"Final Response: {full_response.strip()}")
            # Determine success based on length
            if len(full_response.strip()) > 0:
                print("VERDICT: SUCCESS - AI is online.")
        else:
            print("VERDICT: FAILED - No tokens received.")
            
    except Exception as e:
        print(f"\nERROR DURING TEST: {e}")

if __name__ == "__main__":
    asyncio.run(test_streaming())
