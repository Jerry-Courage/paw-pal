import requests

import os
from dotenv import load_dotenv

load_dotenv()
key = os.getenv('GROQ_API_KEY', 'your-key-here')

# Test 1: URL-based image (Groq may not support base64)
print("Test 1: URL-based image")
resp = requests.post(
    'https://api.groq.com/openai/v1/chat/completions',
    headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
    json={
        'model': 'meta-llama/llama-4-scout-17b-16e-instruct',
        'messages': [{
            'role': 'user',
            'content': [
                {'type': 'text', 'text': 'What do you see in this image? One sentence.'},
                {'type': 'image_url', 'image_url': {
                    'url': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Sunrise_over_the_sea.jpg/320px-Sunrise_over_the_sea.jpg'
                }}
            ]
        }],
        'max_tokens': 50,
    },
    timeout=30,
)
print(f'Status: {resp.status_code}')
if resp.status_code == 200:
    content = resp.json()['choices'][0]['message']['content']
    print(f'Response: {content}')
    print('\n✓ Groq vision works with URL images!')
else:
    err = resp.json().get('error', {}).get('message', resp.text[:200])
    print(f'Error: {err}')

# Test 2: base64 with proper format
print("\nTest 2: base64 image")
import base64
# Download a small image and encode it
img_resp = requests.get('https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Sunrise_over_the_sea.jpg/320px-Sunrise_over_the_sea.jpg', timeout=10)
if img_resp.status_code == 200:
    b64 = base64.b64encode(img_resp.content).decode('utf-8')
    resp2 = requests.post(
        'https://api.groq.com/openai/v1/chat/completions',
        headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
        json={
            'model': 'meta-llama/llama-4-scout-17b-16e-instruct',
            'messages': [{
                'role': 'user',
                'content': [
                    {'type': 'text', 'text': 'What color is the sky? One word.'},
                    {'type': 'image_url', 'image_url': {'url': f'data:image/jpeg;base64,{b64}'}}
                ]
            }],
            'max_tokens': 20,
        },
        timeout=30,
    )
    print(f'Status: {resp2.status_code}')
    if resp2.status_code == 200:
        content = resp2.json()['choices'][0]['message']['content']
        print(f'Response: {content}')
        print('\n✓ Groq vision works with base64 images!')
    else:
        err = resp2.json().get('error', {}).get('message', resp2.text[:200])
        print(f'Error: {err}')
