import requests
import base64
import time
import random

def test_horde_only(prompt):
    print(f"🎨 Testing Stable Horde: '{prompt}'")
    url = "https://stablehorde.net/api/v2/generate/async"
    payload = {
        "prompt": f"Professional medical diagram: {prompt}. high resolution, 4k, clean scientific illustration.",
        "params": {"n": 1, "steps": 25, "width": 512, "height": 512, "k_type": "k_euler"},
        "models": ["stable_diffusion_2.1", "stable_diffusion"]
    }
    headers = {"apikey": "0000000000", "Client-Agent": "HordeTester:1.0"}
    
    post_res = requests.post(url, json=payload, headers=headers, timeout=15)
    if post_res.status_code == 202:
        job_id = post_res.json().get("id")
        print(f"⏳ Horde Job Created: {job_id}. Waiting...")
        
        for _ in range(25): # Wait up to 75s
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
    prompt = "Detailed diagram of the human gastrointestinal (GI) tract"
    url = test_horde_only(prompt)
    if url:
        img_data = requests.get(url).content
        filename = "horde_test_gi.png"
        with open(filename, "wb") as f:
            f.write(img_data)
        print(f"📁 Image saved to: {filename}")
    else:
        print("❌ Horde Test Failed.")

if __name__ == "__main__":
    main()
