import os
import requests
import base64
import json

# Load environment
from dotenv import load_dotenv
load_dotenv()

API_KEY = os.getenv('OPENROUTER_API_KEY')
RED_DOT = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=="

MODELS_TO_TEST = [
    'google/gemini-2.0-flash-exp:free',
    'google/gemini-2.0-flash-001:free',
    'meta-llama/llama-3.2-11b-vision-instruct:free',
    'qwen/qwen2.5-vl-72b-instruct:free',
    'mistralai/pixtral-12b:free',
]

def test_model(model_name):
    print(f"Testing {model_name}...")
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://flowstate.app",
        "X-Title": "FlowState",
    }
    payload = {
        "model": model_name,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "What is in this image? Reply with one word (the color)."},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{RED_DOT}"
                        }
                    }
                ]
            }
        ],
        "max_tokens": 10
    }
    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=15
        )
        if response.status_code == 200:
            print(f"  SUCCESS: {response.json()['choices'][0]['message']['content'].strip()}")
            return True
        else:
            print(f"  FAILED ({response.status_code}): {response.text[:200]}")
            return False
    except Exception as e:
        print(f"  ERROR: {str(e)}")
        return False

if __name__ == "__main__":
    if not API_KEY:
        print("Error: OPENROUTER_API_KEY not found in environment.")
    else:
        results = {}
        for model in MODELS_TO_TEST:
            results[model] = test_model(model)
        
        print("\nSummary:")
        for m, success in results.items():
            status = "WORKING" if success else "FAILING"
            print(f"- {m}: {status}")
