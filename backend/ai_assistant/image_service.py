import os
import requests
import logging
import base64
import random
import time
import re
from django.conf import settings

logger = logging.getLogger(__name__)

def get_dynamic_styling(prompt):
    """
    Detects if the prompt is medical/scientific and returns the appropriate style suffix.
    """
    scientific_keywords = [
        'heart', 'lung', 'digestive', 'stomach', 'anatomy', 'medical', 'science', 
        'cell', 'molecule', 'biological', 'organ', 'body', 'tract', 'system', 
        'diagram', 'infographic', 'scientific', 'health', 'medicine'
    ]
    
    is_scientific = any(k in prompt.lower() for k in scientific_keywords)
    
    if is_scientific:
        return "Professional medical illustration, clean scientific diagram, 4k"
    else:
        # For non-medical topics like 'peacocks' or 'jesters'
        return "Professional digital art illustration, vibrant colors, detailed, 4k"

def generate_ai_image(prompt):
    """
    Hyper-Fast Vision Stack V6 (Dynamic Styling).
    Priority 1: Lexica Search (Instant)
    Priority 2: Pollinations AI (Instant Generative)
    Priority 3: Stable Horde (Deep Fallback Generative)
    """
    
    # 1. CLEAN THE PROMPT
    filler_regex = r'\b(a|an|the|stylized|animation|of|showing|graphic|introductory|with|podcast|logo|icon|illustration|card|title|overview|engaging|infographic|metaphorical|representation|split|screen|side|by|side|comparison|segment|chunk|clip|video)\b'
    clean_p = re.sub(filler_regex, '', prompt.lower(), flags=re.IGNORECASE)
    clean_p = re.sub(r'\s+', ' ', clean_p).strip()
    words = [w for w in clean_p.split() if len(w) > 3]
    
    style = get_dynamic_styling(prompt)
    
    # --- TIER 1: LEXICA (Instant Search) ---
    search_queries = []
    if words:
        search_queries.append(" ".join(words[:6]))
        search_queries.append(f"{' '.join(words[:3])} {style}")
    search_queries.append(f"high quality {style}") 

    for query in search_queries:
        try:
            lexica_url = f"https://lexica.art/api/v1/search?q={requests.utils.quote(query)}"
            logger.info(f"Tier 1 Lexica: '{query}'")
            res = requests.get(lexica_url, timeout=5)
            if res.status_code == 200:
                images = res.json().get('images', [])
                if images:
                    img_url = random.choice(images[:5]).get('src')
                    img_res = requests.get(img_url, timeout=8)
                    if img_res.status_code == 200:
                        encoded = base64.b64encode(img_res.content).decode('utf-8')
                        logger.info("✅ Tier 1 Success (Instant Search)")
                        return f"data:image/jpeg;base64,{encoded}"
        except Exception: continue

    # --- TIER 2: POLLINATIONS (Instant Generative) ---
    try:
        logger.info(f"Tier 2 Pollinations: Fast Generation for '{clean_p[:40]}...'")
        full_prompt = f"{prompt}. {style}."
        encoded_prompt = requests.utils.quote(full_prompt)
        poll_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1024&height=1024&nologo=true&model=flux"
        
        res = requests.get(poll_url, timeout=12)
        if res.status_code == 200:
            encoded = base64.b64encode(res.content).decode('utf-8')
            logger.info("✅ Tier 2 Success (Instant Generation)")
            return f"data:image/jpeg;base64,{encoded}"
    except Exception: pass

    # --- TIER 3: STABLE HORDE (Deep Fallback) ---
    try:
        logger.info(f"Tier 3 Horde: Fallback Generation for '{clean_p[:40]}...'")
        horde_url = "https://stablehorde.net/api/v2/generate/async"
        payload = {
            "prompt": f"{prompt}. {style}.",
            "params": {"n": 1, "width": 1024, "height": 1024, "steps": 20, "censor_nsfw": True},
            "models": ["stable_diffusion_2.1", "stable_diffusion"]
        }
        headers = {"apikey": "0000000000", "Client-Agent": "FlowState:1.0:github"}
        post_res = requests.post(horde_url, json=payload, headers=headers, timeout=10)
        if post_res.status_code == 202:
            job_id = post_res.json().get("id")
            start_poll = time.time()
            while time.time() - start_poll < 20:
                time.sleep(3)
                check_res = requests.get(f"https://stablehorde.net/api/v2/generate/status/{job_id}", headers=headers)
                if check_res.status_code == 200:
                    status_data = check_res.json()
                    if status_data.get("done") is True:
                        generations = status_data.get("generations", [])
                        if generations:
                            img_url = generations[0].get("img")
                            img_res = requests.get(img_url, timeout=10)
                            if img_res.status_code == 200:
                                encoded = base64.b64encode(img_res.content).decode('utf-8')
                                logger.info("✅ Tier 3 Success (Horde Fallback)")
                                return f"data:image/webp;base64,{encoded}"
                        break
    except Exception: pass

    # --- FINAL FALLBACK: Unsplash ---
    try:
        query = words[0] if words else "science"
        url = f"https://images.unsplash.com/photo-1628191140046-8de994a974b2?auto=format&fit=crop&q=80&w=800&q={query}"
        res = requests.get(url, timeout=5)
        if res.status_code == 200:
            encoded = base64.b64encode(res.content).decode('utf-8')
            return f"data:image/jpeg;base64,{encoded}"
    except Exception: pass
    
    return None

def get_fallback_image(prompt):
    return generate_ai_image(prompt)
