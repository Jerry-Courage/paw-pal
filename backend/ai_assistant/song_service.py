import os
import json
import logging
import time
from django.conf import settings
from asgiref.sync import async_to_sync
from .services import AIService
from .podcast import generate_tts_file

logger = logging.getLogger('nitemind')

class StudySongService:
    @staticmethod
    def generate_song_script(resource, style="upbeat_rap"):
        ai = AIService()
        context = ai._get_resource_context(resource)
        
        prompt = f"""You are an expert educational songwriter and mnemonic artist. 
Turn the following study material into a catchy, highly memorable educational song ({style}).
The song must cover the most important core concepts, definitions, and facts from the material.

Structure requirements:
1. Verse 1: Introduction to the core topic and primary definitions.
2. Chorus: A super catchy, rhythmic hook summarizing the main takeaway (repeatable).
3. Verse 2: Diving deeper into mechanisms, examples, or steps.
4. Bridge: High-energy review of key points or contrast.
5. Chorus: Catchy hook.
6. Outro: Final memorable summary line.

Format your response strictly as a JSON array of objects, where each object has:
- "section": "Verse 1" | "Chorus" | "Verse 2" | "Bridge" | "Outro"
- "singer": "Lead Vocalist" or "Hype Vocalist"
- "lyrics": "The rhyming line or stanza to be sung/rapped"

Return ONLY valid JSON. No markdown blocks outside JSON.
MATERIAL:
{context[:6000]}
"""
        
        sys_inst = "You write catchy, rhyming educational songs. Output ONLY valid JSON array."
        raw = async_to_sync(ai.chat)([
            {"role": "system", "content": sys_inst},
            {"role": "user", "content": prompt}
        ])
        
        # Clean markdown json
        cleaned = raw.strip()
        if cleaned.startswith('```'):
            lines = cleaned.splitlines()
            if lines and lines[0].startswith('```'): lines = lines[1:]
            if lines and lines[-1].strip() == '```': lines = lines[:-1]
            cleaned = '\n'.join(lines).strip()
            
        try:
            song_lines = json.loads(cleaned)
            if isinstance(song_lines, list) and len(song_lines) > 0:
                return song_lines
        except Exception as e:
            logger.error(f"Song JSON parse error: {e}, raw: {raw}")
            
        # Fallback song structure if JSON parse fails
        return [
            {"section": "Verse 1", "singer": "Lead Vocalist", "lyrics": f"We diving deep into {resource.title}, breaking down the facts so they stay with you."},
            {"section": "Chorus", "singer": "Hype Vocalist", "lyrics": "Lock it in your brain, remember what you learned, study hard today so the future's earned!"},
            {"section": "Verse 2", "singer": "Lead Vocalist", "lyrics": "Concepts and definitions flowing through your mind, leaving all the confusion far behind."},
            {"section": "Outro", "singer": "Lead Vocalist", "lyrics": "That's the core of {resource.title}, you got this!"}
        ]
