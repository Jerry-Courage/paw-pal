import requests

import os
from dotenv import load_dotenv

load_dotenv()
KEY = os.getenv('OPENROUTER_API_KEY', 'your-key-here')

candidates = [
    'google/gemma-3n-e4b-it:free',
    'qwen/qwen3-4b:free',
    'arcee-ai/trinity-mini:free',
    'stepfun/step-3.5-flash:free',
    'liquid/lfm-2.5-1.2b-instruct:free',
    'openrouter/free',
    'google/gemma-3n-e2b-it:free',
    'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
]

print("Testing models for actual content output...\n")
for model in candidates:
    try:
        r = requests.post(
            'https://openrouter.ai/api/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {KEY}',
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://flowstate.app',
                'X-Title': 'FlowState',
            },
            json={
                'model': model,
                'messages': [{'role': 'user', 'content': 'Reply with just the word: WORKING'}],
                'max_tokens': 20,
            },
            timeout=20
        )
        if r.status_code == 200:
            msg = r.json()['choices'][0]['message']
            content = msg.get('content') or ''
            if content and content.strip():
                print(f'WINNER: {model}')
                print(f'Reply: {content.strip()}')
                print(f'\nUpdate backend/.env:')
                print(f'OPENROUTER_MODEL={model}')
                break
            else:
                print(f'SKIP (no content): {model}')
        else:
            err = r.json().get('error', {}).get('message', '')[:60]
            print(f'FAIL {r.status_code}: {model} - {err}')
    except Exception as e:
        print(f'ERROR: {model} - {e}')
