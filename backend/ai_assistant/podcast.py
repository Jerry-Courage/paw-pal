import os
import subprocess
import sys
import json
import time
import re
import requests as req
from django.conf import settings
from asgiref.sync import async_to_sync
from .services import AIService, VoiceSanitizer

# Default voices available for users to pick from
SUPPORTED_VOICES = {
    'Christopher': 'en-US-ChristopherNeural',
    'Jenny': 'en-US-JennyNeural',
    'Guy': 'en-US-GuyNeural',
    'Aria': 'en-US-AriaNeural',
    'Ava': 'en-US-AvaNeural',
    'Emma': 'en-US-EmmaNeural',
    'Andrew': 'en-US-AndrewNeural',
}

def json_repair(json_str):
    """Surgically repairs truncated JSON arrays if the AI gets cut off."""
    if not json_str: return "[]"
    json_str = json_str.strip()
    
    # Remove markdown code blocks if present
    if json_str.startswith('```'):
        lines = json_str.splitlines()
        # Remove the first line if it's ```json or ```
        if lines and lines[0].startswith('```'): lines = lines[1:]
        # Remove the last line if it's ```
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
    """
    Calls OpenRouter via the existing AIService. 
    Keeps the batching and repair logic to ensure stability even with free models.
    """
    result = ""
    # We use the existing AIService which defaults to openrouter/auto
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
            
            # If we get an error string, wait a bit before retry
            wait = 2
            time.sleep(wait)
        except Exception as e:
            with open(log_path, 'a') as f:
                f.write(f"\n[OpenRouter] Exception: {str(e)}\n")
            time.sleep(1)

    return result

def generate_tts_file(text, voice, output_path):
    """
    Safely invokes edge-tts via subprocess to render an MP3 file locally.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # 1. Humanoid Cleanup: Strip artifacts and handle organic pauses
    clean_text = VoiceSanitizer.clean(text)
    
    # 2. Render via edge-tts with voice-specific prosody tuning
    # Andrew (Multilingual) sounds best slightly slower (-5%) for humanoid naturalism
    rate = "+0%"
    if 'AndrewNeural' in voice:
        rate = "-5%"
    
    cmd = [
        sys.executable, "-m", "edge_tts", 
        "--voice", voice, 
        "--text", clean_text, 
        f"--rate={rate}",
        "--write-media", output_path
    ]
    
    for attempt in range(3):
        try:
            result = subprocess.run(cmd, check=False, capture_output=True, text=True)
            if result.returncode == 0: 
                return True
            else:
                print(f"TTS Error [Attempt {attempt+1}]: {result.stderr}")
            time.sleep(1)
        except Exception as e:
            print(f"TTS Exception: {str(e)}")
            time.sleep(1)
            
    # FINAL FALLBACK: If edge-tts (Microsoft) is down/busy (503), use gTTS (Google)
    try:
        from gtts import gTTS
        print(f"[TTS-FALLBACK] edge-tts failed. Engaged Google (gTTS) for path: {output_path}")
        
        # Mapping: Use 'en' as default for most humanoid voices
        lang = 'en'
        if 'fr-' in voice.lower(): lang = 'fr'
        elif 'es-' in voice.lower(): lang = 'es'
        elif 'de-' in voice.lower(): lang = 'de'
        
        tts = gTTS(text=clean_text, lang=lang)
        tts.save(output_path)
        return True
    except Exception as e:
        print(f"[TTS-FATAL] gTTS fallback also failed: {str(e)}")
        
    return False

def generate_podcast_script(notes_json, length_pref=15, available_images=None, name_a="Host A", name_b="Host B", system_instruction=None):
    """
    Generates a single-shot, high-quality podcast script.
    """
    # Force creation of the media directory to prevent "Connecting synapse..." hangs
    tts_dir = os.path.join(settings.MEDIA_ROOT, 'podcast_tts')
    os.makedirs(tts_dir, exist_ok=True)
    
    log_path = os.path.join(settings.BASE_DIR, 'podcast_debug.log')
    with open(log_path, 'w') as f:
        f.write(f"--- START ONE-SHOT GENERATION ---\n")

    # 1. Process Material
    sections_text = ""
    sections = notes_json.get('sections', [])[:20]
    for idx, sec in enumerate(sections):
        sections_text += f"{sec.get('title', 'Topic')}: {sec.get('content', '')}\n\n"

    # 2. Build Prompt
    img_context = ""
    if available_images:
        img_context = "\nRELEVANT VISUALS (Use these IDs for visual_ref):\n"
        for img in available_images[:10]:
            img_context += f"- ID {img['id']} (Page {img['page_number']}): {str(img.get('description') or 'Diagram')[:70]}\n"

    sys_inst = system_instruction or (
        f"You are a professional podcast script writer. You write ONLY the spoken dialogue for {name_a} (A) and {name_b} (B). "
        "HUMANOID NATURALISM (REQUIRED): "
        "- Use discourse markers: 'Hmm', 'Uh', 'Well', 'Actually', 'Right?'. "
        "- Use organic fillers naturally: '(clears throat)', '[hesitates]', '[coughs]'. "
        "- Use ellipses '...' mid-sentence for natural pondering. "
        "NO narration. NO stage directions. Output raw JSON array only."
    )
    
    prompt_template = """Write a HIGH-FIDELITY, DEEP-DIVE podcast script based on these notes:
