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

# Edge-TTS Neural voices — reliable, no quota issues
SUPPORTED_VOICES = {
    'Andrew (Male - Deep Rich)': 'en-US-AndrewNeural',
    'Ava (Female - Warm Natural)': 'en-US-AvaNeural',
    'Emma (Female - Clear Bright)': 'en-US-EmmaNeural',
    'Christopher (Male - Authoritative)': 'en-US-ChristopherNeural',
    'Brian (Male - Friendly)': 'en-US-BrianNeural',
    'Sara (Female - Professional)': 'en-US-SaraNeural',
    'Guy (Male - Conversational)': 'en-US-GuyNeural',
    'Tony (Male - Energetic)': 'en-US-TonyNeural',
}

# All voices are Edge-TTS Neural — Gemini TTS removed for reliability
GEMINI_VOICES = []

def generate_gemini_tts_file(text, voice, output_path):
    import struct
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    clean_text = VoiceSanitizer.clean(text)
    if not clean_text.strip(): clean_text = "..."
    if len(clean_text) > 5000: clean_text = clean_text[:5000]

    api_keys = [
        os.getenv('GOOGLE_STUDIO_API_KEY', ''),
        os.getenv('GOOGLE_STUDIO_API_KEY_2', ''),
        os.getenv('GOOGLE_STUDIO_API_KEY_3', '')
    ]
    api_keys = [k.strip() for k in api_keys if k and k.strip()]
    if not api_keys: return False

    max_retries = 4
    base_delay = 1.0
    key_index = 0

    for attempt in range(max_retries):
        api_key = api_keys[key_index % len(api_keys)]
        # Try stable TTS model first, fallback to preview
        tts_models = ['gemini-2.5-flash-tts', 'gemini-2.5-flash-preview-tts']
        for tts_model in tts_models:
            try:
                url = f'https://generativelanguage.googleapis.com/v1beta/models/{tts_model}:generateContent?key={api_key}'
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
                    key_index += 1
                    time.sleep(base_delay * (2 ** attempt))
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
                if not audio_b64: return False

                pcm_bytes = base64.b64decode(audio_b64)
                sample_rate = 24000
                num_channels = 1
                bits_per_sample = 16
                data_size = len(pcm_bytes)
                byte_rate = sample_rate * num_channels * bits_per_sample // 8
                block_align = num_channels * bits_per_sample // 8

                wav_header = struct.pack(
                    '<4sI4s4sIHHIIHH4sI',
                    b'RIFF', 36 + data_size, b'WAVE', b'fmt ', 16, 1,
                    num_channels, sample_rate, byte_rate, block_align,
                    bits_per_sample, b'data', data_size
                )
                with open(output_path, 'wb') as f:
                    f.write(wav_header + pcm_bytes)
                return True
            except Exception as e:
                logger.warning(f'[TTS] {tts_model} failed: {e}')
                continue
        # All TTS models failed for this key, try next key
        key_index += 1
        time.sleep(base_delay * (2 ** attempt))
    return False

def json_repair(json_str):
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
        if last_brace != -1: json_str = json_str[:last_brace+1] + ']'
        else: json_str += ']'
    json_str = re.sub(r',\s*\]', ']', json_str) 
    return json_str

def call_ai_with_retry(prompt, system_instruction, log_path, max_retries=3):
    ai_service = AIService()
    for attempt in range(max_retries):
        try:
            result = async_to_sync(ai_service.chat)([
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": prompt}
            ])
            if result and "trouble connecting" not in result.lower():
                return result
            time.sleep(2)
        except:
            time.sleep(1)
    return ""

