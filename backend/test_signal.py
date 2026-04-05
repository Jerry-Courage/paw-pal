import os
import requests
from dotenv import load_dotenv

load_dotenv()

def test_signals():
    print("\n--- ULTIMATE SIGNAL AUDIT ---")
    
    # 1. Groq Check
    groq_key = os.getenv('GROQ_API_KEY')
    print(f"Groq Signal: {'[OK]' if groq_key else '[MISSING KEY]'}")
    if groq_key:
        try:
            res = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {groq_key}"},
                json={"model": "llama-3.3-70b-versatile", "messages": [{"role": "user", "content": "ping"}]},
                timeout=5
            )
            print(f"  > Heartbeat: {res.status_code}")
        except Exception as e: print(f"  > Error: {str(e)}")

    # 2. OpenRouter Check
    or_key = os.getenv('OPENROUTER_API_KEY')
    print(f"\nOpenRouter Signal: {'[OK]' if or_key else '[MISSING KEY]'}")
    if or_key:
        models = [
            'meta-llama/llama-3.3-70b-instruct:free',
            'google/gemma-3-27b-it:free',
            'nousresearch/hermes-3-llama-3.1-405b:free',
            'google/gemini-2.0-flash-exp:free',
            'openrouter/auto'
        ]
        for model in models:
            try:
                res = requests.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {or_key}"},
                    json={"model": model, "messages": [{"role": "user", "content": "ping"}]},
                    timeout=5
                )
                status = "OK" if res.status_code == 200 else f"Congested ({res.status_code})"
                print(f"  > {model.split('/')[-1]}: {status}")
            except Exception as e: print(f"  > {model}: Error")

    # 3. Google Check
    google_key = os.getenv('GOOGLE_AI_KEY')
    print(f"\nGoogle Signal: {'[OK]' if google_key else '[OPTIONAL MISSING]'}")
    if google_key:
        try:
            # Using the v1 stable endpoint for gemini-1.5-flash
            url = f"https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key={google_key}"
            res = requests.post(url, json={"contents": [{"parts":[{"text": "ping"}]}]}, timeout=5)
            print(f"  > Heartbeat: {res.status_code}")
        except Exception as e: print(f"  > Error: {str(e)}")

    print("\n--- AUDIT COMPLETE ---")

if __name__ == "__main__":
    test_signals()
