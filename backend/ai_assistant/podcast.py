import os
import subprocess
import sys
import json
import time
import re
import base64
import requests as req
from django.conf import settings
from asgiref.sync import async_to_sync
from .services import AIService, VoiceSanitizer

# Default voices available for users to pick from (Gemini Live & Edge-TTS Neural)
SUPPORTED_VOICES = {
    'Aoede (Gemini Female)': 'Aoede',
    'Puck (Gemini Male)': 'Puck',
    'Kore (Gemini Female)': 'Kore',
    'Charon (Gemini Male)': 'Charon',
    'Fenrir (Gemini Male)': 'Fenrir',
    'Leda (Gemini Female)': 'Leda',
    'Zephyr (Gemini Female)': 'Zephyr',
    'Autonoe (Gemini Female)': 'Autonoe',
    'Andrew (Neural Male)': 'en-US-AndrewNeural',
    'Ava (Neural Female)': 'en-US-AvaNeural',
    'Emma (Neural Female)': 'en-US-EmmaNeural',
    'Christopher (Neural Male)': 'en-US-ChristopherNeural',
}

GEMINI_VOICES = ['Puck', 'Aoede', 'Kore', 'Charon', 'Fenrir', 'Leda', 'Zephyr', 'Autonoe']

def generate_gemini_tts_file(text, voice, output_path):
    """
    Uses Gemini Live TTS API for ultra-realistic conversational voices with 
    key rotation (GOOGLE_STUDIO_API_KEY, GOOGLE_STUDIO_API_KEY_2, GOOGLE_STUDIO_API_KEY_3) 
    and exponential backoff retry logic for 429 Too Many Requests.
    """
    import struct
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    clean_text = VoiceSanitizer.clean(text)
    if not clean_text.strip():
        clean_text = "..."
    if len(clean_text) > 1000:
        clean_text = clean_text[:1000]

    # Collect available API keys for rotation
    api_keys = [
        os.getenv('GOOGLE_STUDIO_API_KEY', ''),
        os.getenv('GOOGLE_STUDIO_API_KEY_2', ''),
        os.getenv('GOOGLE_STUDIO_API_KEY_3', '')
    ]
    api_keys = [k.strip() for k in api_keys if k and k.strip()]
    
    if not api_keys:
        print("[Gemini-TTS] No Google Studio API keys configured")
        return False

    max_retries = 6
    base_delay = 1.0
    key_index = 0

    for attempt in range(max_retries):
        api_key = api_keys[key_index % len(api_keys)]
        try:
            url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key={api_key}'
            payload = {
                'contents': [{'parts': [{'text': clean_text}]}],
                'generationConfig': {
                    'responseModalities': ['AUDIO'],
                    'speechConfig': {
                        'voiceConfig': {
                            'prebuiltVoiceConfig': {'voiceName': voice}
                        }
                    }
                }
            }
            resp = req.post(url, json=payload, timeout=30)
            
            if resp.status_code == 429:
                print(f"[Gemini-TTS] Rate limited (429) using key index {key_index % len(api_keys)}. Rotating key and retrying...")
                key_index += 1
                sleep_time = base_delay * (2 ** attempt)
                time.sleep(sleep_time)
                continue

            resp.raise_for_status()
            data = resp.json()

            audio_b64 = (
                data.get('candidates', [{}])[0]
                .get('content', {})
                .get('parts', [{}])[0]
                .get('inlineData', {})
                .get('data', '')
            )
            if not audio_b64:
                print("[Gemini-TTS] No audio in response")
                return False

            pcm_bytes = base64.b64decode(audio_b64)
            sample_rate = 24000
            num_channels = 1
            bits_per_sample = 16
            data_size = len(pcm_bytes)
            byte_rate = sample_rate * num_channels * bits_per_sample // 8
            block_align = num_channels * bits_per_sample // 8

            wav_header = struct.pack(
                '<4sI4s4sIHHIIHH4sI',
                b'RIFF',
                36 + data_size,
                b'WAVE',
                b'fmt ',
                16,
                1,
                num_channels,
                sample_rate,
                byte_rate,
                block_align,
                bits_per_sample,
                b'data',
                data_size
            )

            with open(output_path, 'wb') as f:
                f.write(wav_header + pcm_bytes)
            return True

        except req.exceptions.HTTPError as he:
            if he.response is not None and he.response.status_code == 429:
                print(f"[Gemini-TTS] Rate limited (429) caught via HTTPError. Rotating key and retrying...")
                key_index += 1
                sleep_time = base_delay * (2 ** attempt)
                time.sleep(sleep_time)
                continue
            print(f"[Gemini-TTS] HTTP Error: {he}")
            sleep_time = base_delay * (2 ** attempt)
            time.sleep(sleep_time)
        except Exception as e:
            print(f"[Gemini-TTS] Exception: {e}")
            sleep_time = base_delay * (2 ** attempt)
            time.sleep(sleep_time)

    print(f"[Gemini-TTS] Failed after {max_retries} attempts across available API keys.")
    return False

