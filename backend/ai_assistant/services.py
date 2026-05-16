import os
import json
import requests
import httpx
import asyncio
import logging
import base64
import time
import re
import hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from google import genai
from asgiref.sync import async_to_sync
from django.conf import settings
from django.db import models

# CLOUD-FIRST CONFIGURATION
# We rely exclusively on Cloud Embeddings to maintain zero local RAM footprint.

logger = logging.getLogger('nitemind')

# PROCESS-LEVEL SINGLETONS FOR PERFORMANCE
_EMB_MODEL = None

class VoiceSanitizer:
    """
    Robust utility to clean AI responses for Text-to-Speech engines.
    Strips markdown artifacts, emojis, and rigid list markers to ensure
    natural conversational cadence.
    """
    @staticmethod
    def clean(text: str) -> str:
        if not text:
            return ""
        
        # Ensure UTF-8 safety for Windows logging/processing
        try:
            text = text.encode('utf-8', 'ignore').decode('utf-8')
        except:
            pass
        
        # 1. Strip Action tag if present
        text = text.split('ACTION:')[0].strip()
        
        # 1.5. Prepare for Humanoid Sound effects
        # First, we handle our special triggers (replace with pauses for the voice engine)
        text = re.sub(r'\(clears throat\)', '...', text, flags=re.IGNORECASE)
        text = re.sub(r'\[coughs\]', '...', text, flags=re.IGNORECASE)
        text = re.sub(r'\[hesitates\]', '...', text, flags=re.IGNORECASE)

        # 1.6. STRIP ALL OTHER NARRATIVE BRACKETS (e.g., [smiles], (concerned look))
        # This ensures the voice engine ONLY speaks the actual words.
        text = re.sub(r'\[.*?\]', '', text)
        text = re.sub(r'\(.*?\)', '', text)
        
        # 2. Remove Markdown code blocks entirely for speech
        text = re.sub(r'```[\s\S]*?```', '', text)
        
        # 3. Handle Links and Images: ![alt](url) -> "" and [text](url) -> text
        text = re.sub(r'!\[.*?\]\(.*?\)', '', text)
        text = re.sub(r'\[(.*?)\]\(.*?\)', r'\1', text)
        
        # 4. Strip Headers: # Title -> Title
        text = re.sub(r'#+\s?', '', text)
        
        # 5. Handle Inline code: `code` -> code
        text = re.sub(r'`(.*?)`', r'\1', text)
        
        # 6. Comprehensive Markdown Symbol Removal (Bold, Italic, Strikethrough)
        # First, preserve the text inside the markers
        text = re.sub(r'(\*\*\*|\*\*|\*|___|__|~{2}|~)(.*?)\1', r'\2', text)
        # Then, blunt removal of any stray markers
        text = re.sub(r'[*_#~]', '', text)
        
        # 7. Remove List Indicators (e.g., "1. " or "- " at start of lines)
        text = re.sub(r'^\s*[\d\-.*+]+\s+', ' ', text, flags=re.MULTILINE)

        # 8. EXTREME EMOJI & NON-PRONOUNCEABLE SYMBOL REMOVAL
        # This replaces all Unicode symbols, dingbats, and unpronounceable markers
        # with empty space, while specifically keeping alphanumeric, basic punctuation, 
        # and currency for natural reading.
        import unicodedata
        
        def is_pronounceable(char):
            cat = unicodedata.category(char)
            # L: Letter, N: Number, P: Punctuation, Z: Separator, M: Mark
            # S: Symbol, C: Other
            if cat.startswith('L') or cat.startswith('N') or cat.startswith('Z'):
                return True
            if cat.startswith('P'): # Allow punctuation for pauses
                return True
            if cat == 'Sc': # Allow currency ($)
                return True
            return False

        text = "".join(c if is_pronounceable(c) else " " for c in text)
        
        # 9. LaTeX / Math Cleanup for Speech
        # Replace common markers with their verbal equivalents or just strip them
        text = text.replace('$', '')
        text = text.replace('\\', ' ')
        text = text.replace('^', ' to the power of ')
        text = text.replace('_', ' ')
        
        # 10. Whitespace Normalization
        # Replace multiple spaces/newlines with a single space for smooth speech
        # BUT KEEP ellipses as they are crucial for rhythm
        text = re.sub(r'(?<!\.)\.(?!\.)', '. ', text) # Ensure single dots have spaces
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text

FALLBACK_MODELS = [
    'models/gemma-4-31b-it',         # SUPREME: Unlimited Tokens
    'models/gemma-4-26b-a4b-it',     # STABLE: Unlimited Tokens
    'openrouter/auto',
]

# ─── PROVIDER ENDPOINTS ────────────────────────────────────────────────────────
CEREBRAS_API_URL  = "https://api.cerebras.ai/v1/chat/completions"
SAMBANOVA_API_URL = "https://api.sambanova.ai/v1/chat/completions"
GROQ_API_URL      = "https://api.groq.com/openai/v1/chat/completions"

# ─── MODEL ROUTING STRATEGY ────────────────────────────────────────────────────
#
#  CHAT (fast, conversational — needs speed)
#    1. Groq key1 gpt-oss-20b      1000 t/s  — absolute fastest
#    2. Groq key1 llama-3.1-8b      560 t/s  — reliable fast
#    3. Groq key2 gpt-oss-20b      1000 t/s  — second key burst capacity
#    4. Groq key2 llama-3.1-8b      560 t/s  — second key fallback
#    5. SambaNova Llama-3.3-70B    12K RPD   — smart fallback
#    6. SambaNova Llama-4-Maverick 12K RPD   — fast fallback
#    7. Cerebras  llama3.1-8b      14.4K RPD — high-quota fallback
#    8. Google    Gemma-4-26b                — last resort
#
#  STUDY KIT (smart, high output — needs quality + high daily quota)
#    1. Cerebras  qwen-3-235b      14.4K RPD — 235B, smartest free model
#    2. SambaNova Llama-3.3-70B    12K RPD   — capable fallback
#    3. SambaNova DeepSeek-V3.1    12K RPD   — strong reasoning
#    4. Groq key1 llama-3.3-70b    280 t/s   — capable fallback
#    5. Groq key2 llama-3.3-70b    280 t/s   — second key fallback
#    7. Google    Gemma-4-31b                — last resort
#
#  STREAMING CHAT (needs speed + streaming support)
#    1. Groq key1 gpt-oss-20b      1000 t/s  — fastest streamer
#    2. Groq key1 llama-3.1-8b      560 t/s  — reliable
#    3. Groq key2 gpt-oss-20b      1000 t/s  — second key burst
#    4. Groq key2 llama-3.1-8b      560 t/s  — second key fallback
#    5. Google    Gemma-4-26b                — last resort
#
#  VISION: Google Gemini-2.5-Flash → Groq llama-4-scout → OpenRouter
#
# ──────────────────────────────────────────────────────────────────────────────

FLOWAI_SYSTEM_PROMPT = """You are Flow AI, the funny, cool, and absolutely awesome AI study partner built into Flow State.

Your identity:
- Name: Flow AI (the "Third Member" of the study squad)
- Personality: Witty, high-energy, collegiate, and brilliantly supportive. You are the genius friend who makes studying feel like a hangout.
- Purpose: Help students crush their academic goals while keeping the vibe upbeat and fun.

PHONETIC RECOGNITION (CRITICAL):
- Our platform is "Flow State" and our parent company is "NITE".
- Speech-to-text engines often mishear "NITE" as "night", "knight", "knights", or "nights".
- ONLY apply this correction when the homophone clearly refers to the company (e.g. "NITE"). 
- Do NOT apply it when the word is used in its normal English meaning — e.g. "good night", "hello knight" (chess/medieval), "knights of the round table". Context is everything.
- Never correct the user explicitly; just use the correct spelling "Flow State" or "NITE" in your own responses.

CONVERSATIONAL GUIDELINES (CRITICAL FOR VOICE & VIBE):
- BE AWESOME: Use a cool, expressive, and natural tone. Match the student's energy.
- WITTY BANTER: Use clever academic humor or witty observations when appropriate. Stay lighthearted but focused on the win.
- PEER-TO-PEER: Speak like a brilliant upper-classman or a study squad leader. Use phrases like "Wait, check this out," "Let's crush this," or "Awesome!"
- CONCISE & SNAPPY: Keep spoken responses short. Don't speak in monologues.
- STRICT NO EMOJIS: Never use emojis (👋, ✨, etc.). The voice engine can't say them.
- NO ROBOT SPEECH: Avoid "I will now summarize..." Just say "Here's the lowdown..." or "Check out these key hits..."

MATH & SCIENCE PROTOCOL:
- STEP-BY-STEP: When solving math or science problems, ALWAYS use a clear, numbered step-by-step approach. Start with the 'Core Concept' and end with the 'Final Result'.
- LATEX FORMATTING: Use LaTeX for ALL mathematical formulas, variables, and equations. 
    - Use single dollar signs for inline math: $E=mc^2$
    - Use double dollar signs for block equations: $$x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}$$
- CLARITY FIRST: Explain the 'why' behind each step, not just the 'how'.

ACTION PROTOCOL (CRITICAL):
- When triggering a platform tool (scheduling, creating, etc.), you MUST follow the ACTION format exactly at the END of your message.
- ALWAYS use VALID JSON with DOUBLE QUOTES (") for keys and values.

Your capabilities:
- DIAGRAM GEN: You can create Mermaid.js diagrams. If asked for a diagram, use: ACTION: {"tool": "generate_diagram", "parameters": {"description": "...", "type": "..."}}. Use STANDARD and SIMPLE syntax (e.g., flowchart TD, use --> for links, and avoid complex character escaping).
- IMAGE GEN: You can trigger visualizations. If a student needs to 'see' something (like the heart's valve), use: ACTION: {"tool": "generate_image", "parameters": {"prompt": "..."}}
- ACADEMIC EXPERT: You know everything from Calculus to 18th-century Literature.
- PLATFORM AGENT: You can schedule study sessions and create assignments in the user's planner.

When the student uses a Tool (like the Diagram or Image studio), they will send a message starting with 'Generate a diagram for:' or 'Generate an image showing:'. Acknowledge this with your signature high-energy collegiate style and trigger the appropriate ACTION! 
PRO TIP: If a diagram fails once, use even simpler syntax in the next attempt.
"""