def generate_tts_file(text, voice, output_path, fast_mode=False):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    clean_text = VoiceSanitizer.clean(text)
    if not clean_text.strip(): clean_text = "..."

    # Map Gemini voices to Edge-TTS equivalents (Gemini TTS produces WAV, not MP3)
    GEMINI_TO_EDGE = {
        'Aoede': 'en-US-JennyNeural',
        'Puck': 'en-US-ChristopherNeural',
        'Kore': 'en-US-AvaNeural',
        'Charon': 'en-US-AndrewNeural',
        'Fenrir': 'en-US-AndrewNeural',
        'Leda': 'en-US-AvaNeural',
        'Zephyr': 'en-US-AvaNeural',
        'Autonoe': 'en-US-EmmaNeural',
    }
    if voice in GEMINI_TO_EDGE:
        voice = GEMINI_TO_EDGE[voice]

    rate = "+10%" if fast_mode else "+0%"
    cmd = [
        sys.executable, "-m", "edge_tts",
        "--voice", voice,
        "--text", clean_text,
        f"--rate={rate}",
        "--write-media", output_path
    ]
    
    # Estimate min size: ~50 bytes per word is typical for MP3
    word_count = len(clean_text.split())
    min_size = max(1000, word_count * 50)
    
    for attempt in range(3):
        try:
            temp_path = output_path + ".tmp"
            cmd_with_temp = cmd[:-1] + [temp_path]
            result = subprocess.run(cmd_with_temp, check=False, capture_output=True, text=True, timeout=120)
            if result.returncode == 0 and os.path.exists(temp_path) and os.path.getsize(temp_path) > min_size:
                os.replace(temp_path, output_path)
                return True
            # Clean up partial temp file
            if os.path.exists(temp_path):
                os.remove(temp_path)
            time.sleep(2)
        except subprocess.TimeoutExpired:
            # Clean up partial temp file on timeout
            if os.path.exists(temp_path):
                os.remove(temp_path)
            time.sleep(2)
        except:
            time.sleep(2)
    return False

def generate_podcast_script(notes_json, length_pref=15, available_images=None, name_a="Host A", name_b="Host B", system_instruction=None):
    tts_dir = os.path.join(settings.MEDIA_ROOT, 'podcast_tts')
    os.makedirs(tts_dir, exist_ok=True)
    
    log_path = os.path.join(settings.BASE_DIR, 'podcast_debug.log')
    with open(log_path, 'w') as f: f.write("--- START ---\n")

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
        f"You are elite podcast producers. Write ONLY spoken dialogue for {name_a} (A) and {name_b} (B). "
        "STYLE: RAW & UNFILTERED, real banter, natural reactions like '(laughs)' or '(chuckles)'. Output raw JSON array only."
    )
    
    prompt = f"Write a masterclass podcast script based on these notes:\n{sections_text[:5000]}\n{img_context}\n- SPEAKERS: Use ID 'A' for {name_a} and 'B' for {name_b}.\n- STRUCTURE: [{{'speaker': 'A', 'text': '...'}}]\n- LENGTH: At least 25-30 segments.\n- Output ONLY raw JSON array."

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
                        if speaker and text:
                            standardized.append({"speaker": speaker, "text": text})
                return standardized
        except: pass

        found = []
        for obj_match in re.finditer(r'\{(?P<body>[\s\S]*?)\}', res_text):
            body = obj_match.group('body')
            spk_match = re.search(r'"speaker":\s*"(?P<spk>[ABab])"', body, re.IGNORECASE)
            if not spk_match: continue
            txt_match = re.search(r'"(?:text|line|content)":\s*"(?P<txt>.*?)(?<!\\)"(?=[\s\r\n]*[,}])', body, re.DOTALL)
            if not txt_match: continue
            spk_id = spk_match.group('spk').upper()
            txt_val = txt_match.group('txt').strip()
            found.append({"speaker": spk_id, "text": txt_val})
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
    recent = json.dumps(current_script[max(0, current_index-1) : current_index+1])
    prompt = f'Provide host response to: "{user_query}". Chat: {recent}. Output ONLY JSON array [{"speaker": "A" or "B", "text": "..."}].'
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