[MATERIAL]

INSTRUCTIONS:
[IMAGES]
- SPEAKERS: Use ID "A" for [NAME_A] and "B" for [NAME_B].
- STRUCTURE: [{"speaker": "A", "text": "...", "visual_ref": ID, "visual_prompt": "..."}]
- LENGTH: Provide a detailed, long-form conversation with at least 25 segments.
- VISUAL VARIETY (CRITICAL):
    1. Use "visual_ref" ID if the dialogue directly discusses an existing diagram from the notes.
    2. Use "visual_prompt": "description" for a new concept illustration NOT in the notes.
    3. DO NOT repeat the same visual! CHANGE the visual (ref or prompt) every 4 segments.
- STYLE: Deeply conversational and human. [NAME_A] is the expert guide, [NAME_B] is the inquisitive analyst.
- CRITICAL: Output ONLY the raw JSON array. Start immediately with '['. Do not include markdown formatting or talk outside the JSON.
"""
    prompt = prompt_template.replace("[MATERIAL]", sections_text[:5000]) \
                            .replace("[IMAGES]", img_context) \
                            .replace("[NAME_A]", name_a) \
                            .replace("[NAME_B]", name_b)

    ai_service = AIService()
    res = call_ai_with_retry(prompt, sys_inst, log_path)

    # DIAGNOSTIC: Log the raw response for forensic analysis
    with open(log_path, 'a') as f:
        f.write(f"\n[OpenRouter] Raw Response (Preview): {str(res)[:500]}...\n")

    def validate_script(res_text):
        if not res_text or not isinstance(res_text, str): return []
        import re
        try:
            # 1. Direct parse check
            data = json.loads(json_repair(res_text))
            if isinstance(data, list):
                # Standardize keys if AI used 'line' instead of 'text'
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
            if isinstance(data, dict) and 'script' in data: return data['script']
        except: pass

        # 2. UNIVERSAL REGEX EXTRACTOR (Flexible Dialogue Filter)
        found = []
        for obj_match in re.finditer(r'\{(?P<body>[\s\S]*?)\}', res_text):
            body = obj_match.group('body')
            
            spk_match = re.search(r'"speaker":\s*"(?P<spk>[ABab]|' + re.escape(name_a) + r'|' + re.escape(name_b) + r')"', body, re.IGNORECASE)
            if not spk_match: continue
            
            txt_match = re.search(r'"(?:text|line|content)":\s*"(?P<txt>.*?)(?<!\\)"(?=[\s\r\n]*[,}])', body, re.DOTALL)
            if not txt_match: continue
            
            s_val = spk_match.group('spk').upper()
            spk_id = 'B' if ('B' in s_val or name_b.upper() in s_val) else 'A'
            txt_val = txt_match.group('txt').strip()
            
            chunk = {"speaker": spk_id, "text": txt_val}
            
            vref_match = re.search(r'"visual_ref":\s*(?P<vref>\d+|"\d+")', body)
            if vref_match:
                chunk["visual_ref"] = vref_match.group('vref').strip('"')
            
            vprompt_match = re.search(r'"visual_prompt":\s*"(?P<vprompt>.*?)(?<!\\)"', body, re.DOTALL)
            if vprompt_match:
                chunk["visual_prompt"] = vprompt_match.group('vprompt').strip()
                
            found.append(chunk)
        return found

    final_script = validate_script(res)

    if not final_script or len(final_script) < 3:
        with open(log_path, 'a') as f:
            f.write(f"\n[OpenRouter] Generation failed or too short. Length: {len(final_script) if final_script else 0}. Using partial fallback if available.\n")
        
        if not final_script:
            final_script = [
                {"speaker": "A", "text": "Welcome back to FlowCast. We're breaking down some complex material today."},
                {"speaker": "B", "text": "That's right! There was a brief signal interruption, but we've got the core material ready."},
                {"speaker": "A", "text": "Let's dive straight into the primary concepts from your notes."}
            ]

    with open(log_path, 'a') as f:
        f.write(f"\n--- COMPLETE ---\nSegments: {len(final_script)}\n")
    return final_script

def handle_interruption(user_query, current_script, current_index, full_material="", available_images=None, name_a="Host A", name_b="Host B"):
    """
    The 'Answer Guru': Handles user questions with robust formatting.
    """
    log_path = os.path.join(settings.BASE_DIR, 'podcast_debug.log')
    recent = json.dumps(current_script[max(0, current_index-1) : current_index+1])
    
    img_context = ""
    if available_images:
        img_context = "\nRELEVANT VISUALS (Use these IDs for visual_ref when answering):\n"
        for img in available_images[:6]:
            img_context += f"- ID {img['id']} (Page {img['page_number']}): {str(img.get('description') or 'Diagram')[:70]}\n"

    prompt_template = """Provide a host response to: "[QUERY]". 