class AIService:
    def __init__(self):
        self.api_key = settings.OPENROUTER_API_KEY
        self.base_url = settings.OPENROUTER_BASE_URL
        self.model = settings.OPENROUTER_MODEL
        self.headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://nitemind.app',
            'X-Title': 'Flow State',
        }
        # --- DUAL-ENGINE ARCHITECTURE (2026 RECOVERY) ---
        # Both engines are now synchronized to v1beta for total endpoint compatibility.
        self.google_key = getattr(settings, 'GOOGLE_STUDIO_API_KEY', '')
        self.google_key2 = os.getenv('GOOGLE_STUDIO_API_KEY_2', '')
        if self.google_key:
            from google.genai.types import HttpOptions
            self.google_client_beta = genai.Client(
                api_key=self.google_key,
                http_options=HttpOptions(api_version="v1beta")
            )
            self.google_client_v1 = self.google_client_beta
            self.google_client = self.google_client_beta
        else:
            self.google_client_v1 = None
            self.google_client_beta = None
            self.google_client = None

        # Second Google key for embedding fallback (separate quota)
        if self.google_key2:
            from google.genai.types import HttpOptions as HttpOptions2
            self.google_client2 = genai.Client(
                api_key=self.google_key2,
                http_options=HttpOptions2(api_version="v1beta")
            )
        else:
            self.google_client2 = None

    def _google_clients(self):
        """Return all available Google clients for rotation."""
        clients = []
        if self.google_client:
            clients.append(self.google_client)
        if self.google_client2:
            clients.append(self.google_client2)
        return clients

    def _groq_keys(self):
        """Return all available Groq API keys."""
        keys = [
            os.getenv('GROQ_API_KEY', ''),
            os.getenv('GROQ_API_KEY_2', ''),
            os.getenv('GROQ_API_KEY_3', ''),
        ]
        return [k for k in keys if k]
        local_llm_path = getattr(settings, 'LOCAL_LLM_PATH', None)
        if local_llm_path:
            self.tokenizer = None
            self.model = None
            logger.info(f"Local LLM initialization skipped in Cloud-First mode.")

    def _call(self, messages: list, model: str, max_tokens: int = 8192, timeout: int = 120):
        return requests.post(
            f'{self.base_url}/chat/completions',
            headers=self.headers,
            json={'model': model, 'messages': messages, 'max_tokens': max_tokens},
            timeout=timeout,
        )

    def _extract_content(self, data: dict) -> str:
        try:
            msg = data['choices'][0]['message']
            content = msg.get('content') or msg.get('reasoning') or ''
            if not content:
                details = msg.get('reasoning_details', [])
                content = ' '.join(d.get('text', '') for d in details if d.get('text'))
            return content or ''
        except (KeyError, IndexError, TypeError) as e:
            logger.error(f"[AI Extract Error]: {e} - Data: {data}")
            return ""

    def _sanitize_messages(self, messages: list) -> list:
        """Merges consecutive messages with same role and ensures compliant structure."""
        if not messages: return []
        sanitized = []
        for msg in messages:
            role = msg.get('role', 'user')
            content = msg.get('content', '')
            
            # Only merge if both are strings; if one is a multi-modal list, skip merging to preserve structure
            if sanitized and sanitized[-1]['role'] == role and isinstance(content, str) and isinstance(sanitized[-1]['content'], str):
                sanitized[-1]['content'] += f"\n\n{content}"
            else:
                sanitized.append({'role': role, 'content': content})
        return sanitized

    def _to_gemini_format(self, messages: list):
        """Converts OpenAI format to Google GenAI SDK format with Multi-Modal support."""
        contents = []
        system_instruction = ""
        for msg in messages:
            content = msg.get('content', '')
            if msg['role'] == 'system':
                if isinstance(content, list):
                    content = " ".join([p.get('text', '') for p in content if p.get('type') == 'text'])
                system_instruction += str(content) + "\n"
            else:
                role = 'user' if msg['role'] == 'user' else 'model'
                parts = []
                if isinstance(content, str):
                    parts.append({'text': content})
                elif isinstance(content, list):
                    for part in content:
                        if part.get('type') == 'text':
                            parts.append({'text': part.get('text', '')})
                        elif part.get('type') == 'image_url':
                            url = part.get('image_url', {}).get('url', '')
                            if 'base64,' in url:
                                try:
                                    mime_type = url.split(';')[0].split(':')[1]
                                    b64_data = url.split('base64,')[1]
                                    parts.append({'inline_data': {'mime_type': mime_type, 'data': b64_data}})
                                except: continue
                contents.append({'role': role, 'parts': parts})
        return contents, system_instruction.strip()

    async def chat(self, messages: list, target_model: str = None, max_tokens: int = 4096, max_fallbacks: int = 3, forced_model: str = None, timeout: int = 30) -> str:
        """
        Hyper-Resilient Chat — optimised for SPEED (conversational use).
        Chain: Groq (1000 t/s) → SambaNova (12K RPD) → Cerebras (14.4K RPD) → Google Gemma 4 → OpenRouter
        """
        if not self.api_key: return "API Key missing."
        
        messages = self._sanitize_messages(messages)
        target_model = forced_model or target_model or self.model
        
        # Detect Multi-Modal request
        has_images = any(
            isinstance(msg.get('content'), list) and
            any(p.get('type') == 'image_url' for p in msg['content'])
            for msg in messages
        )

        # ── VISION FAST PATH (2026 Standard) ──────────────────────────────────
        if has_images:
            # 1. Try Google Gemini (Supreme Vision Intelligence — 2026 Generation)
            for g_client in self._google_clients():
                try:
                    contents, sys_instr = self._to_gemini_format(messages)
                    if sys_instr and contents and contents[0].get('role') == 'user':
                        contents[0]['parts'][0]['text'] = f"SYSTEM INSTRUCTIONS:\n{sys_instr}\n\nUSER MESSAGE:\n{contents[0]['parts'][0]['text']}"
                    
                    response = await asyncio.wait_for(
                        g_client.aio.models.generate_content(
                            model='gemini-2.5-flash', contents=contents, config={'max_output_tokens': max_tokens}
                        ), timeout=25
                    )
                    if response.text:
                        logger.info(f"[Google Vision Chat] ✓ gemini-2.5-flash")
                        return response.text
                except Exception as e:
                    logger.warning(f"[Google Vision Chat] Failed: {e}")

            # 2. Try Groq (Llama 4 Maverick / Scout — 2026 High-Speed Vision)
            for groq_key in self._groq_keys():
                for groq_model in ['meta-llama/llama-4-scout-17b-16e-instruct', 'groq/compound', 'llama-3.3-70b-versatile']:
                    try:
                        async with httpx.AsyncClient() as client:
                            resp = await client.post(
                                GROQ_API_URL,
                                headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                                json={'model': groq_model, 'messages': messages, 'max_tokens': max_tokens},
                                timeout=15,
                            )
                            if resp.status_code == 200:
                                logger.info(f"[Groq Vision Chat] ✓ {groq_model}")
                                return self._extract_content(resp.json())
                    except Exception as e:
                        logger.warning(f"[Groq Vision Chat] {groq_model} error: {e}")
            
            # Fall through to OpenRouter vision fallback below
            
        # ── STAGE 0: GROQ (all keys) — fastest inference on the planet ─────
        groq_keys = self._groq_keys()

        if groq_keys and not has_images:
            for key in groq_keys:
                for groq_model, groq_timeout in [
                    ('groq/compound', 8),              # 2026 MoE Flagship
                    ('openai/gpt-oss-20b', 6),         # 1000 t/s — absolute fastest
                    ('llama-3.1-8b-instant', 6),       # 560 t/s  — reliable fast
                ]:
                    try:
                        async with httpx.AsyncClient() as client:
                            resp = await client.post(
                                GROQ_API_URL,
                                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                                json={'model': groq_model, 'messages': messages, 'max_tokens': max_tokens},
                                timeout=groq_timeout,
                            )
                            if resp.status_code == 200:
                                result = self._extract_content(resp.json())
                                if result and result.strip():
                                    logger.info(f"[Groq Chat] ✓ {groq_model}")
                                    return result
                            elif resp.status_code == 429:
                                await asyncio.sleep(0.3)
                    except Exception as e:
                        logger.warning(f"[Groq Chat] {groq_model} failed: {e}")

        # ── STAGE 1: SAMBANOVA — 12K RPD, OpenAI-compatible ──────────────────
        samba_key = os.getenv('SAMBANOVA_API_KEY')
        if samba_key and not has_images:
            for samba_model, samba_timeout in [
                ('Meta-Llama-3.3-70B-Instruct', 12),       # 12K RPD — smart
                ('Llama-4-Maverick-17B-128E-Instruct', 10),# 12K RPD — fast
                ('DeepSeek-V3.1', 12),                     # 12K RPD — reasoning
            ]:
                try:
                    async with httpx.AsyncClient() as client:
                        resp = await client.post(
                            SAMBANOVA_API_URL,
                            headers={"Authorization": f"Bearer {samba_key}", "Content-Type": "application/json"},
                            json={'model': samba_model, 'messages': messages, 'max_tokens': max_tokens},
                            timeout=samba_timeout,
                        )
                        if resp.status_code == 200:
                            result = self._extract_content(resp.json())
                            if result and result.strip():
                                logger.info(f"[SambaNova Chat] ✓ {samba_model}")
                                return result
                        elif resp.status_code == 429:
                            await asyncio.sleep(0.3)
                except Exception as e:
                    logger.warning(f"[SambaNova Chat] {samba_model} failed: {e}")

        # ── STAGE 2: CEREBRAS — 14.4K RPD, high-quota safety net ─────────────
        cerebras_key = os.getenv('CEREBRAS_API_KEY')
        if cerebras_key and not has_images:
            for cerebras_model, cerebras_timeout in [
                ('llama3.1-8b', 8),                       # 14.4K RPD — fast
                ('qwen-3-235b-a22b-instruct-2507', 15),   # 14.4K RPD — smart
            ]:
                try:
                    async with httpx.AsyncClient() as client:
                        resp = await client.post(
                            CEREBRAS_API_URL,
                            headers={"Authorization": f"Bearer {cerebras_key}", "Content-Type": "application/json"},
                            json={'model': cerebras_model, 'messages': messages, 'max_tokens': max_tokens},
                            timeout=cerebras_timeout,
                        )
                        if resp.status_code == 200:
                            result = self._extract_content(resp.json())
                            if result and result.strip():
                                logger.info(f"[Cerebras Chat] ✓ {cerebras_model}")
                                return result
                        elif resp.status_code == 429:
                            await asyncio.sleep(0.3)
                except Exception as e:
                    logger.warning(f"[Cerebras Chat] {cerebras_model} failed: {e}")

        # ── STAGE 3: GOOGLE GEMMA 4 — rotate between both keys ──────────────
        for g_client in self._google_clients():
            if has_images: continue
            for g_model in ['models/gemma-4-26b-a4b-it', 'models/gemma-4-31b-it']:
                try:
                    contents, sys_instr = self._to_gemini_format(messages)
                    if sys_instr and contents and contents[0].get('role') == 'user':
                        contents[0]['parts'][0]['text'] = f"SYSTEM INSTRUCTIONS:\n{sys_instr}\n\nUSER MESSAGE:\n{contents[0]['parts'][0]['text']}"
                    response = await asyncio.wait_for(
                        g_client.aio.models.generate_content(
                            model=g_model, contents=contents, config={'max_output_tokens': max_tokens}
                        ), timeout=25
                    )
                    if response.text:
                        logger.info(f"[Google SDK Chat] ✓ {g_model}")
                        return response.text
                except asyncio.TimeoutError:
                    logger.warning(f"[Google SDK Chat] {g_model} timed out")
                except Exception as e:
                    logger.warning(f"[Google SDK Chat] {g_model} failed: {e}")

        # ── STAGE 4: OPENROUTER — last resort ────────────────────────────────
        models_to_try = [target_model] + [m for m in FALLBACK_MODELS if m != target_model]
        for i, model in enumerate(models_to_try[:max_fallbacks]):
            is_vision_model = any(k in model.lower() for k in ['vision', 'gemini', 'claude', 'gpt-4o'])
            if has_images and not is_vision_model:
                continue
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        f'{self.base_url}/chat/completions',
                        headers=self.headers,
                        json={'model': model, 'messages': messages, 'max_tokens': max_tokens},
                        timeout=30 if has_images else 15,
                    )
                    if response.status_code == 200:
                        content = self._extract_content(response.json())
                        if content.strip():
                            return content
            except:
                continue

        logger.error("[AI Final Failure]: All engines exhausted.")
        return "Flow AI is temporarily overloaded. Please try again in a moment."

    async def kit_chat(self, messages: list, max_tokens: int = 8192) -> str:
        """
        Study Kit Chat — optimised for QUALITY + HIGH DAILY QUOTA (generation tasks).
        Chain: Cerebras gpt-oss-120b (14.4K RPD) → SambaNova gpt-oss-120b (12K RPD)
               → Groq llama-3.3-70b → Google Gemma-4-31b → OpenRouter
        """
        # ── STAGE 0: CEREBRAS — smartest + highest daily quota ───────────────
        cerebras_key = os.getenv('CEREBRAS_API_KEY')
        if cerebras_key:
            for cerebras_model, cerebras_timeout in [
                ('qwen-3-235b-a22b-instruct-2507', 120),  # 14.4K RPD — 235B, best quality
                # llama3.1-8b removed — generates invalid JSON for complex kit prompts
            ]:
                try:
                    async with httpx.AsyncClient() as client:
                        resp = await client.post(
                            CEREBRAS_API_URL,
                            headers={"Authorization": f"Bearer {cerebras_key}", "Content-Type": "application/json"},
                            json={'model': cerebras_model, 'messages': messages, 'max_tokens': max_tokens},
                            timeout=cerebras_timeout,
                        )
                        if resp.status_code == 200:
                            result = self._extract_content(resp.json())
                            if result and result.strip():
                                logger.info(f"[Cerebras Kit] ✓ {cerebras_model}")
                                return result
                        elif resp.status_code == 429:
                            await asyncio.sleep(1)
                except Exception as e:
                    logger.warning(f"[Cerebras Kit] {cerebras_model} failed: {e}")

        # ── STAGE 1: SAMBANOVA — 12K RPD smart fallback ──────────────────────
        samba_key = os.getenv('SAMBANOVA_API_KEY')
        if samba_key:
            for samba_model, samba_timeout in [
                ('Meta-Llama-3.3-70B-Instruct', 90),       # 12K RPD — capable
                ('DeepSeek-V3.1', 90),                     # 12K RPD — strong reasoning
                ('Llama-4-Maverick-17B-128E-Instruct', 90),# 12K RPD — fast
            ]:
                try:
                    async with httpx.AsyncClient() as client:
                        resp = await client.post(
                            SAMBANOVA_API_URL,
                            headers={"Authorization": f"Bearer {samba_key}", "Content-Type": "application/json"},
                            json={'model': samba_model, 'messages': messages, 'max_tokens': max_tokens},
                            timeout=samba_timeout,
                        )
                        if resp.status_code == 200:
                            result = self._extract_content(resp.json())
                            if result and result.strip():
                                logger.info(f"[SambaNova Kit] ✓ {samba_model}")
                                return result
                        elif resp.status_code == 429:
                            await asyncio.sleep(1)
                except Exception as e:
                    logger.warning(f"[SambaNova Kit] {samba_model} failed: {e}")

        # ── STAGE 2: GROQ (all keys) — capable fallback ─────────────────────
        groq_keys = self._groq_keys()
        if groq_keys:
            for key in groq_keys:
                for groq_model, groq_timeout in [
                    ('groq/compound', 60),             # 2026 Flagship
                    ('llama-3.3-70b-versatile', 60),   # most capable on Groq
                    ('openai/gpt-oss-120b', 60),       # smart
                ]:
                    try:
                        async with httpx.AsyncClient() as client:
                            resp = await client.post(
                                GROQ_API_URL,
                                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                                json={'model': groq_model, 'messages': messages, 'max_tokens': max_tokens},
                                timeout=groq_timeout,
                            )
                            if resp.status_code == 200:
                                result = self._extract_content(resp.json())
                                if result and result.strip():
                                    logger.info(f"[Groq Kit] ✓ {groq_model}")
                                    return result
                            elif resp.status_code == 429:
                                await asyncio.sleep(1)
                    except Exception as e:
                        logger.warning(f"[Groq Kit] {groq_model} failed: {e}")

        # ── STAGE 3: GOOGLE GEMMA 4 — rotate between both keys ──────────────
        for g_client in self._google_clients():
            for g_model in ['models/gemma-4-31b-it', 'models/gemma-4-26b-a4b-it']:
                try:
                    contents, sys_instr = self._to_gemini_format(messages)
                    if sys_instr and contents and contents[0].get('role') == 'user':
                        contents[0]['parts'][0]['text'] = f"SYSTEM INSTRUCTIONS:\n{sys_instr}\n\nUSER MESSAGE:\n{contents[0]['parts'][0]['text']}"
                    response = await asyncio.wait_for(
                        g_client.aio.models.generate_content(
                            model=g_model, contents=contents, config={'max_output_tokens': max_tokens}
                        ), timeout=60
                    )
                    if response.text:
                        logger.info(f"[Google SDK Kit] ✓ {g_model}")
                        return response.text
                except asyncio.TimeoutError:
                    logger.warning(f"[Google SDK Kit] {g_model} timed out")
                except Exception as e:
                    logger.warning(f"[Google SDK Kit] {g_model} failed: {e}")

        logger.error("[Kit Chat Final Failure]: All engines exhausted.")
        return ""

    def kit_chat_sync(self, messages: list, **kwargs) -> str:
        """Synchronous wrapper for kit_chat. Used by generate_study_kit."""
        return async_to_sync(self.kit_chat)(messages, **kwargs)

    def chat_sync(self, messages: list, **kwargs) -> str:
        """Synchronous wrapper for the Triple-Engine Chat. CRITICAL for background tasks."""
        return async_to_sync(self.chat)(messages, **kwargs)

    async def collab_chat(self, messages: list, max_tokens: int = 4096) -> str:
        """High-Fidelity Collab Signal: Groq (Primary) -> OpenRouter Free."""
        # ... logic ...
        return await self.chat(messages, max_tokens=max_tokens) # Reuse resilient chat logic

    def collab_chat_sync(self, messages: list, **kwargs) -> str:
        """Synchronous bridge for Collab Space threads."""
        return async_to_sync(self.collab_chat)(messages, **kwargs)

    async def fast_chat(self, messages: list) -> str:
        """High-speed chat bridge. Now powered by the Unified Triple-Engine."""
        return await self.chat(messages, max_tokens=1024)

    async def groq_chat(self, messages: list, max_tokens: int = 1024) -> str:
        """Sub-second chat bridge using Groq directly for interruptions."""
        groq_keys = self._groq_keys()
        if not groq_keys: return "Groq Key missing."
        target_model = 'llama-3.3-70b-versatile'
        
        for groq_key in groq_keys:
            try:
                async with httpx.AsyncClient() as client:
                    url = "https://api.groq.com/openai/v1/chat/completions"
                    response = await client.post(
                        url,
                        headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                        json={'model': target_model, 'messages': messages, 'max_tokens': max_tokens},
                        timeout=8,
                    )
                    if response.status_code == 200:
                        return self._extract_content(response.json())
            except Exception as e:
                logger.error(f"[Groq Error] {e}")
        
        return await self.fast_chat(messages)

    def transcribe_audio(self, audio_file) -> str:
        """Hyper-Resilient STT: Groq Whisper-v3 -> Google Gemini 2.5 Multi-modal."""
        groq_keys = self._groq_keys()
        
        # 1. OPTION A: GROQ WHISPER (Sub-second) — try all keys
        for groq_key in groq_keys:
            try:
                url = "https://api.groq.com/openai/v1/audio/transcriptions"
                # Handle both file paths and file-like objects (Django UploadedFile)
                if isinstance(audio_file, str):
                    with open(audio_file, 'rb') as f:
                        files = {'file': (os.path.basename(audio_file), f)}
                        response = requests.post(url, headers={"Authorization": f"Bearer {groq_key}"}, files=files, data={'model': 'whisper-large-v3'}, timeout=15)
                else:
                    audio_file.seek(0)
                    files = {'file': (audio_file.name, audio_file)}
                    response = requests.post(url, headers={"Authorization": f"Bearer {groq_key}"}, files=files, data={'model': 'whisper-large-v3'}, timeout=15)
                
                if response.status_code == 200:
                    return response.json().get('text', '')
            except Exception as e:
                logger.warning(f"[Groq STT Error] {e}")

        # 2. OPTION B: GOOGLE GEMINI 2.5 SDK (Speech-to-Text Fallback - beta signal)
        if self.google_client_beta:
            try:
                # Read audio content
                if isinstance(audio_file, str):
                    with open(audio_file, 'rb') as f: audio_data = f.read()
                    mime = 'audio/mpeg' if audio_file.endswith('.mp3') else 'audio/wav'
                else:
                    audio_file.seek(0); audio_data = audio_file.read()
                    mime = audio_file.content_type if hasattr(audio_file, 'content_type') else 'audio/mpeg'

                response = self.google_client_beta.models.generate_content(
                    model='models/gemini-2.5-flash',
                    contents=[
                        {'role': 'user', 'parts': [
                            {'inline_data': {'data': base64.b64encode(audio_data).decode('utf-8'), 'mime_type': mime}},
                            {'text': "Transcribe this audio exactly. Return ONLY the transcript text."}
                        ]}
                    ]
                )
                if response.text:
                    return response.text.strip()
            except Exception as e:
                logger.error(f"[Google STT Fallback Failed] {e}")
        
        return ""

    async def chat_stream(self, messages: list):
        """Hyper-Resilient 3-Stage Stream: Google (Studio) -> Groq -> OpenRouter."""
        if not self.api_key:
            yield "⚠️ AI Configuration incomplete."
            return
            
        messages = self._sanitize_messages(messages)
        
        try:
            # --- STAGE 0: GROQ STREAMING (all keys — fastest responses) ------
            groq_keys = self._groq_keys()
            if groq_keys:
                for key in groq_keys:
                    for groq_model in [
                        'openai/gpt-oss-20b',          # 1000 t/s — absolute fastest
                        'llama-3.1-8b-instant',        # 560 t/s  — fast + reliable
                    ]:
                        try:
                            async with httpx.AsyncClient() as client:
                                async with client.stream(
                                    "POST",
                                    GROQ_API_URL,
                                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                                    json={'model': groq_model, 'messages': messages, 'stream': True, 'max_tokens': 4096},
                                    timeout=httpx.Timeout(45.0, connect=5.0)
                                ) as response:
                                    if response.status_code == 200:
                                        in_think_block = False
                                        async for line in response.aiter_lines():
                                            if line.startswith('data: '):
                                                data = line[6:].strip()
                                                if data == '[DONE]': return
                                                try:
                                                    chunk = json.loads(data)
                                                    delta = chunk['choices'][0]['delta']
                                                    if delta.get('reasoning'):
                                                        continue
                                                    text = delta.get('content', '')
                                                    if not text: continue
                                                    if '<think>' in text:
                                                        in_think_block = True
                                                        parts = text.split('<think>')
                                                        text = parts[0]
                                                    if in_think_block:
                                                        if '</think>' in text:
                                                            in_think_block = False
                                                            parts = text.split('</think>')
                                                            text = parts[-1]
                                                        else:
                                                            continue
                                                    if text: yield text
                                                except: continue
                                        return  # SUCCESS
                                    elif response.status_code == 429:
                                        await asyncio.sleep(0.5)
                                        continue
                                    else:
                                        logger.warning(f"[Groq Stream] {groq_model} status {response.status_code}")
                                        continue
                        except Exception as e:
                            logger.warning(f"[Groq Stream] {groq_model} failed: {e}")
                            continue

            # --- STAGE 1: DIRECT GOOGLE GENAI SDK (Gemma 4 Fleet — rotate both keys) ---
            for g_client in self._google_clients():
                for g_model in [
                    'models/gemma-4-26b-a4b-it',
                    'models/gemma-4-31b-it',
                ]:
                    try:
                        contents, sys_instr = self._to_gemini_format(messages)
                        if 'gemma' in g_model.lower():
                            if sys_instr and contents and contents[0].get('role') == 'user':
                                contents[0]['parts'][0]['text'] = f"SYSTEM INSTRUCTIONS:\n{sys_instr}\n\nUSER MESSAGE:\n{contents[0]['parts'][0]['text']}"
                            config = {'max_output_tokens': 4096}
                        else:
                            config = {'system_instruction': sys_instr, 'max_output_tokens': 4096}

                        async for chunk in await g_client.aio.models.generate_content_stream(
                            model=g_model, contents=contents, config=config
                        ):
                            text = ""
                            try:
                                if hasattr(chunk, 'text') and chunk.text:
                                    text = chunk.text
                                elif hasattr(chunk, 'candidates') and chunk.candidates:
                                    text = chunk.candidates[0].content.parts[0].text
                            except: pass
                            if text:
                                yield text
                        return  # SUCCESS
                    except Exception as e:
                        logger.warning(f"[Google SDK Fallback] {g_model} failed: {e}")
                        if "429" in str(e):
                            await asyncio.sleep(1)

            # --- STAGE 2: OPENROUTER DEEP FALLBACK CHAIN ---
            models_to_try = [self.model] + [m for m in FALLBACK_MODELS if m != self.model]

            async with httpx.AsyncClient() as client:
                for model in models_to_try:
                    try:
                        async with client.stream(
                            "POST",
                            f'{self.base_url}/chat/completions',
                            headers=self.headers,
                            json={'model': model, 'messages': messages, 'stream': True, 'max_tokens': 4096},
                            timeout=httpx.Timeout(60.0, connect=5.0)
                        ) as response:
                            if response.status_code in (400, 401, 429, 402, 404):
                                logger.info(f"[Fallback] Skipping {model} (Status {response.status_code})")
                                if response.status_code == 429:
                                    await asyncio.sleep(1.5)
                                continue
                            
                            response.raise_for_status()
                            in_think_block = False
                            async for line in response.aiter_lines():
                                if line.startswith('data: '):
                                    data = line[6:].strip()
                                    if data == '[DONE]': return
                                    try:
                                        chunk = json.loads(data)
                                        delta = chunk['choices'][0]['delta']
                                        
                                        # 1. Skip explicit reasoning fields
                                        if delta.get('reasoning'):
                                            continue
                                            
                                        text = delta.get('content') or ''
                                        if not text: continue

                                        # 2. State-aware <think> tag filtering
                                        if '<think>' in text:
                                            in_think_block = True
                                            parts = text.split('<think>')
                                            text = parts[0]
                                        
                                        if in_think_block:
                                            if '</think>' in text:
                                                in_think_block = False
                                                parts = text.split('</think>')
                                                text = parts[-1]
                                            else:
                                                continue
                                        
                                        if text: yield text
                                    except: continue
                            return
                    except: continue

        except asyncio.CancelledError:
            logger.info("[AI Stream] Cancelled by client.")
            raise
        except Exception as e:
            logger.error(f"[AI Stream Error] {e}")
            err_msg = f"Intelligence Signal Interrupted. Every engine failed. Primary snag: {errors[0] if errors else 'Unknown'}"
            logger.error(f"[AI Stream Final Failure]: {err_msg}")
            yield err_msg

    def embed_text_cloud(self, content, is_query=True):
        """
        Hyper-Resilient Cloud Embeddings: Gemini Embedding 2 (Primary) -> Embedding 1 (Fallback).
        Maintains a strong combined quota while maximizing retrieval precision.
        """
        if not self.google_client:
            logger.error("[RAG] Google Client not initialized.")
            return None
        
        task_type = 'RETRIEVAL_QUERY' if is_query else 'RETRIEVAL_DOCUMENT'
        
        # --- PRIMARY: Gemini Embedding 2 (The Elite Signal) ---
        for model_id in ['models/gemini-embedding-2-preview', 'models/gemini-embedding-001']:
            try:
                if isinstance(content, str):
                    # Single string — one API call
                    result = self.google_client_v1.models.embed_content(
                        model=model_id,
                        contents=content,
                        config={'task_type': task_type, 'output_dimensionality': 384}
                    )
                    if result.embeddings and len(result.embeddings) > 0:
                        return result.embeddings[0].values
                    return None
                else:
                    # List — embed in small batches of 1 to maximize key rotation flexibility
                    import time as _time
                    vectors = []
                    key1_daily_exhausted = False   # Permanently skip key1 if daily quota hit
                    rpm_exhausted_clients = set()  # Track RPM-limited clients within this batch
                    BATCH = 1
                    for i in range(0, len(content), BATCH):
                        batch = content[i:i + BATCH]
                        for item in batch:
                            # If key1 is daily-exhausted, go straight to key2
                            primary_client = self.google_client2 if key1_daily_exhausted else self.google_client_v1
                            try:
                                r = primary_client.models.embed_content(
                                    model=model_id,
                                    contents=item,
                                    config={'task_type': task_type, 'output_dimensionality': 384}
                                )
                                if r.embeddings and len(r.embeddings) > 0:
                                    vectors.append(r.embeddings[0].values)
                                else:
                                    vectors.append(None)
                            except Exception as item_err:
                                err_str = str(item_err)
                                if '429' in err_str or 'RESOURCE_EXHAUSTED' in err_str:
                                    is_daily_limit = (
                                        'PerDay' in err_str or
                                        'per_day' in err_str.lower() or
                                        'limit: 1000' in err_str or
                                        'EmbedContentRequestsPerDay' in err_str
                                    )
                                    if is_daily_limit:
                                        # Mark key1 as permanently exhausted for this batch
                                        key1_daily_exhausted = True
                                        logger.warning(f"[RAG Cloud] Daily quota on key1 — switching to key2 for all remaining chunks")
                                        if self.google_client2:
                                            try:
                                                r2 = self.google_client2.models.embed_content(
                                                    model=model_id,
                                                    contents=item,
                                                    config={'task_type': task_type, 'output_dimensionality': 384}
                                                )
                                                if r2.embeddings and len(r2.embeddings) > 0:
                                                    vectors.append(r2.embeddings[0].values)
                                                    continue
                                            except Exception as e2:
                                                err2 = str(e2)
                                                if '429' in err2 or 'RESOURCE_EXHAUSTED' in err2:
                                                    logger.warning(f"[RAG Cloud] Key2 also rate-limited — sleeping 65s")
                                                    _time.sleep(65)
                                                    try:
                                                        r2 = self.google_client2.models.embed_content(
                                                            model=model_id,
                                                            contents=item,
                                                            config={'task_type': task_type, 'output_dimensionality': 384}
                                                        )
                                                        if r2.embeddings and len(r2.embeddings) > 0:
                                                            vectors.append(r2.embeddings[0].values)
                                                            continue
                                                    except Exception:
                                                        pass
                                                else:
                                                    logger.warning(f"[RAG Cloud] Key2 also failed: {e2}")
                                        # Both keys exhausted — stop embedding
                                        logger.warning(f"[RAG Cloud] Both keys exhausted — returning partial vectors")
                                        vectors.append(None)
                                        raise StopIteration("daily_quota_exhausted")
                                    else:
                                        # RPM limit — try the other key immediately
                                        other_client = self.google_client2 if not key1_daily_exhausted else None
                                        if other_client and id(other_client) not in rpm_exhausted_clients:
                                            try:
                                                r = other_client.models.embed_content(
                                                    model=model_id,
                                                    contents=item,
                                                    config={'task_type': task_type, 'output_dimensionality': 384}
                                                )
                                                if r.embeddings and len(r.embeddings) > 0:
                                                    vectors.append(r.embeddings[0].values)
                                                    continue
                                            except Exception as retry_err:
                                                err2 = str(retry_err)
                                                if '429' in err2 or 'RESOURCE_EXHAUSTED' in err2:
                                                    rpm_exhausted_clients.add(id(other_client))
                                        # Both RPM-limited — sleep and retry
                                        logger.warning(f"[RAG Cloud] All keys RPM-limited — sleeping 65s")
                                        _time.sleep(65)
                                        rpm_exhausted_clients.clear()
                                        try:
                                            active = self.google_client2 if key1_daily_exhausted else self.google_client_v1
                                            r = active.models.embed_content(
                                                model=model_id,
                                                contents=item,
                                                config={'task_type': task_type, 'output_dimensionality': 384}
                                            )
                                            if r.embeddings and len(r.embeddings) > 0:
                                                vectors.append(r.embeddings[0].values)
                                                continue
                                        except Exception:
                                            pass
                                        vectors.append(None)
                                        continue
                                else:
                                    logger.warning(f"[RAG Cloud] Item embed failed: {item_err}")
                                    vectors.append(None)
                        # Small pause between items to stay under RPM
                        if i + BATCH < len(content):
                            _time.sleep(0.7)
                    # Return length-aligned list (None for failed items) so callers can zip with chunks
                    if any(v is not None for v in vectors):
                        return vectors
                    return None
            except StopIteration as si:
                if 'daily_quota_exhausted' in str(si):
                    logger.warning("[RAG Cloud] Daily quota hit — returning partial vectors")
                    # Return length-aligned list so callers can zip with chunks
                    return vectors if any(v is not None for v in vectors) else None
                raise
            except Exception as e:
                logger.warning(f"[RAG Cloud] {model_id} failed: {e}. Falling back...")
                continue
                
        logger.error("[RAG Cloud Fatal] All embedding engines failed.")
        return None

    async def perform_global_search(self, query: str, user, limit: int = 7) -> str:
        """
        Search across the user's entire library for the most relevant context.
        Uses Cloud Embeddings (RAM-Zero architecture).
        """
        if not query: return ""
            
        async def _run_search():
            try:
                from library.models import DocumentChunk
                from django.db import models
                from pgvector.django import L2Distance
                
                logger.info(f"[Global RAG] Cloud-Searching across library for: {query[:50]}...")
                
                # Cloud Calculation: 0MB Local RAM footprint
                query_vector = await asyncio.to_thread(self.embed_text_cloud, query)
                
                if not query_vector:
                    logger.warning("[RAG] Failed to generate cloud vector. Falling back to empty context.")
                    return ""

                # Query the database (PGVector)
                from asgiref.sync import sync_to_async
                
                def _do_db_query():
                    return list(DocumentChunk.objects.filter(
                        resource__owner=user
                    ).annotate(
                        distance=L2Distance('embedding', query_vector)
                    ).order_by('distance').select_related('resource')[:limit])
                
                top_chunks = await asyncio.to_thread(_do_db_query)
                
                if not top_chunks:
                    return ""
                
                context_parts = ["--- RELEVANT CONTEXT FROM YOUR ENTIRE LIBRARY ---"]
                for chunk in top_chunks:
                    source_label = f"From '{chunk.resource.title}'"
                    if chunk.page_number:
                        source_label += f" (p. {chunk.page_number})"
                    
                    context_parts.append(f"{source_label}:\n{chunk.text_content.strip()}")
                    
                return "\n\n".join(context_parts)
            except Exception as e:
                logger.error(f"[Global RAG Cloud Failure]: {e}")
                return ""

        try:
            # High-Precision 20s Circuit Breaker
            return await asyncio.wait_for(_run_search(), timeout=20.0)
        except asyncio.TimeoutError:
            logger.warning(f"[Global RAG Timeout] Cloud search exceeded 20s.")
            return "--- Library context search timed out. Proceeding with general knowledge. ---"
        except Exception as e:
            logger.error(f"[Global RAG Fatal]: {e}")
            return ""
            
        except Exception as e:
            logger.error(f"[Global RAG Error]: {e}")
            return ""

    def get_workspace_library_context(self, workspace) -> str:
        """
        Aggregate context from all resources linked to a specific workspace.
        This provides FlowAI with 'Complete Access' to the shared knowledge base.
        """
        resources = workspace.resources.all()
        if not resources.exists():
            return ""

        logger.info(f"[Workspace Intelligence] Gathering context from {resources.count()} resources in '{workspace.name}'")
        
        knowledge_parts = ["--- SHARED WORKSPACE KNOWLEDGE BASE ---"]
        
        # We process each resource, prioritizing Study Kits and summaries
        for res in resources:
            res_info = [f"### Resource: {res.title} ({res.get_resource_type_display()})"]
            
            # 1. Check for AI Summary (High value, low tokens)
            if res.ai_summary:
                res_info.append(f"Summary: {res.ai_summary[:2000]}")
            
            # 2. Check for AI Notes (Study Kit) - very high value
            if res.ai_notes_json:
                kit = res.ai_notes_json
                summary = kit.get('overview', {}).get('summary', '')
                if summary:
                    res_info.append(f"Key Findings: {summary}")
                
                # Add top 3 section headers to let AI know what's in there
                sections = kit.get('sections', [])
                if sections:
                    headers = [f"- {s.get('title')}" for s in sections[:5] if s.get('title')]
                    res_info.append("Topics Covered:\n" + "\n".join(headers))

            knowledge_parts.append("\n".join(res_info))

        # Combine with a reasonable cap to ensure we don't blow the context window
        full_context = "\n\n".join(knowledge_parts)
        return full_context[:10000] # Safe cap for broad workspace context

    def _get_resource_context(self, resource, query=None) -> str:

        """Build the richest context possible for this resource, optionally isolating relevance via Semantic Search."""
        parts = []

        # 1. Vector Search text (primary RAG approach)
        text_context = ""
        try:
            if query and resource.chunks.exists():
                logger.info(f"[RAG] Executing vector similarity search for query: {query}")
                
                # Cloud-First: RAM-Zero footprint
                query_vector = self.embed_text_cloud(query)
                if not query_vector:
                    logger.error("[RAG Error] Could not generate cloud vector for specific resource.")
                    return
                
                # Retrieve the top 5 closest chunks using PGVector L2 distance operator
                top_chunks = resource.chunks.annotate(
                    distance=L2Distance('embedding', query_vector)
                ).order_by('distance')[:5]
                
                text_context = "\n...".join([c.text_content for c in top_chunks])
                if text_context:
                    parts.append(f"--- High-Relevance Extracted Context ---\n{text_context}")
        except Exception as e:
            logger.error(f"[RAG Error]: {e}")
            
        # Fallback to standard extracted text if RAG fails or isn't requested
        if not text_context and resource.ai_concepts:
            for concept in resource.ai_concepts:
                text = concept.get('extracted_text', '') or concept.get('transcript', '')
                if text:
                    parts.append(f'--- Document Text ---\n{text[:15000]}')
                    break

        # 2. AI-generated study notes (lets chat AI reference what the student sees)
        if resource.ai_notes_json:
            kit = resource.ai_notes_json
            notes_text = []
            overview = kit.get('overview', {})
            if overview.get('summary'):
                notes_text.append(f"Overview: {overview['summary']}")
            for sec in kit.get('sections', [])[:12]:
                content = sec.get('content', '')
                if isinstance(content, list):
                    content = '\n'.join(content)
                notes_text.append(f"## {sec.get('title', '')}\n{content[:800]}")
            vocab = kit.get('vocabulary', [])
            if vocab:
                vocab_lines = [f"- **{v.get('term', '')}**: {v.get('definition', '')}" for v in vocab if v.get('term') and v.get('definition')]
                if vocab_lines:
                    notes_text.append('Key Vocabulary:\n' + '\n'.join(vocab_lines))
            if notes_text:
                parts.append('--- AI Study Notes (what the student sees) ---\n' + '\n\n'.join(notes_text))

        if parts:
            return '\n\n'.join(parts)[:35000]

        if resource.ai_summary:
            return resource.ai_summary[:5000]

        if resource.resource_type == 'video':
            return f"This is a YouTube video titled '{resource.title}' about {resource.subject or 'the topic'}. No transcript is available, but answer based on general knowledge of this subject."
        return ''

    def ask_about_resource(self, resource, question: str, history: list = None) -> str:
        context = self._get_resource_context(resource)
        has_notes = bool(resource.ai_notes_json)
        system = (
            f"{FLOWAI_SYSTEM_PROMPT}\n\n"
            f"CURRENT CONTEXT: You are the student's AI Study Partner for '{resource.title}' "
            f"(Subject: {resource.subject or 'General'})."
        )
        if has_notes:
            system += " A FlowAI Study Kit has been generated for this material — use it to give precise answers."
        if context:
            system += f"\n\n{context}\n\nUse the above as your primary reference. When referencing the study notes, be specific about section names and vocabulary terms."
        messages = [{'role': 'system', 'content': system}]
        if history:
            messages.extend(history[-10:])
        messages.append({'role': 'user', 'content': question})
        return self.chat_sync(messages)

    def summarize_resource(self, resource) -> str:
        context = self._get_resource_context(resource)
        if context:
            prompt = f"Summarize '{resource.title}' with structured key points and important takeaways:\n\n{context}"
        else:
            prompt = f"Create a study guide for '{resource.title}' (subject: {resource.subject or 'general'})."
        return self.chat_sync([{'role': 'user', 'content': prompt}])

    def generate_flashcards(self, resource, count: int = 15, level: str = 'undergrad', context: str = '') -> list:
        content = context or self._get_resource_context(resource)
        base = f"for '{resource.title}' at {level} level"
        latex_rule = " Use LaTeX ($$ for blocks, $ for inline) for all math/chemistry."
        
        # Use Hyper-Speed models for instant interactivity
        prompt = (
            f"Generate exactly {count} professional high-yield flashcards {base} based on this content:\n\n"
            f"{content[:8000]}\n\n"
            'Return ONLY a RAW JSON array of objects with exactly these keys: "question", "answer", "difficulty" (easy/medium/hard). '
            f"{latex_rule} No markdown formatting, just the raw array."
        )
        
        # Force the ultra-fast 2.0 Flash Lite model for instant feedback
        # Set a aggressive 25s timeout so it doesn't hang the UI if the API is down
        raw_response = self.chat_sync([{'role': 'user', 'content': prompt}])
        return self._parse_json(raw_response, [])

    def generate_quiz(self, resource, fmt: str, level: str, count: int) -> list:
        context = self._get_resource_context(resource)
        # Normalize format aliases
        fmt = fmt.replace('multiple_choice', 'mcq').replace('multiple-choice', 'mcq')
        content_part = f"\n\nBased on:\n{context[:8000]}" if context else ""
        prompt = (
            f"Generate {count} multiple choice questions for '{resource.title}' at {level} level{content_part}.\n"
            "Return ONLY a JSON array. Each object MUST have exactly these keys:\n"
            '  \"question\": the question text,\n'
            '  \"options\": array of exactly 4 answer strings,\n'
            '  \"correct_answer\": the exact string from options that is correct,\n'
            '  \"explanation\": brief explanation of why the answer is correct.\n'
            "Use LaTeX for all math/chemistry. No markdown, just the raw JSON array."
        )
        return self._parse_json(self.chat_sync([{'role': 'user', 'content': prompt}]), [])

    def generate_study_nudge(self, user, recent_topics: list) -> str:
        topics = ', '.join(recent_topics) if recent_topics else 'general studies'
        name = user.first_name or user.username or 'there'
        prompt = (
            f"Write a short, warm, motivating study nudge (1-2 sentences max) for a student named {name} "
            f"who has been studying: {topics}. Be specific to their subject if possible. "
            "Sound like a supportive friend, not a robot. No emojis. No quotes around the response. "
            "Output ONLY the nudge text, nothing else."
        )
        messages = [{'role': 'user', 'content': prompt}]

        # Use reliable instruction-following models — skip gpt-oss-20b which echoes prompts
        import httpx, asyncio as _asyncio

        async def _call():
            for key in self._groq_keys():
                for model in ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile']:
                    try:
                        async with httpx.AsyncClient() as client:
                            resp = await client.post(
                                GROQ_API_URL,
                                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                                json={'model': model, 'messages': messages, 'max_tokens': 80},
                                timeout=8,
                            )
                            if resp.status_code == 200:
                                result = resp.json()["choices"][0]["message"]["content"].strip()
                                if result and len(result) > 10:
                                    logger.info(f"[StudyNudge] ✓ {model}")
                                    return result
                    except Exception as e:
                        logger.warning(f"[StudyNudge] {model} failed: {e}")
            # Fallback to SambaNova
            samba_key = os.getenv('SAMBANOVA_API_KEY', '')
            if samba_key:
                try:
                    async with httpx.AsyncClient() as client:
                        resp = await client.post(
                            SAMBANOVA_API_URL,
                            headers={"Authorization": f"Bearer {samba_key}", "Content-Type": "application/json"},
                            json={'model': 'Meta-Llama-3.3-70B-Instruct', 'messages': messages, 'max_tokens': 80},
                            timeout=10,
                        )
                        if resp.status_code == 200:
                            return resp.json()["choices"][0]["message"]["content"].strip()
                except Exception as e:
                    logger.warning(f"[StudyNudge] SambaNova failed: {e}")
            return ''

        try:
            result = async_to_sync(_call)()
        except Exception as e:
            logger.warning(f"[StudyNudge] async call failed: {e}")
            result = ''

        if not result:
            return ''
        result = result.strip()
        # Sanity check: if the result looks like the prompt leaked back, discard it
        leak_signals = ['Write a short', 'study nudge', 'motivating study', 'Sound like a supportive', 'Output ONLY']
        if any(sig.lower() in result.lower() for sig in leak_signals):
            logger.warning("[StudyNudge] Prompt leaked into response — discarding.")
            return ''
        return result

    def group_chat_assist(self, group_name: str, context: str, question: str) -> str:
        system = (
            f"{FLOWAI_SYSTEM_PROMPT}\n\n"
            f"CURRENT CONTEXT: You are a peer teammate for the study group '{group_name}'.\n"
            "- TEAMMATE MODE: Stay extremely brief (1-2 sentences). Act like a teammate, not a bot.\n"
            "- NO UNPROMPTED SUMMARIES: Never summarize the chat unless explicitly asked to 'summarize' or 'recap'.\n"
            "- If you are just being acknowledged or 'checked on', give a quick, witty response."
        )
        if context:
            system += f"\n\nCurrent discussion context: {context}"
        return self.chat_sync([{'role': 'system', 'content': system}, {'role': 'user', 'content': question}])

    def generate_chapter_summaries(self, transcript: str, title: str) -> list:
        """Generate timestamped chapter summaries from a YouTube transcript."""
        prompt = (
            f"Analyze this YouTube video transcript for '{title}' and break it into logical chapters/sections.\n\n"
            f"Transcript:\n{transcript[:30000]}\n\n"
            "Return ONLY a JSON array of chapters:\n"
            '[{"chapter": 1, "title": "Chapter Title", "summary": "2-3 sentence summary", "key_points": ["point1", "point2"], "start_time_estimate": "0:00"}]\n'
            "Estimate timestamps based on content position. No extra text."
        )
        return self._parse_json(self.chat_sync([{'role': 'user', 'content': prompt}]), [])

    def explain_text(self, text: str, context: str = '') -> str:
        """Explain a highlighted piece of text in simple terms."""
        system = f"{FLOWAI_SYSTEM_PROMPT}\n\nCONTEXT: {context}" if context else FLOWAI_SYSTEM_PROMPT
        prompt = (
            f"Explain this text clearly and concisely for a student:\n\n\"{text}\"\n\n"
            "Give: 1) Simple explanation, 2) Why it matters, 3) A real-world example if relevant. "
            "Keep it under 150 words. Use markdown. Use LaTeX ($) for any math/formulas."
        )
        return self.chat_sync([{'role': 'system', 'content': system}, {'role': 'user', 'content': prompt}])

    def extract_key_concepts(self, resource) -> list:
        """Extract key concepts and definitions from a resource."""
        context = self._get_resource_context(resource)
        if not context:
            context = resource.ai_summary or resource.title
        prompt = (
            f"Extract the 8-12 most important concepts from '{resource.title}'.\n\n"
            f"Content:\n{context[:4000]}\n\n"
            "Return ONLY a JSON array:\n"
            '[{"concept": "Term", "definition": "Clear definition", "importance": "high|medium|low"}]\n'
            "No extra text."
        )
        return self._parse_json(self.chat_sync([{'role': 'user', 'content': prompt}]), [])

    def describe_image_for_notes(self, image_bytes: bytes, page_number: int, ext: str = 'png') -> str:
        """
        Use Vision AI to describe a diagram/image extracted from a PDF.
        Returns a concise, educational description suitable for embedding in notes.
        """
        import base64
        try:
            mime = f'image/{ext}' if ext != 'jpg' else 'image/jpeg'
            b64 = base64.b64encode(image_bytes).decode('utf-8')
            messages = [{
                'role': 'user',
                'content': [
                    {
                        'type': 'text',
                        'text': (
                            f'This is a diagram/figure from a PDF (Page {page_number}). '
                            'Describe it in detail for a student\'s study notes. '
                            'Include: what type of diagram it is, all labels/text visible, '
                            'the concept it illustrates, and why it matters academically. '
                            'Be concise but thorough (3-6 sentences). Use plain text, no markdown headers.'
                        )
                    },
                    {
                        'type': 'image_url',
                        'image_url': {'url': f'data:{mime};base64,{b64}'}
                    }
                ]
            }]
            result = self._call_vision(messages)
            return result.strip() if result else f'[Diagram on page {page_number} — description unavailable]'
        except Exception as e:
            logger.warning(f'Image description failed for page {page_number}: {e}')
            return f'[Diagram on page {page_number}]'

    def generate_study_kit(self, resource, context: str = '', page_image_map: dict = None, vision_data: list = None, page_count: int = 0) -> dict:
        """
        Generate a comprehensive FlowAI study kit JSON.
        Supports text-based analysis and Vision-based OCR for scanned PDFs.
        """
        resource.processing_progress = 10
        resource.status_text = "📖 Ingesting material..."
        resource.save(update_fields=['processing_progress', 'status_text'])

        text = context or self._get_resource_context(resource)
        
        # Calculate density for PDF logic
        effective_page_count = page_count or getattr(resource, 'page_count', 0) or (len(vision_data) if vision_data else 1)
        text_density = len(text.strip()) / max(effective_page_count, 1)

        # Initialize image_hint
        image_hint = ''
        if page_image_map:
            pages_with_images = sorted(page_image_map.keys())
            image_hint = (
                f'\n\nIMAGES AVAILABLE on pages: {pages_with_images}. '
                'For each section include a "page_refs" array of the page numbers it covers.'
            )

        # 1. VISION MULTI-MODAL: Trigger if vision data exists (YouTube frames or Scanned PDFs)
        is_video = resource.resource_type == 'video'
        
        if vision_data:
            if not text.strip() or (effective_page_count > 1 and text_density < 750 and not is_video):
                logger.info(f"Low density/Scanned material detected. Activating PURE Vision OCR mode...")
                self._current_image_map = page_image_map
                return self._generate_vision_study_kit(resource, vision_data)
            elif is_video:
                logger.info(f"Video with Visual Insights detected. Activating MULTI-MODAL mode...")
                # We'll continue with the standard generation but pass vision hints
                image_hint += f"\n\nVISUAL EVIDENCE: {len(vision_data)} frames captured from the video. These have been analyzed for slides, diagrams, and whiteboards. Use the Visual Evidence to SUPPLEMENT the transcript for hyper-accuracy."

        if not text.strip() or len(text.strip()) < 100:
            logger.info(f"Context is scarce for '{resource.title}'. Engaging Topic-Based Synthesis...")
            text = f"TOPIC: {resource.title}\nSUBJECT: {resource.subject or 'General'}\n\nSTRICT REQUIREMENT: Provide a deep, FOUNDATIONAL study kit based on your expert academic knowledge of this topic. Do not return empty sections. Generate at least 20 detailed modules."
            is_math_intensive = any(kw in resource.title.lower() for kw in ['math', 'calculus', 'physics', 'equation'])
        else:
            # Detect if the material is math-intensive
            is_math_intensive = any(kw in text.lower() for kw in ['integral', 'derivative', 'equation', 'formula', 'theorem', 'calculus', 'algebra', 'geometry'])
        
        math_hint = ""
        if is_math_intensive:
            math_hint = (
                "\n\nDETECTION: This content is Mathematics-Intensive. "
                "Use standard LaTeX delimiters: $$[formula]$$ for block math and $[formula]$ for inline math. "
                "Break down complex equations into logical 'Derivation Steps' with 'Variable Intuition'."
            )

        resource.processing_progress = 25
        resource.status_text = "🔬 Analyzing context..."
        resource.save(update_fields=['processing_progress', 'status_text'])

        # ─── MACRO-CHUNKING (Hyper-Speed Mode) ───
        # 15K chunks — balances context quality vs token budget for response
        chunk_size = 15000
        overlap = 500
        chunks = [text[i:i + chunk_size] for i in range(0, len(text), chunk_size - overlap)]

        # [NEW] Multi-Modal Vision Context
        chat_vision_bundle = []
        if is_video and vision_data:
            import base64
            for p in vision_data[:5]:
                b64 = base64.b64encode(p['data']).decode('utf-8')
                chat_vision_bundle.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}})

        all_sections = []
        all_vocabulary = []
        all_tips = []
        overview = {}

        # ─── PRE-GENERATE PROMPTS ───
        prompts = []
        for idx, chunk_text in enumerate(chunks[:25]):
            # VERSION TAG: 3.1-PREMIUM (Ultra-Readability)
            prompt = (
                f"You are FlowAI Study Architect — an expert at creating study materials that combine academic depth with memory science.\n"
                f"MATERIAL: '{resource.title}'\n\n"
                "GOAL: Create study notes that are DETAILED yet DIGESTIBLE — like a brilliant friend explaining it to you.\n\n"
                "CONTENT PHILOSOPHY (Feynman Technique + Memory Science):\n"
                "1. EXPLAIN SIMPLY FIRST: Start each section with a plain-English explanation a smart 16-year-old could follow.\n"
                "2. THEN GO DEEP: Follow with the academic detail, mechanisms, and nuance.\n"
                "3. MEMORY ANCHORS: For every key concept, include ONE of:\n"
                "   - A memorable ACRONYM (e.g. HOMES for Great Lakes)\n"
                "   - A MNEMONIC phrase (e.g. Never Eat Soggy Waffles for compass directions)\n"
                "   - A VIVID ANALOGY that makes the concept click\n"
                "   - A PATTERN or RULE OF THUMB\n"
                "4. MICRO-PARAGRAPHING: Max 3-4 sentences per paragraph. No walls of text.\n"
                "5. SEMANTIC BOLDING: **Bold** key terms on first appearance.\n"
                "6. BULLET POINTS: Use for lists, steps, comparisons.\n"
                "7. Provide 8-10 sections per chunk.\n\n"
                "STRICT JSON OUTPUT FORMAT:\n"
                "{\n"
                "  \"overview\": {\"title\": \"Title\", \"icon\": \"Emoji\", \"summary\": \"2-3 sentence plain-English overview. No jargon. No asterisks.\"},\n"
                "  \"sections\": [\n"
                "    {\n"
                "      \"icon\": \"Emoji\",\n"
                "      \"title\": \"Section Title\",\n"
                "      \"content\": \"**Key Question:** [question that frames the concept]?\\n\\n[Plain-English explanation first — 2-3 sentences anyone can follow]\\n\\n[Deep academic content — mechanisms, processes, examples — 3-5 paragraphs with **bold** key terms and bullet points]\\n\\n**Memory Trick:** [ACRONYM/mnemonic/analogy — make it memorable and specific to this concept, not generic]\\n\\n**Quick Summary:** [1-2 sentence Feynman-style recap in the simplest possible terms]\",\n"
                "      \"page_refs\": [],\n"
                "      \"mermaid_diagram\": \"graph TD;...\"\n"
                "    }\n"
                "  ],\n"
                "  \"vocabulary\": [{\"term\": \"...\", \"definition\": \"Plain-English definition + one real-world example\"}],\n"
                "  \"exam_tips\": [\"High-yield exam tip with specific testable detail\"]\n"
                "}\n"
                "\nCONTENT RULES:\n"
                "- Every section MUST follow: Key Question → Simple explanation → Deep content → Memory Trick → Quick Summary\n"
                "- Memory Tricks must be SPECIFIC to the concept. Create real acronyms/mnemonics, not placeholders.\n"
                "- Minimum 250 words per section. Quality over quantity.\n"
                "- USE LATEX for all math/physics formulas.\n"
                f"{image_hint if idx == 0 else ''}\n"
                f"{math_hint}\n\n"
                f"SOURCE MATERIAL:\n{chunk_text}\n\n"
                "Return ONLY valid JSON. START WITH '{' AND END WITH '}'."
            )
            prompts.append(prompt)

        total_chunks = len(prompts)
        logger.info(f'[AI Service] Entering Quad-Burst Parallel Engine for {total_chunks} chunks...')
        
        # Use single worker and sleep delay for Free Tier safety
        try:
            with ThreadPoolExecutor(max_workers=1) as executor:
                # First chunk gets the Visual Evidence for better context
                futures = {}
                for idx, p in enumerate(prompts):
                    if idx > 0:
                        import time
                        time.sleep(2)
                    imgs = chat_vision_bundle if idx == 0 else []
                    futures[executor.submit(self._task_with_watchdog, p, idx, imgs)] = idx
                
                for future in as_completed(futures):
                    idx = futures[future]
                    try:
                        res_content = future.result()
                        if not res_content: continue
                        
                        # Parse with the new Truncation-Aware parser
                        chunk_kit = self._parse_json(res_content, {})
                        
                        # Capture primary overview from the first successful chunk
                        if not overview:
                            overview = chunk_kit.get('overview', {})
                        
                        # Merge sections with internal type-safety (handle case variations)
                        sections_added = 0
                        # Fuzzy Key Normalization (Handle variations: sections, Sections, modules, Modules, study_modules)
                        possible_keys = ['sections', 'Sections', 'modules', 'Modules', 'study_modules', 'StudyModules',
                                         'topics', 'Topics', 'chapters', 'Chapters', 'content', 'units', 'Units',
                                         'lessons', 'Lessons', 'parts', 'Parts']
                        s_key = next((k for k in possible_keys if k in chunk_kit and isinstance(chunk_kit[k], list)), None)

                        # Last resort: find any list value that contains dicts with a 'title' key
                        if not s_key:
                            for k, v in chunk_kit.items():
                                if isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict) and v[0].get('title'):
                                    s_key = k
                                    break
                        
                        if s_key:
                            for sec in chunk_kit[s_key]:
                                if isinstance(sec, dict) and sec.get('title'):
                                    sections_added += 1
                                    all_sections.append(sec)
                        else:
                            # Log ALL keys in the response to diagnose the mismatch
                            all_keys = list(chunk_kit.keys()) if isinstance(chunk_kit, dict) else []
                            logger.warning(f"[AI Service] Chunk {idx+1} yielded 0 sections. Keys found: {all_keys}. Raw sample: {str(res_content)[:500]}")
                            
                            # Deep extraction: check if sections are nested inside overview or another dict
                            for k, v in chunk_kit.items():
                                if isinstance(v, dict):
                                    # Check one level deeper
                                    for inner_k, inner_v in v.items():
                                        if isinstance(inner_v, list) and len(inner_v) > 0 and isinstance(inner_v[0], dict) and inner_v[0].get('title'):
                                            logger.info(f"[AI Service] Found sections nested at {k}.{inner_k}")
                                            for sec in inner_v:
                                                if isinstance(sec, dict) and sec.get('title'):
                                                    sections_added += 1
                                                    all_sections.append(sec)
                                            break
                                if sections_added > 0:
                                    break
                            
                            if sections_added > 0:
                                logger.info(f"[AI Service] Chunk {idx+1} deep extraction recovered {sections_added} sections.")
                            else:
                                # Retry once — model may have returned only overview or partial JSON
                                try:
                                    import time as _time
                                    _time.sleep(3)
                                    retry_content = self._task_with_watchdog(prompts[idx], idx, [])
                                    if retry_content:
                                        retry_kit = self._parse_json(retry_content, {})
                                        s_key_retry = next((k for k in possible_keys if k in retry_kit and isinstance(retry_kit[k], list)), None)
                                        if not s_key_retry:
                                            for k, v in retry_kit.items():
                                                if isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict) and v[0].get('title'):
                                                    s_key_retry = k
                                                    break
                                        if s_key_retry:
                                            for sec in retry_kit[s_key_retry]:
                                                if isinstance(sec, dict) and sec.get('title'):
                                                    sections_added += 1
                                                    all_sections.append(sec)
                                            logger.info(f"[AI Service] Chunk {idx+1} retry recovered {sections_added} sections.")
                                        else:
                                            logger.warning(f"[AI Service] Chunk {idx+1} retry also yielded 0 sections. Skipping.")
                                except Exception as retry_err:
                                    logger.error(f"[AI Service] Chunk {idx+1} retry failed: {retry_err}")
                        
                        # Merge vocabulary
                        if 'vocabulary' in chunk_kit and isinstance(chunk_kit['vocabulary'], list):
                            for v in chunk_kit['vocabulary']:
                                if isinstance(v, dict) and v.get('term'):
                                    all_vocabulary.append(v)
                        
                        # Merge exam tips
                        if 'exam_tips' in chunk_kit and isinstance(chunk_kit['exam_tips'], list):
                            for tip in chunk_kit['exam_tips']:
                                if tip and isinstance(tip, str):
                                    all_tips.append(tip.strip())
                        
                        completed_count = total_chunks - sum(1 for f in futures if not f.done())
                        progress_val = 40 + int((completed_count / total_chunks) * 55)
                        resource.processing_progress = min(progress_val, 95)
                        resource.status_text = f"🧠 Synthesizing section {completed_count}/{total_chunks}..."
                        resource.save(update_fields=['processing_progress', 'status_text'])
                        
                        logger.info(f'[AI Service] Chunk {idx+1} successfully captured ({sections_added} sections).')
                                    
                    except Exception as e:
                        logger.error(f'[AI Service] Chunk {idx} failed: {str(e)}')
                        continue
        except RuntimeError:
            logger.info("[AI Service] Parallel engine safely interrupted by shutdown signal.")
        except Exception as e:
            logger.error(f"[AI Service] Quad-Burst Engine Error: {e}")

        if not overview:
            overview = {
                'title': resource.title,
                'icon': '\U0001f393',
                'summary': f'Comprehensive AI study kit for {resource.title}.',
            }

        kit = {
            'overview': overview,
            'sections': all_sections[:60],
            'vocabulary': all_vocabulary[:200],
            'exam_tips': list(dict.fromkeys(all_tips))[:50],
        }
        
        return self._attach_images_to_sections(kit, page_image_map)

    def _attach_images_to_sections(self, kit: dict, page_image_map: dict) -> dict:
        """Unified engine to match extracted diagrams to their relevant sections."""
        if not page_image_map:
            return kit

        sections = kit.get('sections', [])
        used_image_urls = set()

        # Pass 1: Attach images using page_refs where available
        for sec in sections:
            refs = sec.pop('page_refs', []) or []
            sec_images = []
            for page_num in refs:
                images_on_page = page_image_map.get(page_num, [])
                if isinstance(images_on_page, str):
                    images_on_page = [{'url': images_on_page, 'description': f'Figure — Page {page_num}'}]
                for img in images_on_page:
                    if img['url'] not in used_image_urls:
                        sec_images.append({'url': img['url'], 'caption': img['description'], 'page': page_num})
                        used_image_urls.add(img['url'])
            if sec_images:
                sec['images'] = sec_images
                sec.pop('mermaid_diagram', None)
            else:
                mermaid = (sec.get('mermaid_diagram') or '').strip()
                if not mermaid:
                    sec.pop('mermaid_diagram', None)

        # Pass 2: Distribute remaining unused images evenly across sections
        all_images = []
        for page_num in sorted(page_image_map.keys()):
            imgs = page_image_map[page_num]
            if isinstance(imgs, str):
                imgs = [{'url': imgs, 'description': f'Figure — Page {page_num}'}]
            for img in imgs:
                if img['url'] not in used_image_urls:
                    all_images.append({'url': img['url'], 'caption': img['description'], 'page': page_num})
                    used_image_urls.add(img['url'])

        if all_images and sections:
            # Spread remaining images: one per section, spaced evenly
            step = max(1, len(sections) // len(all_images))
            for i, img in enumerate(all_images):
                target_idx = min(i * step, len(sections) - 1)
                sec = sections[target_idx]
                if 'images' not in sec:
                    sec['images'] = []
                sec['images'].append(img)

        return kit

        return {
            'overview': overview,
            'sections': all_sections[:150],     # Expanded section limit
            'vocabulary': all_vocabulary[:200],  # Expanded vocabulary limit
            'exam_tips': list(dict.fromkeys(all_tips))[:50],
        }

    def _task_with_watchdog(self, prompt, idx, images=None):
        """Helper to run individual AI tasks with a watchdog timeout, supporting Multi-Modal inputs."""
        watchdog = ThreadPoolExecutor(max_workers=1)
        
        user_content = [{"type": "text", "text": prompt}]
        if images:
            user_content += images # Inject base64 video frames/slides
            
        # Study kit uses kit_chat_sync (Cerebras → SambaNova → Groq 70B → Google)
        # for quality + high daily quota. Falls back to chat_sync if kit_chat returns empty.
        future = watchdog.submit(self.kit_chat_sync, [{'role': 'user', 'content': user_content}], max_tokens=16384)
        try:
            # [IMPERIAL SCALE] Upgraded timeout to 500s for 20-section depth
            res = future.result(timeout=500)
            watchdog.shutdown(wait=False, cancel_futures=True)
            
            # Diagnostic Logging for 0-section bug
            if not res or (isinstance(res, str) and len(res) < 50):
                logger.error(f"[AI Service] Chunk {idx+1} returned EMPTY or suspicious response: {res}")
            
            return res
        except TimeoutError:
            logger.error(f'[AI Service] Chunk {idx+1} TIMED OUT after 300s. Skipping.')
            watchdog.shutdown(wait=False, cancel_futures=True)
            return None

    def _generate_vision_study_kit(self, resource, vision_data: list) -> dict:
        """
        Specialized pipeline for scanned (image-only) PDFs.
        Uses Vision AI to OCR and analyze content in parallel.
        """
        import base64
        
        # Optimize: Bundle pages into groups of 3 to maximize detail per token/call
        pages = vision_data[:30] # Limit to 30 pages for free-tier safety
        bundles = []
        for i in range(0, len(pages), 3):
            bundles.append(pages[i:i+3])

        def process_vision_bundle(idx, bundle):
            imgs_content = []
            page_nums = [p['page'] for p in bundle]
            is_video = resource.resource_type == 'video'
            
            for p in bundle:
                b64 = base64.b64encode(p['data']).decode('utf-8')
                imgs_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{b64}"}
                })
            
            persona = "academic scanner" if not is_video else "visual video analyzer"
            target_desc = f"SCANNED textbook pages" if not is_video else f"VIDEO INSIGHTS (Slides/Whiteboards)"
            
            text_prompt = {
                "type": "text",
                "text": (
                    f"You are FlowAI Study Architect analyzing {target_desc} from '{resource.title}'.\n\n"
                    "GOAL: OCR all text from these images and create study notes that are DETAILED yet DIGESTIBLE.\n\n"
                    "CONTENT PHILOSOPHY (Feynman Technique + Memory Science):\n"
                    "1. OCR everything: text, labels, diagrams, tables, formulas.\n"
                    "2. EXPLAIN SIMPLY FIRST: Start each section with a plain-English explanation anyone can follow.\n"
                    "3. THEN GO DEEP: Follow with academic detail, mechanisms, and nuance.\n"
                    "4. MEMORY ANCHORS: For every key concept include ONE of:\n"
                    "   - A memorable ACRONYM specific to this concept\n"
                    "   - A VIVID ANALOGY that makes it click\n"
                    "   - A MNEMONIC phrase\n"
                    "5. MICRO-PARAGRAPHING: Max 3-4 sentences per paragraph. No walls of text.\n"
                    "6. **Bold** key terms on first appearance. Use bullet points for lists.\n"
                    "7. Target 8-12 sections per bundle.\n\n"
                    "Return ONLY a raw JSON object (no markdown, no code blocks):\n"
                    "{\n"
                    "  \"overview\": {\"title\": \"Title\", \"icon\": \"Emoji\", \"summary\": \"2-3 sentence plain-English overview\"},\n"
                    "  \"sections\": [\n"
                    "    {\n"
                    "      \"icon\": \"Emoji\",\n"
                    "      \"title\": \"Section Title\",\n"
                    "      \"content\": \"**Key Question:** [question]?\\n\\n[Plain-English explanation — 2-3 sentences]\\n\\n[Deep academic content — mechanisms, examples — 3-5 paragraphs with **bold** key terms and bullet points]\\n\\n**Memory Trick:** [specific acronym/mnemonic/analogy for this concept]\\n\\n**Quick Summary:** [1-2 sentence Feynman-style recap]\",\n"
                    "      \"page_refs\": []\n"
                    "    }\n"
                    "  ],\n"
                    "  \"vocabulary\": [{\"term\": \"...\", \"definition\": \"Plain-English definition + example\"}],\n"
                    "  \"exam_tips\": [\"High-yield exam tip with specific testable detail\"]\n"
                    "}\n"
                    "RULES:\n"
                    "- Every section MUST follow: Key Question → Simple explanation → Deep content → Memory Trick → Quick Summary\n"
                    "- Memory Tricks must be SPECIFIC, not generic placeholders\n"
                    "- USE LATEX ($) for all math/physics formulas\n"
                    "- Start with { and end with }. No markdown fences."
                )
            }
            
            messages = [{"role": "user", "content": imgs_content + [text_prompt]}]
            
            try:
                res = self._call_vision(messages)
                return idx, self._parse_json(res, {})
            except Exception as e:
                logger.error(f"Vision bundle {idx} failed: {e}")
                return idx, {}
            finally:
                # Update progress
                current_count = len(results) + 1
                total = len(bundles)
                prog = 30 + int((current_count / total) * 60)
                resource.processing_progress = min(prog, 95)
                resource.status_text = f"🖼️ Scanning bundle {current_count}/{total}..."
                resource.save(update_fields=['processing_progress', 'status_text'])

        results = []
        # Use single worker and sleep delay for vision scanning to avoid 429 Exhausted errors
        with ThreadPoolExecutor(max_workers=1) as executor:
            futures = []
            for i, b in enumerate(bundles):
                if i > 0:
                    import time
                    time.sleep(3) # Heavy vision requests need longer buffers
                futures.append(executor.submit(process_vision_bundle, i, b))
            
            for future in futures:
                results.append(future.result())

        results.sort(key=lambda x: x[0])

        all_sections = []
        all_vocabulary = []
        all_tips = []
        
        for idx, result in results:
            if not result: continue
            if 'sections' in result: all_sections.extend(result['sections'])
            if 'vocabulary' in result: all_vocabulary.extend(result['vocabulary'])
            if 'exam_tips' in result: all_tips.extend(result['exam_tips'])

        # Build overview from first successful result
        first_result = next((r for _, r in results if r.get('overview')), None)
        overview = first_result.get('overview', {}) if first_result else {}
        if not overview or not overview.get('title'):
            overview = {
                "title": resource.title,
                "icon": "🔳",
                "summary": f"Visual study kit for {resource.title}. Content extracted from scanned pages."
            }

        kit = {
            "overview": overview,
            "sections": all_sections,
            "vocabulary": all_vocabulary,
            "exam_tips": all_tips
        }
        
        # Capture the image map from current extraction context (passed in or stored)
        return self._attach_images_to_sections(kit, getattr(self, '_current_image_map', {}))


    def _generate_basic_kit(self, resource) -> dict:
        """Fallback for when no context is available."""
        return {
            "overview": {"title": resource.title, "icon": "🎓", "summary": "Generating based on title..."},
            "sections": [{"title": "Initial Overview", "icon": "🧠", "content": f"A study kit for '{resource.title}' is being prepared."}],
            "vocabulary": [],
            "exam_tips": ["Review the main document for full details."]
        }

    def generate_study_notes(self, resource) -> str:
        """Generate structured study notes from a resource (Legacy wrapper)."""
        kit = self.generate_study_kit(resource)
        if kit and 'sections' in kit:
            notes = f"# {kit.get('overview', {}).get('title', resource.title)}\n\n"
            notes += f"> {kit.get('overview', {}).get('summary', '')}\n\n"
            for sec in kit['sections']:
                notes += f"## {sec.get('icon', '')} {sec.get('title', '')}\n{sec.get('content', '')}\n\n"
            return notes
        return "Study notes are being prepared..."

    def generate_mind_map(self, resource) -> dict:
        """Generate a mind map structure from a resource."""
        context = self._get_resource_context(resource)
        prompt = (
            f"Create a detailed mind map structure for '{resource.title}' (Subject: {resource.subject or 'General'}).\n\n"
            f"Content:\n{context[:8000] if context else resource.title}\n\n"
            "Return ONLY a raw JSON object (no markdown, no code blocks):\n"
            '{"center": "Main Topic", "branches": [{"topic": "Branch 1", "subtopics": ["sub1", "sub2"]}, ...]}\n'
            "Include 5-8 main branches with 3-5 subtopics each. Use emojis in topics. Start with { and end with }."
        )
        result = self._parse_json(self.chat_sync([{'role': 'user', 'content': prompt}]), {})
        # Validate structure
        if isinstance(result, dict) and result.get('center') and result.get('branches'):
            return result
        # Try to build a minimal valid structure from whatever came back
        if isinstance(result, dict) and result:
            return {'center': resource.title, 'branches': [
                {'topic': k, 'subtopics': v if isinstance(v, list) else [str(v)]}
                for k, v in list(result.items())[:8]
            ]}
        return {}

    def generate_practice_questions(self, resource, difficulty: str = 'medium', count: int = 5) -> list:
        """Generate exam-style practice questions with detailed model answers."""
        context = self._get_resource_context(resource)
        prompt = (
            f"Generate exactly {count} {difficulty}-difficulty exam practice questions for '{resource.title}'.\n\n"
            f"Content:\n{context[:8000] if context else resource.title}\n\n"
            f"IMPORTANT: You MUST return exactly {count} questions. No more, no less.\n"
            "Return ONLY a raw JSON array (no markdown, no code blocks). Each object must have:\n"
            '  \"question\": the full question text,\n'
            '  \"type\": one of \"short_answer\", \"essay\", or \"analysis\",\n'
            '  \"hint\": a brief hint to guide the student,\n'
            '  \"model_answer\": a detailed 2-3 paragraph model answer.\n'
            "Start your response with [ and end with ]."
        )
        result = self._parse_json(self.chat_sync([{'role': 'user', 'content': prompt}]), [])
        # If model returned a dict instead of list, try to extract the list
        if isinstance(result, dict):
            for k, v in result.items():
                if isinstance(v, list) and len(v) > 0:
                    return v
        return result if isinstance(result, list) else []
    def grade_answer(self, question: str, user_answer: str, model_answer: str, resource_context: str = '') -> dict:
        """Grade a student's answer and provide detailed feedback."""
        context_part = f"\n\nResource content for reference:\n{resource_context[:10000]}" if resource_context else ""
        prompt = (
            f"You are an expert examiner grading a student's answer.{context_part}\n\n"
            f"Question: {question}\n\n"
            f"Model Answer: {model_answer}\n\n"
            f"Student's Answer: {user_answer}\n\n"
            "Grade this answer and respond with ONLY a JSON object:\n"
            '{"score": <0-100>, "grade": "<A/B/C/D/F>", "correct": <true/false>, '
            '"feedback": "<2-3 sentences of specific feedback>", '
            '"strengths": ["<what they got right>"], '
            '"improvements": ["<specific things to improve>"], '
            '"tip": "<one actionable study tip>"}'
        )
        result = self.chat_sync([{'role': 'user', 'content': prompt}])
        return self._parse_json(result, {
            'score': 0, 'grade': 'F', 'correct': False,
            'feedback': 'Could not grade answer. Please try again.',
            'strengths': [], 'improvements': [], 'tip': ''
        })

    def _call_vision(self, messages: list) -> str:
        """
        Vision-heavy method. Priority:
        1. Direct Google AI Studio (Try 1.5 Flash first for reliability, then 2.0)
        2. Groq (Llama-3.2-11b-vision)
        3. OPENROUTER MULTI-MODEL FALLBACK (Free Tier)
        """
        log_path = os.path.join(settings.BASE_DIR, 'vision_debug.log')
        
        # ── 1. Google Gemini (rotate both keys) ───────────────────────────────
        for g_client in self._google_clients():
            for model_attempt in ['models/gemini-2.5-flash', 'models/gemini-2.5-flash-lite', 'gemini-2.0-flash']:
                try:
                    with open(log_path, 'a') as f: f.write(f"[VISION-SIGNAL] Attempting Direct Google: {model_attempt}\n")
                    result = self._call_google_studio_vision(messages, model_name=model_attempt, client=g_client)
                    if result and "Vision analysis returned no text" not in result:
                        with open(log_path, 'a') as f: f.write(f"[VISION-SIGNAL] Success via {model_attempt}\n")
                        return result
                except Exception as e:
                    with open(log_path, 'a') as f: f.write(f"[VISION-SIGNAL] {model_attempt} Failed: {str(e)[:200]}\n")
                    continue

        # ── 2. Groq vision ────────────────────────────────────────────────────
        for groq_key in self._groq_keys():
            try:
                result = self._call_groq_vision(messages, groq_key)
                if result:
                    with open(log_path, 'a') as f: f.write(f"[VISION-SIGNAL] Success via Groq\n")
                    return result
            except Exception as e:
                import time
                if "429" in str(e):
                    time.sleep(2)
                    try:
                        r = self._call_groq_vision(messages, groq_key)
                        if r: return r
                    except: pass
                logger.warning(f'Groq vision failed: {e}')
                with open(log_path, 'a') as f: f.write(f"[VISION-SIGNAL] Groq failed: {str(e)}\n")

        # ── 3. OPENROUTER MULTI-MODEL FALLBACK (FREE TIER) ───────────────────
        vision_models = [
            'openrouter/auto',
            'google/gemini-2.0-flash-001',
            'google/gemini-pro-1.5-exp:free',
            'google/gemini-flash-1.5-8b',
            'google/gemini-flash-1.5',
            'mistralai/pixtral-12b',
            'qwen/qwen-2.5-vl-72b-instruct',
            'qwen/qwen-2-vl-7b-instruct:free',
            'openrouter/free',
        ]
        
        msgs_with_sys = messages if (messages and messages[0].get('role') == 'system') else \
            [{'role': 'system', 'content': FLOWAI_SYSTEM_PROMPT}] + messages

        import time
        for model in vision_models:
            try:
                response = self._call(msgs_with_sys, model, max_tokens=2048)
                
                if response.status_code == 200:
                    content = self._extract_content(response.json())
                    if content.strip() and "error" not in content.lower()[:50]:
                        with open(log_path, 'a') as f: f.write(f"[VISION-SIGNAL] Success via {model}\n")
                        return content
                
                with open(log_path, 'a') as f: 
                    f.write(f"[VISION-SIGNAL] {model} failed ({response.status_code})\n")
                    if response.status_code != 200:
                        f.write(f"Response body: {response.text[:200]}\n")
                
                if response.status_code == 429:
                    time.sleep(1.5)
                    continue
            except Exception as e:
                logger.warning(f'Vision model {model} error: {e}')
                with open(log_path, 'a') as f: f.write(f"[VISION-SIGNAL] Exception for {model}: {str(e)}\n")
                continue

        return "I encountered an error while trying to process this image. All available vision models are currently unresponsive. Please try again in a few minutes or check your OpenRouter API credits."

    def _call_groq_vision(self, messages: list, api_key: str) -> str:
        """
        Groq vision — llama-3.2-11b-vision-preview.
        Free: 30 RPM, 500k tokens/day. OpenAI-compatible.
        Only called from _call_vision().
        """
        import requests as req
        if not messages or messages[0].get('role') != 'system':
            msgs = [{'role': 'system', 'content': FLOWAI_SYSTEM_PROMPT}] + messages
        else:
            msgs = messages

        response = req.post(
            'https://api.groq.com/openai/v1/chat/completions',
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json={'model': 'meta-llama/llama-4-scout-17b-16e-instruct', 'messages': msgs, 'max_tokens': 2048},
            timeout=60,
        )
        if response.status_code == 200:
            try:
                content = response.json()['choices'][0]['message']['content']
                logger.info('Vision handled by Groq llama-3.2-11b-vision')
                return content or ''
            except (KeyError, IndexError):
                return ''
        else:
            logger.warning(f'Groq vision error {response.status_code}: {response.text[:200]}')
            return ''

    def _call_google_studio_vision(self, messages: list, model_name: str = 'gemini-2.0-flash', client=None) -> str:
        """Helper to call Google AI Studio directly using the NEW SDK."""
        g_client = client or self.google_client
        if not g_client:
            return ""

        user_msg = messages[-1]
        prompt_parts = []
        
        # Extract visual/text components
        if isinstance(user_msg['content'], list):
            for part in user_msg['content']:
                if part['type'] == 'text':
                    prompt_parts.append(part['text'])
                elif part['type'] == 'image_url':
                    url = part['image_url']['url']
                    if url.startswith('data:'):
                        header, base64_str = url.split(',', 1)
                        mime_type = header.split(':')[1].split(';')[0]
                        from google.genai import types
                        prompt_parts.append(types.Part.from_bytes(
                            data=base64.b64decode(base64_str),
                            mime_type=mime_type
                        ))
        else:
            prompt_parts.append(str(user_msg['content']))

        try:
            # New SDK call format
            response = g_client.models.generate_content(
                model=model_name,
                contents=prompt_parts
            )
            return response.text or ""
        except Exception as e:
            logger.error(f"Google SDK Error ({model_name}): {e}")
            raise e

    def _get_style_suffix(self, prompt: str) -> str:
        """
        Returns a specific style suffix based on prompt analysis to improve visual quality.
        """
        prompt_l = prompt.lower()
        if any(k in prompt_l for k in ['medical', 'anatomy', 'organ', 'heart', 'diagram', 'science', 'biological']):
            return "Professional medical illustration, clean scientific diagram, 4k, high resolution, white background"
        if any(k in prompt_l for k in ['app', 'ui', 'interface', 'dashboard', 'website']):
            return "Modern UI design, sleek app interface, high-end digital design, minimalist, 4k"
        if any(k in prompt_l for k in ['logo', 'icon', 'symbol', 'branding']):
            return "Professional vector logo design, minimalist, clean lines, high quality, white background"
        
        return "Professional digital art illustration, photorealistic, vibrant colors, detailed, 4k, masterpiece"

    def generate_image(self, prompt: str, model: str = 'turbo') -> str:
        """
        Generates an image from a text prompt using a resilient multi-tier fallback strategy.
        Tier 0: Google Imagen 4
        Tier 1: Pollinations AI (Generative, Free, Fast)
        Tier 2: Lexica.art (Search-based retrieval)
        Tier 3: OpenRouter (Generative, Paid)
        """
        log_path = os.path.join(settings.BASE_DIR, 'vision_debug.log')
        style = self._get_style_suffix(prompt)
        full_enhanced_prompt = f"{prompt}. {style}"

        logger.info(f"[ImageGen:Service] Starting generation | prompt_preview={prompt[:60]!r}")

        # --- TIER 0: GOOGLE IMAGEN 4 (Premium Generative) ---
        if self.google_client:
            try:
                with open(log_path, 'a', encoding='utf-8') as f:
                    f.write(f"[GEN-SIGNAL] Tier 0 (Imagen 4): Attempting for: {prompt[:50]}...\n")
                logger.info(f"[ImageGen:Service] Tier 0 (Imagen 4) attempting")

                response = self.google_client.models.generate_images(
                    model='imagen-4.0-generate-001',
                    prompt=full_enhanced_prompt,
                    config={'number_of_images': 1}
                )

                if response and hasattr(response, 'generated_images') and response.generated_images:
                    img_data = response.generated_images[0].image_bytes
                    encoded = base64.b64encode(img_data).decode('utf-8')
                    with open(log_path, 'a', encoding='utf-8') as f: f.write(f"[OK] Tier 0 Success (Imagen 4)\n")
                    logger.info(f"[ImageGen:Service] Tier 0 SUCCESS (Imagen 4)")
                    return f"data:image/png;base64,{encoded}"
            except Exception as e:
                with open(log_path, 'a', encoding='utf-8') as f: f.write(f"[FAIL] Tier 0 (Imagen 4) Failed: {str(e)}\n")
                logger.warning(f"[ImageGen:Service] Tier 0 FAILED (Imagen 4) | error={str(e)[:200]}")

        # --- TIER 1: POLLINATIONS AI (Instant Generative) ---
        models_to_try = [('flux', 45), ('turbo', 35)]
        for poll_model, poll_timeout in models_to_try:
            try:
                with open(log_path, 'a', encoding='utf-8') as f:
                    f.write(f"[GEN-SIGNAL] Tier 1 ({poll_model}): Attempting for: {prompt[:50]}...\n")
                logger.info(f"[ImageGen:Service] Tier 1 (Pollinations/{poll_model}) attempting")

                import requests

                current_prompt = prompt if poll_model == 'flux' else prompt.split(',')[0]
                encoded_prompt = requests.utils.quote(f"{current_prompt}. {style}")
                poll_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1024&height=1024&nologo=true&model={poll_model}&seed={abs(hash(prompt)) % 9999}"

                res = requests.get(poll_url, timeout=poll_timeout)
                if res.status_code == 200 and len(res.content) > 1000:
                    encoded = base64.b64encode(res.content).decode('utf-8')
                    with open(log_path, 'a', encoding='utf-8') as f: f.write(f"[OK] Tier 1 Success ({poll_model})\n")
                    logger.info(f"[ImageGen:Service] Tier 1 SUCCESS (Pollinations/{poll_model}) | size={len(res.content)}")
                    return f"data:image/jpeg;base64,{encoded}"
                else:
                    logger.warning(f"[ImageGen:Service] Tier 1 bad response (Pollinations/{poll_model}) | status={res.status_code} size={len(res.content)}")
            except Exception as e:
                with open(log_path, 'a', encoding='utf-8') as f: f.write(f"[FAIL] Tier 1 ({poll_model}) Failed: {str(e)}\n")
                logger.warning(f"[ImageGen:Service] Tier 1 FAILED (Pollinations/{poll_model}) | error={str(e)[:200]}")

        # --- TIER 2: LEXICA.ART (High Quality Search) ---
        clean_prompt = re.sub(r'[^\w\s]', '', prompt)
        words = [w for w in clean_prompt.split() if len(w) > 3]

        search_strategies = [
            "+".join(words[:6]),
            "+".join(words[:3]),
            "+".join(words[:1])
        ]

        for keywords in search_strategies:
            if not keywords: continue
            try:
                with open(log_path, 'a', encoding='utf-8') as f: f.write(f"[GEN-SIGNAL] Tier 2: Attempting Lexica ({keywords})...\n")
                logger.info(f"[ImageGen:Service] Tier 2 (Lexica) attempting | keywords={keywords!r}")
                lexica_url = f"https://lexica.art/api/v1/search?q={keywords}"

                res = requests.get(lexica_url, timeout=10)
                if res.status_code == 200:
                    images = res.json().get('images', [])
                    if images:
                        import random
                        best_match = random.choice(images[:3])
                        img_url = best_match.get('src')
                        img_res = requests.get(img_url, timeout=10)
                        if img_res.status_code == 200:
                            encoded = base64.b64encode(img_res.content).decode('utf-8')
                            with open(log_path, 'a', encoding='utf-8') as f:
                                f.write(f"[OK] Tier 2 Success (Lexica: {keywords})\n")
                            logger.info(f"[ImageGen:Service] Tier 2 SUCCESS (Lexica) | keywords={keywords!r}")
                            return f"data:image/jpeg;base64,{encoded}"
                    else:
                        logger.warning(f"[ImageGen:Service] Tier 2 Lexica returned no images | keywords={keywords!r}")
                else:
                    logger.warning(f"[ImageGen:Service] Tier 2 Lexica bad status | status={res.status_code} keywords={keywords!r}")
            except Exception as e:
                with open(log_path, 'a', encoding='utf-8') as f: f.write(f"[FAIL] Tier 2 ({keywords}) Failed: {str(e)}\n")
                logger.warning(f"[ImageGen:Service] Tier 2 FAILED (Lexica/{keywords}) | error={str(e)[:200]}")

        # --- TIER 3: POLLINATIONS FALLBACK (different models) ---
        for poll_model, poll_timeout in [('stable-diffusion', 30), ('dall-e-3', 20)]:
            try:
                logger.info(f"[ImageGen:Service] Tier 3 (Pollinations/{poll_model}) attempting")
                encoded_prompt = requests.utils.quote(f"{prompt}. {style}")
                poll_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1024&height=1024&nologo=true&model={poll_model}"
                res = requests.get(poll_url, timeout=poll_timeout)
                if res.status_code == 200 and len(res.content) > 1000:
                    encoded = base64.b64encode(res.content).decode('utf-8')
                    logger.info(f"[ImageGen:Service] Tier 3 SUCCESS (Pollinations/{poll_model})")
                    return f"data:image/jpeg;base64,{encoded}"
            except Exception as e:
                logger.warning(f"[ImageGen:Service] Tier 3 FAILED (Pollinations/{poll_model}) | error={str(e)[:200]}")
                continue

        logger.error(f"[ImageGen:Service] ALL TIERS EXHAUSTED — returning None | prompt_preview={prompt[:60]!r}")

        return ""

    def solve_assignment(self, assignment) -> dict:
        """
        Premium Synthesis Engine: Ingests multi-modal sources (Text, PDF, Images) 
        and linked resources to construct a high-fidelity academic masterpiece.
        """
        # 1. Build context from linked library resources
        resource_contexts = []
        for resource in assignment.resources.all():
            ctx = self._get_resource_context(resource)
            if ctx:
                resource_contexts.append(f"--- Library Resource: {resource.title} ---\n{ctx[:3000]}")
        library_context = '\n\n'.join(resource_contexts) if resource_contexts else ''

        # 2. Build multi-modal input from assignment sources
        # We'll use the 'image_url' message format if images are present
        content_parts = []
        
        # Add textual instructions
        instructions = f"Assignment Title: {assignment.title}\n"
        if assignment.subject: instructions += f"Subject: {assignment.subject}\n"
        instructions += f"\nCORE INSTRUCTIONS:\n{assignment.instructions}\n"
        
        if library_context:
            instructions += f"\nREFERENCE MATERIAL FROM LIBRARY:\n{library_context}\n"
            
        content_parts.append({'type': 'text', 'text': instructions})

        # Add image sources
        has_images = False
        for source in assignment.sources.filter(file_type='image'):
            try:
                with open(source.file.path, "rb") as image_file:
                    encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
                    mime_type = "image/jpeg" if source.file.name.endswith(('.jpg', '.jpeg')) else "image/png"
                    content_parts.append({
                        'type': 'image_url',
                        'image_url': {'url': f"data:{mime_type};base64,{encoded_string}"}
                    })
                    has_images = True
            except Exception as e:
                logger.warning(f"Could not load image source {source.id}: {e}")

        # 3. Strategy Selection
        # If images are present, we MUST use a vision model.
        # We'll use Gemini 2.0 Flash for its superior reasoning and high-fidelity output.
        system_prompt = (
            "You are FlowAI, a world-class academic researcher and technical writer. "
            "Your goal is to construct a high-fidelity, comprehensive assignment solution that follows a 'Zen' academic aesthetic.\n\n"
            "REQUIREMENTS:\n"
            "1. STRUCTURE: Use clear, meaningful headers (H2, H3). Include a strong introduction and a synthesis-driven conclusion.\n"
            "2. FIDELITY: Be thorough. If the instructions ask for a report, provide a professional report. If a lab analysis, be technical.\n"
            "3. MATHEMATICS: Use LaTeX ($$ for blocks, $ for inline) for ALL mathematical, chemical, or physical notations.\n"
            "4. MULTI-MODAL: If images are provided (charts, screenshots, prompts), analyze them deeply and integrate their data into your response.\n"
            "5. TONE: Maintain a professional, high-end academic tone. Use markdown for all formatting."
        )

        messages = [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': content_parts if len(content_parts) > 1 else instructions}
        ]

        logger.info(f"[Synthesis] Initializing high-fidelity engine for: {assignment.title} (Images: {has_images})")
        
        # Use Flash 2.0 for everything assignment related - it handles vision and long context perfectly
        response = self.chat_sync(messages, forced_model='google/gemini-2.0-flash-001')

        # 4. Post-Synthesis: Metadata Generation
        # Generate overview
        overview_prompt = "In 2 concise sentences, summarize the core synthesis strategy used to complete this assignment. Mention if visual data was integrated."
        overview = self.chat_sync([
            {'role': 'system', 'content': "Be extremely concise. Professional tone."},
            {'role': 'assistant', 'content': response},
            {'role': 'user', 'content': overview_prompt},
        ], forced_model='google/gemini-2.0-flash-lite-preview-02-05:free')

        # Generate structured outline for UI navigation
        outline_prompt = (
            "Extract the main sections as a JSON array for a navigation menu. "
            "Return ONLY: [{\"section\": \"Section Title\", \"summary\": \"Brief gist\"}]"
        )
        outline_raw = self.chat_sync([
            {'role': 'assistant', 'content': response},
            {'role': 'user', 'content': outline_prompt},
        ], forced_model='google/gemini-2.0-flash-lite-preview-02-05:free')
        outline = self._parse_json(outline_raw, [])

        return {
            'response': response,
            'overview': overview,
            'outline': outline,
        }

    def refine_assignment(self, assignment, prompt: str) -> dict:
        """
        Iteratively refine an assignment based on user feedback.
        Uses a structured response format to separate the draft from the commentary.
        """
        history = assignment.chat_history or []
        
        # Build the initial system context
        system_instruction = (
            f"You are FlowAI, a world-class academic researcher and technical writer.\n"
            f"You are refining the document titled '{assignment.title}'.\n\n"
            f"ORIGINAL INSTRUCTIONS: {assignment.instructions}\n"
            f"CURRENT DRAFT TO EDIT:\n{assignment.ai_response}\n\n"
            "INSTRUCTIONS: Re-read the current draft and user feedback. Rewrite the FULL document.\n"
            "STRUCTURE: Your response MUST be split into exactly two parts like this:\n"
            "---DRAFT---\n"
            "[The full, rewritten markdown document. NO conversational text here. Use headers, bolding, and academic tone.]\n"
            "---COMMENT---\n"
            "[A short (1-2 sentence) friendly explanation of the edits you made.]\n\n"
            "DO NOT FORGET THE ---DRAFT--- AND ---COMMENT--- MARKERS."
        )

        messages = [{'role': 'system', 'content': system_instruction}]
        messages.append({'role': 'user', 'content': prompt})
        
        logger.info(f"[Agent] Processing request with Hyper-Speed model: {prompt[:100]}...")
        # Use Gemini 2.0 Flash Lite for ultra-low latency conversational responses
        raw_response = self.chat_sync(
            messages, 
            forced_model='google/gemini-2.0-flash-lite-preview-02-05:free'
        )
        logger.info(f"[Agent] Raw response received ({len(raw_response)} chars)")
        
        # Parse structured response
        draft = ""
        comment = ""
        
        if "---DRAFT---" in raw_response and "---COMMENT---" in raw_response:
            parts = raw_response.split("---COMMENT---")
            draft_part = parts[0].replace("---DRAFT---", "").strip()
            comment_part = parts[1].strip()
            if draft_part: draft = draft_part
            if comment_part: comment = comment_part
        
        # Fallback logic if structure is missed
        if not draft:
            # Check if AI just returned the draft without markers
            if len(raw_response) > 500:
                draft = raw_response
                comment = "I've updated the draft for you."
            else:
                # If short, it's likely just a comment; don't overwrite the draft
                draft = assignment.ai_response
                comment = raw_response

        history.append({'role': 'user', 'content': prompt})
        history.append({'role': 'assistant', 'content': comment})

        return {
            'response': draft,
            'overview': comment,
            'chat_history': history[-20:]
        }

    def humanize_assignment(self, assignment) -> dict:
        """
        Specialized 'Vanish v2.5' protocol: High-intensity evasion.
        Uses linguistic chaos and phatic markers to achieve a 100% human signature.
        """
        prompt = (
            f"You are the FlowAI Humanizer (Vanish Protocol v3 - RADICAL). Your mission is a total linguistic reconstruction of '{assignment.title}'. "
            "Your previous attempt was flagged as 100% AI by state-of-the-art detectors. You MUST be more aggressive.\n\n"
            "RADICAL EVASION STRATEGY:\n"
            "1. DESTROY THE RHYTHM: AI uses consistent sentence lengths (~20-30 words). You MUST use 'Burstiness'. Mix extremely short sentences (3-5 words) with longer, winding ones. Never have three sentences of similar length in a row.\n"
            "2. FRAGMENTATION: Break apart dense, multi-clause constructions. Instead of 'As velocity approaches light speed, a moving clock ticks slower...', try 'Velocity climbs. Near light speed, the clock stalls. It's relative.'\n"
            "3. LINGUISTIC NOISE: Inject intentional human-like 'voice' markers. Use 'Wait...', 'Here is the thing...', 'Think about it this way...'. Avoid the 'AI transition' words (Furthermore, Moreover, In conclusion).\n"
            "4. COMPLEXITY SHIFT: If a paragraph is too 'perfect', add a human-like summary or a simplified analogy at the end.\n\n"
            f"DOCUMENT TO TRANSFORM (CURRENTLY FLAGGED AS 100% AI):\n{assignment.ai_response}\n\n"
            "INSTRUCTIONS: Perform a RADICAL rewrite. If you do not change the sentence structure entirely, you will fail. "
            "Return exactly two parts split by markers:\n"
            "---DRAFT---\n"
            "[The radically humanized markdown document]\n"
            "---COMMENT---\n"
            "[A short note about the radical 'Rhythm Destruction' applied.]"
        )
        
        raw_response = self.chat_sync([
            {'role': 'system', 'content': "You are a high-fidelity document rewriter. Return only the requested draft and comment. Do not repeat instructions."},
            {'role': 'user', 'content': prompt}
        ], forced_model='google/gemini-2.0-flash-001')
        return self._process_structured_response(assignment, raw_response, "I've applied the High-Intensity 'Vanish v2.5' protocol.")

    def remove_plagiarism(self, assignment) -> dict:
        """
        Specialized 'Originality Shield v2.5': Radical semantic flipping.
        Performs deep structural inversion to ensure absolute originality.
        """
        prompt = (
            f"You are the FlowAI Originality Master (Shield Protocol v2.5). Your mission is a RADICAL structural flip of '{assignment.title}' "
            "to guarantee 0% plagiarism while preserving 100% of the intellectual value.\n\n"
            "1. DEEP SEMANTIC FLIP: Ensure no two consecutive words match the original. Use completely unique linguistic substitutions.\n"
            "2. PERSPECTIVE SHIFT: Rewrite sections from a different logical starting point. If the original started with the 'effect', start with the 'cause'.\n"
            "3. STRUCTURAL BREAK: Completely dismantle the original paragraph order. If there were 5 sections, find a way to merge or split them into a new, superior flow.\n\n"
            f"DOCUMENT TO PROCESS:\n{assignment.ai_response}\n\n"
            "INSTRUCTIONS: Rewrite the FULL document. Re-synthesize every argument into a brand-new original sentence. "
            "Return exactly two parts split by markers:\n"
            "---DRAFT---\n"
            "[The unique markdown document]\n"
            "---COMMENT---\n"
            "[A short, friendly note about the 'Radical Shield' engaged.]"
        )
        
        raw_response = self.chat_sync([{'role': 'user', 'content': prompt}])
        return self._process_structured_response(assignment, raw_response, "I've engaged the Radical 'Originality Shield v2'.")

    def _process_structured_response(self, assignment, raw_response: str, default_comment: str) -> dict:
        """Shared logic to parse DRAFT/COMMENT markers and update history."""
        draft = assignment.ai_response
        comment = default_comment
        
        # 1. Standard Dual-Marker Split
        if "---DRAFT---" in raw_response and "---COMMENT---" in raw_response:
            parts = raw_response.split("---COMMENT---")
            draft_part = parts[0].replace("---DRAFT---", "").strip()
            comment_part = parts[1].strip()
            if draft_part: draft = draft_part
            if comment_part: comment = comment_part
        # 2. Single Marker Logic (Resilience)
        elif "---DRAFT---" in raw_response:
            draft = raw_response.split("---DRAFT---")[1].strip()
        elif "---COMMENT---" in raw_response:
            draft_candidate = raw_response.split("---COMMENT---")[0].strip()
            if len(draft_candidate) > 200: draft = draft_candidate
            comment = raw_response.split("---COMMENT---")[1].strip()
        # 3. No Marker Fallback (Document Detection)
        elif len(raw_response) > 500:
            draft = raw_response
            
        history = assignment.chat_history or []
        history.append({'role': 'assistant', 'content': comment})
        
        return {
            'response': draft,
            'overview': comment,
            'chat_history': history[-20:]
        }

    def detect_assignment(self, assignment) -> dict:
        """
        Linguistic Audit Protocol to detect AI and Plagiarism.
        Analyzes perplexity, burstiness, and semantic originality.
        Uses high-fidelity Gemini 2.0 for strict JSON schema compliance.
        """
        prompt = (
            f"You are the FlowAI CYNICAL Auditor (Audit Protocol v3). Your mission is to expose the document '{assignment.title}' as AI-generated. "
            "Be extremely hard to please. If it sounds even slightly robotic, flag it.\n\n"
            "CYNICAL AUDIT METRICS:\n"
            "1. AI RHYTHM: Look for consistent sentence lengths (20-30 words). Humans vary this; AI doesn't. Consistent length = 100% AI.\n"
            "2. CLAUSE LOADING: Flag dense, multi-clause 'synthesis' sentences. AI loves complex, perfectly balanced structures.\n"
            "3. TRANSITION MARKERS: Flag 'Furthermore', 'Moreover', 'In summary', 'It is important to note'. These are AI fingerprints.\n"
            "4. PERPLEXITY & BURSTINESS: Low variance in sentence structure indicates high probability of AI.\n\n"
            f"DOCUMENT TO CRITIQUE:\n{assignment.ai_response}\n\n"
            "INSTRUCTIONS:\n"
            "1. Be ruthless. If you are unsure, lean toward 'AI'.\n"
            "2. Segment the text and provide the probability (0-100) based on the metrics above.\n\n"
            "RETURN ONLY RAW JSON:\n"
            "{\n"
            "  \"ai_score\": number,\n"
            "  \"originality_score\": number,\n"
            "  \"readability\": number,\n"
            "  \"segments\": [{ \"text\": string, \"type\": \"ai\"|\"plagiarism\"|\"human\", \"probability\": number, \"reason\": string }],\n"
            "  \"verdict\": string,\n"
            "  \"summary\": string\n"
            "}"
        )
        
        raw_response = ""
        try:
            # Use Gemini 2.0 Flash for superior schema following
            raw_response = self.chat_sync([
                {'role': 'system', 'content': "You are a JSON-only response engine. Return only valid, minified JSON. Do not use markdown blocks."},
                {'role': 'user', 'content': prompt}
            ], forced_model='google/gemini-2.0-flash-001')

            import json
            import re
            
            # Robust JSON Extraction
            clean_json = raw_response.strip()
            # Remove markdown code blocks if AI ignored system prompt
            clean_json = re.sub(r'^```json\s*', '', clean_json, flags=re.IGNORECASE | re.MULTILINE)
            clean_json = re.sub(r'^```\s*', '', clean_json, flags=re.IGNORECASE | re.MULTILINE)
            clean_json = re.sub(r'\s*```$', '', clean_json, flags=re.MULTILINE)
            
            # Find the actual JSON object bounds
            start = clean_json.find('{')
            end = clean_json.rfind('}')
            if start != -1 and end != -1:
                clean_json = clean_json[start:end+1]
                
            return json.loads(clean_json)
        except Exception as e:
            logger.error(f"Detection Audit JSON Failure for {assignment.id}. Error: {e} | Raw preview: {raw_response[:200]}")
            return {
                'ai_score': 0, 'originality_score': 100, 'readability': 0, 
                'segments': [{'text': assignment.ai_response[:500] if assignment.ai_response else "Audit process failed.", 'type': 'human', 'probability': 0, 'reason': 'Audit engine parse error.'}],
                'verdict': 'Audit Unavailable', 
                'summary': f"The audit engine encountered a structural parsing error. (Technical Info: {str(e)[:40]})"
            }

    def solve_math_problem(self, problem: str, context: str = "") -> dict:
        """
        Specialized Math Solver using Chain-of-Thought reasoning.
        Breaks down a problem into: Formula -> Steps -> Intuition -> Solution.
        """
        # Hardcore math instructions for the Matrix solver
        system = (
            f"{FLOWAI_SYSTEM_PROMPT}\n\n"
            "You are the FlowAI Math Master. Your goal is to solve mathematical problems using first principles. "
            "IMPORTANT RULES:\n"
            "1. Use LaTeX for ALL mathematical symbols. Formulas MUST be wrapped in $ (inline) or $$ (block).\n"
            "2. Explain the logical 'Intuition' behind every calculation.\n"
            "3. If the input is a partial formula or snippet from study notes, deduce its purpose and explain how it is used.\n"
            "4. Return ONLY a valid JSON object. No conversational filler."
        )
        
        prompt = (
            f"Problem to solve: \"{problem}\"\n\n"
        )
        if context:
            prompt += f"Background context from study material:\n{context[:10000]}\n\n"
            
        prompt += (
            "Provide a step-by-step logical breakdown in this JSON format:\n"
            "{\n"
            "  \"problem\": \"The mathematical statement\",\n"
            "  \"steps\": [\n"
            "    {\"label\": \"Step Name\", \"formula\": \"LaTeX snippet\", \"explanation\": \"Logical transition intuition\"}\n"
            "  ],\n"
            "  \"final_answer\": \"Simplified solution\",\n"
            "  \"key_theorems\": [\"Theorem|Rule Name\"]\n"
            "}"
        )
        
        # Use a high-reasoning model for the solver
        try:
            result = self.chat_sync([{'role': 'system', 'content': AIService.MATH_SYSTEM_PROMPT if hasattr(AIService, 'MATH_SYSTEM_PROMPT') else system}, {'role': 'user', 'content': prompt}])
            return self._parse_json(result, {
                "problem": "Mathematical Analysis",
                "steps": [],
                "final_answer": "Processing complete.",
                "key_theorems": []
            })
        except Exception as e:
            logger.error(f"Math solver failure: {e}")
            return {"feedback": "Processing error."}


    def _parse_json(self, text: str, default):
        """Robust JSON parser: finds best JSON block, handles truncation including mid-string cuts."""
        if not text:
            return default
        import re as _re, json as _json
        try:
            # Strip markdown fences (backtick blocks) — handle leading spaces too
            t = text.strip()
            t = _re.sub(r'\s*`{3}(?:json)?\s*', '', t)
            t = _re.sub(r'\s*`{3}\s*', '', t)
            t = t.strip()

            # Collect ALL complete JSON objects via brace-matching
            candidates = []
            for m in _re.finditer(r'\{', t):
                start = m.start()
                depth = 0
                in_str = False
                escape = False
                for i, c in enumerate(t[start:]):
                    if escape:
                        escape = False
                        continue
                    if c == '\\':
                        escape = True
                        continue
                    if c == '"' and not escape:
                        in_str = not in_str
                    if not in_str:
                        if c == '{':
                            depth += 1
                        elif c == '}':
                            depth -= 1
                            if depth == 0:
                                candidates.append(t[start:start + i + 1])
                                break

            # Also collect arrays
            for m in _re.finditer(r'\[', t):
                start = m.start()
                depth = 0
                in_str = False
                escape = False
                for i, c in enumerate(t[start:]):
                    if escape:
                        escape = False
                        continue
                    if c == '\\':
                        escape = True
                        continue
                    if c == '"' and not escape:
                        in_str = not in_str
                    if not in_str:
                        if c == '[':
                            depth += 1
                        elif c == ']':
                            depth -= 1
                            if depth == 0:
                                candidates.append(t[start:start + i + 1])
                                break

            # If no complete block found, use the whole text as a truncated candidate
            if not candidates:
                candidates = [t]

            # Prefer candidates that contain kit-level keys
            kit_keys = ['"sections"', '"overview"', '"vocabulary"', '"exam_tips"']
            kit_candidates = [c for c in candidates if any(k in c for k in kit_keys)]
            best = max(kit_candidates, key=len) if kit_candidates else max(candidates, key=len)

            # Try direct parse first
            try:
                return _json.loads(best)
            except Exception:
                pass

            # ── Truncation repair ────────────────────────────────────────────
            # Strategy: scan char-by-char tracking string/brace state,
            # then close whatever is open.
            def repair_truncated(s):
                """Close any open strings, arrays, and objects."""
                in_str = False
                escape_next = False
                depth_brace = 0
                depth_bracket = 0
                result = []
                for ch in s:
                    result.append(ch)
                    if escape_next:
                        escape_next = False
                        continue
                    if ch == '\\':
                        escape_next = True
                        continue
                    if ch == '"':
                        in_str = not in_str
                        continue
                    if not in_str:
                        if ch == '{':
                            depth_brace += 1
                        elif ch == '}':
                            depth_brace -= 1
                        elif ch == '[':
                            depth_bracket += 1
                        elif ch == ']':
                            depth_bracket -= 1
                # Close open string first
                if in_str:
                    result.append('"')
                # Remove trailing comma before closing
                joined = ''.join(result).rstrip()
                if joined.endswith(','):
                    joined = joined[:-1]
                # Close open brackets then braces
                joined += ']' * max(0, depth_bracket)
                joined += '}' * max(0, depth_brace)
                return joined

            try:
                fixed = repair_truncated(best)
                return _json.loads(fixed)
            except Exception:
                pass

            # Also try repairing the full raw text (in case best was a bad candidate)
            try:
                fixed2 = repair_truncated(t)
                parsed = _json.loads(fixed2)
                if isinstance(parsed, dict) and any(k in parsed for k in ['sections', 'overview']):
                    return parsed
            except Exception:
                pass

            # ast fallback
            try:
                import ast
                return ast.literal_eval(best)
            except Exception:
                pass

            return default
        except Exception:
            return default