def json_repair(json_str):
    """Surgically repairs truncated JSON arrays if the AI gets cut off."""
    if not json_str: return "[]"
    json_str = json_str.strip()
    
    if json_str.startswith('```'):
        lines = json_str.splitlines()
        if lines and lines[0].startswith('```'): lines = lines[1:]
        if lines and lines[-1].strip() == '```': lines = lines[:-1]
        json_str = '\n'.join(lines).strip()

    if not json_str.startswith('['):
        start = json_str.find('[')
        if start != -1: json_str = json_str[start:]
        else: return "[]"
            
    if not json_str.endswith(']'):
        last_brace = json_str.rfind('}')
        if last_brace != -1:
            json_str = json_str[:last_brace+1] + ']'
        else:
            json_str += ']'
            
    json_str = re.sub(r',\s*\]', ']', json_str) 
    return json_str

def call_ai_with_retry(prompt, system_instruction, log_path, max_retries=3):
    result = ""
    ai_service = AIService()
    
    for attempt in range(max_retries):
        try:
            with open(log_path, 'a') as f:
                f.write(f"\n[OpenRouter] Requesting batch (Attempt {attempt+1})...\n")
            
            result = async_to_sync(ai_service.chat)([
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt}
            ])
            
            if result and "trouble connecting" not in result.lower():
                return result
            
            time.sleep(2)
        except Exception as e:
            with open(log_path, 'a') as f:
                f.write(f"\n[OpenRouter] Exception: {str(e)}\n")
            time.sleep(1)

    return result

def generate_tts_file(text, voice, output_path, fast_mode=False):
    if voice in GEMINI_VOICES:
        return generate_gemini_tts_file(text, voice, output_path)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    clean_text = VoiceSanitizer.clean(text)
    if not clean_text.strip():
        clean_text = "..."

    rate = "+10%" if fast_mode else "+0%"
    cmd = [
        sys.executable, "-m", "edge_tts",
        "--voice", voice,
        "--text", clean_text,
        f"--rate={rate}",
        "--write-media", output_path
    ]
    
    max_attempts = 2 if fast_mode else 3
    timeout = 15 if fast_mode else 30
    retry_delay = 1 if fast_mode else 2
    
    for attempt in range(max_attempts):
        try:
            result = subprocess.run(cmd, check=False, capture_output=True, text=True, timeout=timeout)
            if result.returncode == 0:
                return True
            time.sleep(retry_delay)
        except:
            time.sleep(retry_delay)

    return False

