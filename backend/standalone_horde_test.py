import requests
import base64
import time
import random

def test_lexica(prompt):
    print(f"🔍 Testing Lexica: '{prompt}'")
    url = f"https://lexica.art/api/v1/search?q={requests.utils.quote(prompt)}"
    res = requests.get(url, timeout=10)
    if res.status_code == 200:
        images = res.json().get('images', [])
        if images:
            img_url = images[0].get('src')
            print(f"✅ Lexica Success: {img_url}")
            return img_url
    return None

def test_horde(prompt):
    print(f"🎨 Testing Stable Horde: '{prompt}'")
    url = "https://stablehorde.net/api/v2/generate/async"
    payload = {
        "prompt": prompt,
        "params": {"n": 1, "steps": 20, "width": 512, "height": 512},
        "models": ["stable_diffusion"]
    }
    headers = {"apikey": "0000000000", "Client-Agent": "HordeTester:1.0"}
    
    post_res = requests.post(url, json=payload, headers=headers, timeout=15)
    if post_res.status_code == 202:
        job_id = post_res.json().get("id")
        print(f"⏳ Horde Job Created: {job_id}. Waiting...")
        
        for _ in range(20): # Wait up to 60s
            time.sleep(3)
            status_res = requests.get(f"https://stablehorde.net/api/v2/generate/status/{job_id}", headers=headers)
            if status_res.status_code == 200:
                data = status_res.json()
                if data.get("done"):
                    img_url = data.get("generations", [])[0].get("img")
                    print(f"✅ Horde Success: {img_url}")
                    return img_url
    return None

def main():
    prompts = [
        "Professional medical illustration of a human heart",
        "3D render of a futuristic laboratory"
    ]
    
    for i, p in enumerate(prompts):
        print(f"\n--- TEST {i+1} ---")
        # Try Lexica first
        url = test_lexica(p)
        if not url:
            # Fallback to Horde
            url = test_horde(p)
            
        if url:
            # Save it to disk for the user to see
            img_data = requests.get(url).content
            filename = f"horde_test_{i+1}.png"
            with open(filename, "wb") as f:
                f.write(img_data)
            print(f"📁 Image saved to: {filename}")

if __name__ == "__main__":
    main()