Source material: [MATERIAL]
Recent chat: [CHAT]
[IMAGES]

INSTRUCTIONS:
- CONCISE: Give exactly 1-2 rapid dialogue segments in a JSON array.
- BE DIRECT: Jump straight into the answer. 
- If a specific visual ID explains it, use "visual_ref": ID. 
- Output ONLY JSON array [{"speaker": "A" or "B", "text": "...", "visual_ref": ID, "visual_prompt": "..."}]."""

    prompt = prompt_template.replace("[QUERY]", user_query) \
                            .replace("[MATERIAL]", full_material[:6000]) \
                            .replace("[CHAT]", recent) \
                            .replace("[IMAGES]", img_context)

    sys_inst = (
        f"You are {name_a} and {name_b}. Speak ONLY as the host. "
        "HUMANOID NATURALISM: Use fillers like 'Hmm', 'Actually', or '(clears throat)' naturally. "
        "No stage directions. Output ONLY JSON."
    )

    def validate_guru(res_text):
        if not res_text or not isinstance(res_text, str): return []
        import re
        try:
            data = json.loads(json_repair(res_text))
            if isinstance(data, list): return data
        except: pass
        
        found = []
        for obj_match in re.finditer(r'\{(?P<body>[\s\S]*?)\}', res_text):
            body = obj_match.group('body')
            spk_match = re.search(r'"speaker":\s*"(?P<spk>[ABab]|' + re.escape(name_a) + r'|' + re.escape(name_b) + r')"', body, re.IGNORECASE)
            if not spk_match: continue
            txt_match = re.search(r'"text":\s*"(?P<txt>.*?)(?<!\\)"(?=[\s\r\n]*[,}])', body, re.DOTALL)
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

    ai_service = AIService()
    res = async_to_sync(ai_service.groq_chat)([
        {"role": "system", "content": sys_inst},
        {"role": "user", "content": prompt}
    ], max_tokens=512)
    
    # LOG: Guru response (for debugging)
    with open(log_path, 'a') as f:
        f.write(f"[GURU-RAW] {res[:300]}...\n")
        
    data = validate_guru(json_repair(res))
    return data if data else [{"speaker": "A", "text": "That's a great question."}]