def generate_podcast_script(notes_json, length_pref=15, available_images=None, name_a="Host A", name_b="Host B", system_instruction=None):
    tts_dir = os.path.join(settings.MEDIA_ROOT, 'podcast_tts')
    os.makedirs(tts_dir, exist_ok=True)
    
    log_path = os.path.join(settings.BASE_DIR, 'podcast_debug.log')
    with open(log_path, 'w') as f:
        f.write(f"--- START ONE-SHOT GENERATION ---\n")

    sections_text = ""
    sections = notes_json.get('sections', [])[:20]
    for idx, sec in enumerate(sections):
        sections_text += f"{sec.get('title', 'Topic')}: {sec.get('content', '')}\n\n"

    img_context = ""
    if available_images:
        img_context = "\nRELEVANT VISUALS:\n"
        for img in available_images[:10]:
            img_context += f"- ID {img['id']} (Page {img['page_number']}): {str(img.get('description') or 'Diagram')[:70]}\n"

    sys_inst = system_instruction or (
        f"You are an elite podcast producer for top masterclasses. "
        f"Write ONLY spoken dialogue for {name_a} (A) and {name_b} (B). "
        "STYLE: RAW & UNFILTERED, real banter, natural reactions like '(laughs)' or '(chuckles)'. Output raw JSON array only."
    )
    
    prompt_template = """Write a masterclass podcast script based on these notes:
[MATERIAL]
[IMAGES]
- SPEAKERS: Use ID "A" for [NAME_A] and "B" for [NAME_B].
- STRUCTURE: [{"speaker": "A", "text": "...", "visual_ref": ID, "visual_prompt": "..."}]
- LENGTH: At least 25-30 segments.
- Output ONLY raw JSON array. Start immediately with '['."""
    
    prompt = prompt_template.replace("[MATERIAL]", sections_text[:5000]) \
                            .replace("[IMAGES]", img_context) \
                            .replace("[NAME_A]", name_a) \
                            .replace("[NAME_B]", name_b)

    res = call_ai_with_retry(prompt, sys_inst, log_path)

    def validate_script(res_text):
        if not res_text or not isinstance(res_text, str): return []
        try:
            data = json.loads(json_repair(res_text))
            if isinstance(data, list):
                standardized = []
                for item in data:
                    if isinstance(item, dict):
                        speaker = item.get('speaker')
                        text = item.get('text') or item.get('line') or item.get('content')
                        vref = item.get('visual_ref')
                        vprompt = item.get('visual_prompt')
                        if speaker and text:
                            chunk = {"speaker": speaker, "text": text}
                            if vref: chunk["visual_ref"] = vref
                            if vprompt: chunk["visual_prompt"] = vprompt
                            standardized.append(chunk)
                return standardized
        except: pass

        found = []
        for obj_match in re.finditer(r'\{(?P<body>[\s\S]*?)\}', res_text):
            body = obj_match.group('body')
            spk_match = re.search(r'"speaker":\s*"(?P<spk>[ABab]|' + re.escape(name_a) + r'|' + re.escape(name_b)  + r')"', body, re.IGNORECASE)
            if not spk_match: continue
            txt_match = re.search(r'"(?:text|line|content)":\s*"(?P<txt>.*?)(?<!\\)"(?=[\s\r\n]*[,}])', body, re.DOTALL)
            if not txt_match: continue
            s_val = spk_match.group('spk').upper()
            spk_id = 'B' if ('B' in s_val or name_b.upper() in s_val) else 'A'
            txt_val = txt_match.group('txt').strip()
            chunk = {"speaker": spk_id, "text": txt_val}
            vref_match = re.search(r'"visual_ref":\s*(?P<vref>\d+|"\d+")', body)
            if vref_match: chunk["visual_ref"] = vref_match.group('vref').strip('"')
            vprompt_match = re.search(r'"visual_prompt":\s*"(?P<vprompt>.*?)(?<!\\)"', body, re.DOTALL)
            if vprompt_match: chunk["visual_prompt"] = vprompt_match.group('vprompt').strip()
            found.append(chunk)
        return found

    final_script = validate_script(res)
    if not final_script or len(final_script) < 3:
        final_script = [
            {"speaker": "A", "text": "Welcome back to NITECast. Let's dive into our core material today."},
            {"speaker": "B", "text": "Excited to unpack this with you!"},
            {"speaker": "A", "text": "Let's get started."}
        ]
    return final_script

def handle_interruption(user_query, current_script, current_index, full_material="", available_images=None, name_a="Host A", name_b="Host B"):
    log_path = os.path.join(settings.BASE_DIR, 'podcast_debug.log')
    recent = json.dumps(current_script[max(0, current_index-1) : current_index+1])
    
    prompt = f'Provide host response to: "{user_query}". Chat: {recent}. Output ONLY JSON array [{"speaker": "A" or "B", "text": "...", "visual_ref": ID, "visual_prompt": "..."}].'
    ai_service = AIService()
    res = async_to_sync(ai_service.groq_chat)([
        {"role": "system", "content": "You are podcast host. Output ONLY JSON array."},
        {"role": "user", "content": prompt}
    ], max_tokens=512)
    
    try:
        data = json.loads(json_repair(res))
        if isinstance(data, list): return data
    except: pass
    return [{"speaker": "A", "text": "That's a great question."}]
