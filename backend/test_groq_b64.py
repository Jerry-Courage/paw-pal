import os
from dotenv import load_dotenv

load_dotenv()
key = os.getenv('GROQ_API_KEY', 'your-key-here')

# Generate a 10x10 solid red PNG programmatically (no file needed)
def make_red_png():
    def chunk(name, data):
        c = zlib.crc32(name + data) & 0xffffffff
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', c)
    
    w, h = 10, 10
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    raw = b''.join(b'\x00' + b'\xff\x00\x00' * w for _ in range(h))
    idat = zlib.compress(raw)
    
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', ihdr)
    png += chunk(b'IDAT', idat)
    png += chunk(b'IEND', b'')
    return png

png_bytes = make_red_png()
b64 = base64.b64encode(png_bytes).decode('utf-8')
print(f'Image size: {len(png_bytes)} bytes, base64 length: {len(b64)}')

resp = requests.post(
    'https://api.groq.com/openai/v1/chat/completions',
    headers={'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'},
    json={
        'model': 'meta-llama/llama-4-scout-17b-16e-instruct',
        'messages': [{
            'role': 'user',
            'content': [
                {'type': 'text', 'text': 'What is the dominant color in this image? Answer in one word.'},
                {'type': 'image_url', 'image_url': {'url': f'data:image/png;base64,{b64}'}}
            ]
        }],
        'max_tokens': 30,
    },
    timeout=30,
)

print(f'Status: {resp.status_code}')
if resp.status_code == 200:
    content = resp.json()['choices'][0]['message']['content']
    print(f'Response: "{content}"')
    print('\n✓ Groq vision WORKS! Image analysis is enabled.')
else:
    err = resp.json().get('error', {}).get('message', resp.text[:300])
    print(f'Error: {err}')
