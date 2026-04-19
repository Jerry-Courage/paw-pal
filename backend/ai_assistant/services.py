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

# HUGGINGFACE CONFIGURATION
# We prefer local files, but allow download if missing to prevent silent failures
os.environ['TRANSFORMERS_OFFLINE'] = '0' 
os.environ['HF_HUB_OFFLINE'] = '0'

logger = logging.getLogger('flowstate')

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
    'google/gemma-3-27b-it:free',
    'google/gemma-3-12b-it:free',
    'google/gemma-3-4b-it:free',
    'google/gemma-3-1b-it:free',
    'google/gemini-2.5-flash-lite:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'nvidia/llama-3.1-nemotron-70b-instruct:free',
]

FLOWAI_SYSTEM_PROMPT = """You are FlowAI, the funny, cool, and absolutely awesome AI study partner built into FlowState.

Your identity:
- Name: FlowAI (the "Third Member" of the study squad)
- Personality: Witty, high-energy, collegiate, and brilliantly supportive. You are the genius friend who makes studying feel like a hangout.
- Purpose: Help students crush their academic goals while keeping the vibe upbeat and fun.

CONVERSATIONAL GUIDELINES (CRITICAL FOR VOICE & VIBE):
- BE AWESOME: Use a cool, expressive, and natural tone. Match the student's energy.
- WITTY BANTER: Use clever academic humor or witty observations when appropriate. Stay lighthearted but focused on the win.
- PEER-TO-PEER: Speak like a brilliant upper-classman or a study squad leader. Use phrases like "Wait, check this out," "Let's crush this," or "Awesome!"
- CONCISE & SNAPPY: Keep spoken responses short. Don't speak in monologues.
- STRICT NO EMOJIS: Never use emojis (👋, ✨, etc.). The voice engine can't say them.
- NO ROBOT SPEECH: Avoid "I will now summarize..." Just say "Here's the lowdown..." or "Check out these key hits..."

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
            'HTTP-Referer': 'https://flowstate.app',
            'X-Title': 'FlowState',
        }
        # Initialize Google GenAI for Vision tasks
        self.google_key = getattr(settings, 'GOOGLE_STUDIO_API_KEY', '')
        if self.google_key:
            self.google_client = genai.Client(api_key=self.google_key)
        else:
            self.google_client = None
        
        # Singleton Embedding Model to prevent lag
        self._emb = None

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
        """Hyper-Resilient 3-Stage non-streaming Chat: Google -> Groq -> OpenRouter."""
        if not self.api_key: return "API Key missing."
        
        messages = self._sanitize_messages(messages)
        target_model = forced_model or target_model or self.model
        
        # Detect if this is a Multi-Modal request
        has_images = False
        for msg in messages:
            if isinstance(msg.get('content'), list):
                if any(p.get('type') == 'image_url' for p in msg['content']):
                    has_images = True
                    break
        
        if self.google_client:
            # Immortal 2026 Fleet Stack: 27B -> 12B -> 4B -> 1B (Total 57.6k RPD)
            for g_model in [
                'models/gemma-3-27b-it', 
                'models/gemma-3-12b-it', 
                'models/gemma-3-4b-it', 
                'models/gemma-3-1b-it',
                'models/gemini-2.5-flash-lite', 
                'models/gemini-2.5-flash'
            ]:
                try:
                    contents, sys_instr = self._to_gemini_format(messages)
                    
                    # Gemma 3 Fix: Developer instructions must be in the prompt history
                    if 'gemma' in g_model.lower():
                        if sys_instr:
                            if contents and contents[0].get('role') == 'user':
                                contents[0]['parts'][0]['text'] = f"SYSTEM INSTRUCTIONS:\n{sys_instr}\n\nUSER MESSAGE:\n{contents[0]['parts'][0]['text']}"
                        config = {'max_output_tokens': max_tokens}
                    else:
                        config = {'system_instruction': sys_instr, 'max_output_tokens': max_tokens}

                    # Using Async Client to prevent event-loop deadlocks
                    response = await self.google_client.aio.models.generate_content(
                        model=g_model,
                        contents=contents,
                        config=config
                    )
                    if response.text:
                        return response.text
                except Exception as e:
                    logger.warning(f"[Google SDK Chat Fallback] {g_model} failed: {e}")

        # --- STAGE 1: HYPER-FAST GROQ (Text-Only or Direct Vision) ---
        groq_key = os.getenv('GROQ_API_KEY')
        if groq_key:
            try:
                # If images are present, we MUST use a vision-capable model
                groq_model = 'llama-3.2-11b-vision-preview' if has_images else 'llama-3.3-70b-versatile'
                async with httpx.AsyncClient() as client:
                    url = "https://api.groq.com/openai/v1/chat/completions"
                    resp = await client.post(
                        url,
                        headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                        json={'model': groq_model, 'messages': messages, 'max_tokens': max_tokens},
                        timeout=12 if has_images else 8,
                    )
                    if resp.status_code == 200:
                        return self._extract_content(resp.json())
            except Exception as e:
                logger.error(f"[Groq Chat Error] {e}")

        # --- STAGE 2: OPENROUTER FREE TIER CYCLE (The Safety Net) ---
        models_to_try = [target_model] + [m for m in FALLBACK_MODELS if m != target_model]
        for i, model in enumerate(models_to_try):
            if i >= max_fallbacks: break
            
            # Skip text-only models in fallback loop if we have images
            is_vision_model = 'vision' in model.lower() or 'gemini' in model.lower() or 'claude' in model.lower() or 'gpt-4o' in model.lower()
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
                        if content.strip() and "error" not in content.lower()[:50]: 
                            return content
            except:
                continue

        logger.error(f"[AI Final Failure]: No engines responded. Check API keys and network. Trace: {errors}")
        return f"Intelligence Signal Interrupted. All engines failed. Primary Snack: {errors[0] if errors else 'Unknown Error'}"

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
        groq_key = os.getenv('GROQ_API_KEY')
        if not groq_key: return "Groq Key missing."
        target_model = 'llama-3.3-70b-versatile'
        
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
        groq_key = os.getenv('GROQ_API_KEY')
        
        # 1. OPTION A: GROQ WHISPER (Sub-second)
        if groq_key:
            try:
                url = "https://api.groq.com/openai/v1/audio/transcriptions"
                # Handle both file paths and file-like objects (Django UploadedFile)
                if isinstance(audio_file, str):
                    with open(audio_file, 'rb') as f:
                        files = {'file': (os.path.basename(audio_file), f)}
                        response = req.post(url, headers={"Authorization": f"Bearer {groq_key}"}, files=files, data={'model': 'whisper-large-v3'}, timeout=15)
                else:
                    audio_file.seek(0)
                    files = {'file': (audio_file.name, audio_file)}
                    response = req.post(url, headers={"Authorization": f"Bearer {groq_key}"}, files=files, data={'model': 'whisper-large-v3'}, timeout=15)
                
                if response.status_code == 200:
                    return response.json().get('text', '')
            except Exception as e:
                logger.warning(f"[Groq STT Error] {e}")

        # 2. OPTION B: GOOGLE GEMINI 2.5 SDK (Speech-to-Text Fallback)
        if self.google_client:
            try:
                # Read audio content
                if isinstance(audio_file, str):
                    with open(audio_file, 'rb') as f: audio_data = f.read()
                    mime = 'audio/mpeg' if audio_file.endswith('.mp3') else 'audio/wav'
                else:
                    audio_file.seek(0); audio_data = audio_file.read()
                    mime = audio_file.content_type if hasattr(audio_file, 'content_type') else 'audio/mpeg'

                response = self.google_client.models.generate_content(
                    model='models/gemini-3.1-flash-tts-preview',
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
            # --- STAGE 0: DIRECT GOOGLE GENAI SDK (2026 Verified Models) ---
            if self.google_client:
                # Immortal 2026 Fleet Stack: Total 57,600 RPD
                for g_model in [
                    'models/gemma-3-27b-it',
                    'models/gemma-3-12b-it',
                    'models/gemma-3-4b-it',
                    'models/gemma-3-1b-it',
                    'models/gemini-2.5-flash-lite',
                    'models/gemini-2.5-flash',
                    'models/gemini-1.5-flash'
                ]:
                    try:
                        contents, sys_instr = self._to_gemini_format(messages)
                        
                        # Gemma 3 Fix: Developer instructions must be in the prompt history
                        if 'gemma' in g_model.lower():
                            if sys_instr:
                                # Prepend instruction to the first message if it is a user role
                                if contents and contents[0].get('role') == 'user':
                                    contents[0]['parts'][0]['text'] = f"SYSTEM INSTRUCTIONS:\n{sys_instr}\n\nUSER MESSAGE:\n{contents[0]['parts'][0]['text']}"
                            config = {'max_output_tokens': 4096}
                        else:
                            config = {'system_instruction': sys_instr, 'max_output_tokens': 4096}

                        response = await self.google_client.aio.models.generate_content_stream(
                            model=g_model,
                            contents=contents,
                            config=config
                        )
                        async for chunk in response:
                            text = ""
                            try:
                                if hasattr(chunk, 'text') and chunk.text:
                                    text = chunk.text
                                elif hasattr(chunk, 'candidates') and chunk.candidates:
                                    text = chunk.candidates[0].content.parts[0].text
                            except: pass
                            
                            if text:
                                yield text
                        return # SUCCESS
                    except Exception as e:
                        logger.warning(f"[Google SDK Fallback] {g_model} failed: {e}")
                        if "429" in str(e):
                            await asyncio.sleep(1)

            # --- STAGE 1: HYPER-FAST GROQ STREAMING ---
            groq_key = os.getenv('GROQ_API_KEY')
            if groq_key:
                try:
                    async with httpx.AsyncClient() as client:
                        async with client.stream(
                            "POST",
                            "https://api.groq.com/openai/v1/chat/completions",
                            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                            json={'model': 'llama-3.3-70b-versatile', 'messages': messages, 'stream': True, 'max_tokens': 4096},
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
                                            
                                            # 1. Skip explicit reasoning fields (Groq/OpenRouter)
                                            if delta.get('reasoning'):
                                                continue
                                                
                                            text = delta.get('content', '')
                                            if not text: continue

                                            # 2. State-aware <think> tag filtering
                                            if '<think>' in text:
                                                in_think_block = True
                                                parts = text.split('<think>')
                                                text = parts[0] # Keep text BEFORE the tag if any
                                                # If there is text AFTER the tag, it's handled by the in_think_block check next
                                            
                                            if in_think_block:
                                                if '</think>' in text:
                                                    in_think_block = False
                                                    parts = text.split('</think>')
                                                    text = parts[-1] # Keep text AFTER the tag
                                                else:
                                                    continue # Skip all tokens inside think block
                                            
                                            if text: yield text
                                        except: continue
                                return
                            else:
                                logger.warning(f"[Groq Stream] Status {response.status_code}. Falling back to OpenRouter...")
                                if response.status_code == 429:
                                    await asyncio.sleep(1)
                except Exception as e:
                    logger.error(f"[Groq Stream Error] {e}")

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

    def perform_global_search(self, query: str, user, limit: int = 7) -> str:
        """
        Search across the user's entire library for the most relevant context.
        Returns a formatted context string including source attribution.
        """
        if not query:
            return ""
            
        try:
            try:
                from langchain_text_splitters import RecursiveCharacterTextSplitter
            except ImportError:
                from langchain_text_splitters import RecursiveCharacterTextSplitter
            from langchain_huggingface import HuggingFaceEmbeddings
            from library.models import DocumentChunk
            from django.db import models
            from pgvector.django import L2Distance
            
            logger.info(f"[Global RAG] Searching across entire library for: {query[:50]}...")
            
            global _EMB_MODEL
            if _EMB_MODEL is None:
                logger.info("[RAG] Initializing Offline Embedding Model...")
                # We force local_files_only to prevent the 49s network hang
                _EMB_MODEL = HuggingFaceEmbeddings(
                    model_name="all-MiniLM-L6-v2",
                    model_kwargs={'device': 'cpu', 'local_files_only': True}
                )
            
            query_vector = _EMB_MODEL.embed_query(query)
            
            # Retrieve the top N closest fragments from ANY document owned by the user
            top_chunks = DocumentChunk.objects.filter(
                resource__owner=user
            ).annotate(
                distance=L2Distance('embedding', query_vector)
            ).order_by('distance').select_related('resource')[:limit]
            
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
                
                global _EMB_MODEL
                if _EMB_MODEL is None:
                    from langchain_huggingface import HuggingFaceEmbeddings
                    logger.info("[RAG] Initializing Global Embedding Singleton...")
                    _EMB_MODEL = HuggingFaceEmbeddings(
                        model_name="all-MiniLM-L6-v2",
                        model_kwargs={'device': 'cpu', 'local_files_only': True}
                    )
                self._emb_model = _EMB_MODEL
                
                query_vector = self._emb_model.embed_query(query)
                
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
            f"{content[:20000]}\n\n"
            'Return ONLY a RAW JSON array of objects with exactly these keys: "question", "answer", "difficulty" (easy/medium/hard). '
            f"{latex_rule} No markdown formatting, just the raw array."
        )
        
        # Force the ultra-fast 2.0 Flash Lite model for instant feedback
        # Set a aggressive 25s timeout so it doesn't hang the UI if the API is down
        raw_response = self.chat_sync(
            [{'role': 'user', 'content': prompt}], 
            forced_model='google/gemini-2.0-flash-lite-001',
            timeout=25,
            max_fallbacks=2
        )
        return self._parse_json(raw_response, [])

    def generate_quiz(self, resource, fmt: str, level: str, count: int) -> list:
        context = self._get_resource_context(resource)
        fmt_map = {
            'mcq': 'multiple choice with "options": ["option1", "option2", "option3", "option4"] and "correct_answer" (one of the strings in options)',
            'flashcard': 'Q&A pairs with "question" and "answer"',
            'short': 'short answer with "question" and "expected_answer"',
            'mixed': 'mix of MCQ and short answer',
        }
        content_part = f"\n\nBased on:\n{context[:15000]}" if context else ""
        prompt = (
            f"Generate {count} {fmt_map.get(fmt, 'questions')} for '{resource.title}' at {level} level{content_part}. "
            "Return ONLY a JSON array. Use LaTeX ($$ for blocks, $ for inline) for all math/chemistry."
        )
        return self._parse_json(self.chat_sync([{'role': 'user', 'content': prompt}]), [])

    def generate_study_nudge(self, user, recent_topics: list) -> str:
        topics = ', '.join(recent_topics) if recent_topics else 'various subjects'
        prompt = (
            f"You are FlowAI. Student {user.first_name or user.username} has been studying: {topics}. "
            "Give a short encouraging study nudge (2-3 sentences). Be warm and motivating."
        )
        return self.chat_sync([{'role': 'user', 'content': prompt}])

    def group_chat_assist(self, group_name: str, context: str, question: str) -> str:
        system = (
            f"{FLOWAI_SYSTEM_PROMPT}\n\n"
            f"CURRENT CONTEXT: You are the 'Third Member' AI for the study group '{group_name}'. "
            "You join their sessions, monitor discussions, and proactively help the group learn together."
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
            text = f"TOPIC: {resource.title}\nSUBJECT: {resource.subject or 'General'}\n\nSTRICT REQUIREMENT: Provide a deep, FOUNDATIONAL study kit based on your expert academic knowledge of this topic. Do not return empty sections. Generate at least 5 detailed modules."
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
        # Modern models (Gemini 2.5) have massive context windows. 
        # Using 20k chunks reduces the number of AI calls 5x, vastly improving speed/stability.
        chunk_size = 20000
        overlap = 1000
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
                f"You are the Studley-Style FlowAI Academic Architect [SYTH-V3.1-PREMIUM]. "
                f"DEEP ANALYSIS REQUESTED FOR: '{resource.title}'.\n\n"
                "GOAL: Create a hyper-premium academic study kit with MASTER-LEVEL readability.\n"
                "CRITICAL TYPOGRAPHY RULES:\n"
                "1. MICRO-PARAGRAPHING: Limit every paragraph to a maximum of 3-4 sentences. NEVER return a wall of text.\n"
                "2. SEMANTIC BOLDING: **Bold** high-impact keywords and concepts the first time they appear.\n"
                "3. BULLET POINTS: Use bullet points religiousy for any lists or complex breakdowns.\n"
                "4. ACADEMIC DEPTH: Provide a MINIMUM of 6 detailed 'sections'. Use your internal knowledge to expand if source is short.\n\n"
                "STRICT JSON OUTPUT FORMAT:\n"
                "{\n"
                "  \"overview\": {\"title\": \"Title\", \"icon\": \"Emoji\", \"summary\": \"Deep 3-paragraph summary\"},\n"
                "  \"sections\": [\n"
                "    {\"icon\": \"Emoji\", \"title\": \"Module Title\", \"content\": \"300+ words of structured content with Cues and Key Questions...\", \"page_refs\": [], \"mermaid_diagram\": \"graph TD;...\"}\n"
                "  ],\n"
                "  \"vocabulary\": [{\"term\": \"...\", \"definition\": \"...\"}],\n"
                "  \"exam_tips\": [\"...\", \"...\"]\n"
                "}\n"
                "\nSTRICT CONTENT RULES:\n"
                "- EVERY section 'content' MUST start with a bolded **Key Question/Cue**.\n"
                "- USE LATEX for all math/physics formulas.\n"
                f"{image_hint if idx == 0 else ''}\n"
                f"{math_hint}\n\n"
                f"SOURCE MATERIAL:\n{chunk_text}\n\n"
                "Return ONLY valid JSON. START WITH '{' AND END WITH '}'."
            )
            prompts.append(prompt)

        total_chunks = len(prompts)
        logger.info(f'[AI Service] Entering Quad-Burst Parallel Engine for {total_chunks} chunks...')
        
        # ─── DUAL-BURST STABLE ENGINE ───
        # We use 2 workers for Macro-chunks to stay well under rate limits while maintaining high throughput.
        try:
            with ThreadPoolExecutor(max_workers=2) as executor:
                # First chunk gets the Visual Evidence for better context
                futures = {}
                for idx, p in enumerate(prompts):
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
                        possible_keys = ['sections', 'Sections', 'modules', 'Modules', 'study_modules', 'StudyModules']
                        s_key = next((k for k in possible_keys if k in chunk_kit and isinstance(chunk_kit[k], list)), None)
                        
                        if s_key:
                            for sec in chunk_kit[s_key]:
                                if isinstance(sec, dict) and sec.get('title'):
                                    sections_added += 1
                                    all_sections.append(sec)
                        else:
                            # CRITICAL DEBUG: If total sections are still 0, log what the AI actually said
                            logger.warning(f"[AI Service] Chunk {idx+1} yielded 0 sections. Key Mismatch? Raw sample: {str(res_content)[:300]}")
                        
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
            'sections': all_sections[:150],
            'vocabulary': all_vocabulary[:200],
            'exam_tips': list(dict.fromkeys(all_tips))[:50],
        }
        
        return self._attach_images_to_sections(kit, page_image_map)

    def _attach_images_to_sections(self, kit: dict, page_image_map: dict) -> dict:
        """Unified engine to match extracted diagrams to their relevant sections."""
        if not page_image_map:
            return kit

        used_image_urls = set()
        for sec in kit.get('sections', []):
            refs = sec.pop('page_refs', []) or []
            sec_images = []
            for page_num in refs:
                images_on_page = page_image_map.get(page_num, [])
                if isinstance(images_on_page, str):  # Legacy compatibility
                    images_on_page = [{'url': images_on_page, 'description': f'Figure — Page {page_num}'}]
                
                for img in images_on_page:
                    if img['url'] not in used_image_urls:
                        sec_images.append({
                            'url': img['url'],
                            'caption': img['description'],
                            'page': page_num,
                        })
                        used_image_urls.add(img['url'])
            
            if sec_images:
                sec['images'] = sec_images
                sec.pop('mermaid_diagram', None)
            else:
                mermaid = (sec.get('mermaid_diagram') or '').strip()
                if not mermaid:
                    sec.pop('mermaid_diagram', None)
        
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
            
        future = watchdog.submit(self.chat_sync, [{'role': 'user', 'content': user_content}], max_tokens=8192)
        try:
            # 300s timeout for Deep Academic Synthesis
            res = future.result(timeout=300)
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
                    f"You are the 'Studley-Style FlowState Ultra' {persona}. Analyze these {target_desc} from '{resource.title}'. "
                    f"GOAL: Create a deep, high-fidelity academic study kit using the Studley pedagogy based ON THESE VISUALS. "
                    "1. OCR all text, labels, and diagrams. Break it into 'Extraction-Ready' modules.\n"
                    "2. Return ONLY a JSON object:\n"
                    "- 'sections': [{\"icon\": emoji, \"title\": str, \"content\": str, \"page_refs\": [int]}]\n"
                    "  STUDLEY CONTENT RULES: \n"
                    "  a) Start each section 'content' with a bolded Key Question/Cue (e.g., **Key Cue: [Question]?**).\n"
                    "  b) Use #### for sub-headers. Use 'Atomic Fact' bullets for the body. No prose summaries.\n"
                    "  c) End each section 'content' with: \\n\\n> **--- ACTIVE RECALL CHECK ---**\\n> [Test question].\n"
                    "  d) TABLES: For comparisons, use GFM Grid Table syntax. Surround with \\n\\n.\n"
                    "  e) TYPOGRAPHY: Use Sentence Case. NEVER use ALL CAPS for long descriptions. \n"
                    "  f) NO LEAKAGE: Strictly forbid internal action tags like ACTION: { ... } from the final output.\n"
                    "  g) Use standard LaTeX ($) for all formulas. content MUST be a single string.\n"
                    "- 'vocabulary': [{\"term\": str, \"definition\": str}]\n"
                    "- 'exam_tips': [str]\n"
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
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(process_vision_bundle, i, b) for i, b in enumerate(bundles)]
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

        kit = {
            "overview": {
                "title": f"[Vision Mode] {resource.title}",
                "icon": "🔳",
                "summary": f"Visual analysis complete. We successfully scanned and solved the content from your image-only textbook."
            },
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
            f"Content:\n{context[:15000] if context else resource.title}\n\n"
            "Return ONLY a JSON object:\n"
            '{"center": "Main Topic", "branches": [{"topic": "Branch 1", "subtopics": ["sub1", "sub2"]}, ...]}\n'
            "Include 5-8 main branches with 3-5 subtopics each. Use emojis in topics. No extra text."
        )
        return self._parse_json(self.chat_sync([{'role': 'user', 'content': prompt}]), {})

    def generate_practice_questions(self, resource, difficulty: str = 'medium', count: int = 5) -> list:
        """Generate exam-style practice questions with detailed model answers."""
        context = self._get_resource_context(resource)
        prompt = (
            f"Generate {count} {difficulty}-difficulty exam practice questions for '{resource.title}'.\n\n"
            f"Content:\n{context[:15000] if context else resource.title}\n\n"
            "Return ONLY a JSON array of objects:\n"
            '[{"question": "...", "type": "short_answer|essay|analysis", "hint": "...", "model_answer": "..."}]\n'
            "Ensure the model_answer is detailed (2-3 paragraphs). Use LaTeX ($$ for blocks, $ for inline) for all math/chemistry. No extra text."
        )
        return self._parse_json(self.chat_sync([{'role': 'user', 'content': prompt}]), [])

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
        
        # ── 1. Google Gemini (Dedicated Key) ──────────────────────────────────
        if self.google_key:
            # Try 1.5 versions first for balance of reliability and performance
            for model_attempt in ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash-8b']:
                try:
                    with open(log_path, 'a') as f: f.write(f"[VISION-SIGNAL] Attempting Direct Google: {model_attempt}\n")
                    result = self._call_google_studio_vision(messages, model_name=model_attempt)
                    if result and "Vision analysis returned no text" not in result:
                        with open(log_path, 'a') as f:
                            f.write(f"[VISION-SIGNAL] Success via Direct Google Studio ({model_attempt})\n")
                        return result
                except Exception as e:
                    with open(log_path, 'a') as f:
                        f.write(f"[VISION-SIGNAL] Direct Google Studio ({model_attempt}) Failed: {str(e)[:200]}\n")
                    continue

            # Then try 2.0 (often has lower free quotas)
            try:
                model_attempt = 'gemini-2.0-flash'
                with open(log_path, 'a') as f: f.write(f"[VISION-SIGNAL] Attempting Direct Google: {model_attempt}\n")
                result = self._call_google_studio_vision(messages, model_name=model_attempt)
                if result:
                    return result
            except Exception as e:
                with open(log_path, 'a') as f:
                    f.write(f"[VISION-SIGNAL] Direct Google Studio (2.0) Failed: {str(e)[:200]}\n")

        # ── 2. Groq vision ────────────────────────────────────────────────────
        groq_key = os.environ.get('GROQ_API_KEY', '').strip()
        if groq_key:
            try:
                result = self._call_groq_vision(messages, groq_key)
                if result:
                    with open(log_path, 'a') as f: f.write(f"[VISION-SIGNAL] Success via Groq Llama-3.2\n")
                    return result
            except Exception as e:
                import time
                if "429" in str(e):
                    time.sleep(2)
                    try: return self._call_groq_vision(messages, groq_key)
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

    def _call_google_studio_vision(self, messages: list, model_name: str = 'gemini-2.0-flash') -> str:
        """Helper to call Google AI Studio directly using the NEW SDK."""
        if not self.google_client:
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
            response = self.google_client.models.generate_content(
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
        Tier 1: Pollinations AI (Generative, Free, Fast)
        Tier 2: Lexica.art (Search-based retrieval)
        Tier 3: OpenRouter (Generative, Paid)
        """
        log_path = os.path.join(settings.BASE_DIR, 'vision_debug.log')
        style = self._get_style_suffix(prompt)
        full_enhanced_prompt = f"{prompt}. {style}"

        # --- TIER 0: GOOGLE IMAGEN 4 (Premium Generative - reserved/scared) ---
        if self.google_client:
            try:
                with open(log_path, 'a', encoding='utf-8') as f: 
                    f.write(f"[GEN-SIGNAL] Tier 0 (Imagen 4): Attempting for: {prompt[:50]}...\n")
                
                # In 2026, Imagen 4 is accessed via generate_images (plural)
                response = self.google_client.models.generate_images(
                    model=model,
                    prompt=full_enhanced_prompt,
                    config={'number_of_images': 1}
                )
                
                if response and hasattr(response, 'generated_images') and response.generated_images:
                    import base64
                    img_data = response.generated_images[0].image_bytes
                    encoded = base64.b64encode(img_data).decode('utf-8')
                    with open(log_path, 'a', encoding='utf-8') as f: f.write(f"[OK] Tier 0 Success (Imagen 4)\n")
                    return f"data:image/png;base64,{encoded}"
            except Exception as e:
                with open(log_path, 'a', encoding='utf-8') as f: f.write(f"[FAIL] Tier 0 (Imagen 4) Failed: {str(e)}\n")

        # --- TIER 1: POLLINATIONS AI (Instant Generative) ---
        models_to_try = [('flux', 25), ('turbo', 15)]
        for poll_model, poll_timeout in models_to_try:
            try:
                with open(log_path, 'a', encoding='utf-8') as f: 
                    f.write(f"[GEN-SIGNAL] Tier 1 ({poll_model}): Attempting for: {prompt[:50]}...\n")
                
                import requests
                import base64
                
                # If it's a retry, use a simpler prompt
                current_prompt = prompt if poll_model == 'flux' else prompt.split(',')[0]
                encoded_prompt = requests.utils.quote(f"{current_prompt}. {style}")
                poll_url = f"https://image.pollinations.ai/prompt/{encoded_prompt}?width=1024&height=1024&nologo=true&model={poll_model}"
                
                res = requests.get(poll_url, timeout=poll_timeout)
                if res.status_code == 200 and len(res.content) > 1000: # Ensure we didn't just get a tiny error image
                    encoded = base64.b64encode(res.content).decode('utf-8')
                    with open(log_path, 'a', encoding='utf-8') as f: f.write(f"[OK] Tier 1 Success ({poll_model})\n")
                    return f"data:image/jpeg;base64,{encoded}"
            except Exception as e:
                with open(log_path, 'a', encoding='utf-8') as f: f.write(f"[FAIL] Tier 1 ({poll_model}) Failed: {str(e)}\n")

        # --- TIER 2: LEXICA.ART (High Quality Search) ---
        # Try specific search first, then broad search
        clean_prompt = re.sub(r'[^\w\s]', '', prompt)
        words = [w for w in clean_prompt.split() if len(w) > 3]
        
        search_strategies = [
            "+".join(words[:6]), # Specific
            "+".join(words[:3]), # Broad
            "+".join(words[:1])  # Ultra-broad
        ]

        for keywords in search_strategies:
            if not keywords: continue
            try:
                with open(log_path, 'a', encoding='utf-8') as f: f.write(f"[GEN-SIGNAL] Tier 2: Attempting Lexica ({keywords})...\n")
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
                            return f"data:image/jpeg;base64,{encoded}"
            except Exception as e:
                with open(log_path, 'a', encoding='utf-8') as f: f.write(f"[FAIL] Tier 2 ({keywords}) Failed: {str(e)}\n")

        # --- TIER 3: OPENROUTER (Generative, Paid) ---
        # Already highly capable but often out of credits in this environment
        models_to_try = [model, 'openrouter/auto']
        for current_model in models_to_try:
            try:
                payload = {
                    "model": current_model,
                    "messages": [{"role": "user", "content": [{"type": "text", "text": full_enhanced_prompt}]}],
                    "modalities": ["image"]
                }
                response = requests.post(f"{self.base_url}/chat/completions", headers=self.headers, json=payload, timeout=45)

                if response.status_code == 200:
                    data = response.json()
                    images = data.get('choices', [{}])[0].get('message', {}).get('images', [])
                    if images and images[0].get('type') == 'image_url':
                        with open(log_path, 'a', encoding='utf-8') as f: f.write(f"[OK] Tier 3 Success ({current_model})\n")
                        return images[0]['image_url']['url']
            except Exception as e:
                continue

        return ""

    def solve_assignment(self, assignment) -> dict:
        """
        Use AI + linked resources to solve/complete an assignment.
        Returns structured dict with response, overview, and outline.
        """
        # Build context from linked resources
        resource_contexts = []
        for resource in assignment.resources.all():
            ctx = self._get_resource_context(resource)
            if ctx:
                resource_contexts.append(f"--- Resource: {resource.title} ---\n{ctx[:2000]}")

        context_block = '\n\n'.join(resource_contexts) if resource_contexts else ''

        prompt = (
            f"You are FlowAI helping a student complete an assignment.\n\n"
            f"Assignment Title: {assignment.title}\n"
            f"Subject: {assignment.subject or 'General'}\n\n"
            f"Instructions/Question:\n{assignment.instructions}\n\n"
        )
        if context_block:
            prompt += f"Use these study resources as reference:\n\n{context_block}\n\n"

        prompt += (
            "Provide a complete, well-structured assignment response. "
            "Format your response as proper academic work with:\n"
            "- Clear introduction\n"
            "- Well-organized body sections with headings\n"
            "- Supporting evidence/examples from the resources if available\n"
            "- Conclusion\n\n"
            "Use markdown formatting. Use LaTeX ($$ for blocks, $ for inline) for all math/chemistry. Be thorough and academic in tone."
        )

        response = self.chat_sync([{'role': 'user', 'content': prompt}])

        # Generate overview
        overview_prompt = (
            f"In 2-3 sentences, summarize what you just did to complete this assignment: '{assignment.title}'. "
            "Mention which resources were used and the key approach taken. Be concise."
        )
        overview = self.chat_sync([
            {'role': 'user', 'content': prompt},
            {'role': 'assistant', 'content': response},
            {'role': 'user', 'content': overview_prompt},
        ])

        # Generate structured outline
        outline_prompt = (
            "Extract the main sections of the assignment response as a JSON array. "
            "Return ONLY: [{\"section\": \"Section Title\", \"summary\": \"One sentence summary\"}]"
        )
        outline_raw = self.chat_sync([
            {'role': 'user', 'content': prompt},
            {'role': 'assistant', 'content': response},
            {'role': 'user', 'content': outline_prompt},
        ])
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
        Specialized 'Vanish v2' protocol: High-intensity evasion.
        Uses linguistic chaos and phatic markers to achieve a 100% human signature.
        """
        prompt = (
            f"You are the FlowAI Humanizer (Vanish Protocol v2). Your mission is to perform a high-intensity rewrite of '{assignment.title}' "
            "to achieve a 100% human linguistic signature and bypass all state-of-the-art auditors.\n\n"
            "AGRESSIVE STRATEGY:\n"
            "1. LINGUISTIC CHAOS: Radically vary sentence length. Mix 30-word complex explanations with 3-word punchy conclusions.\n"
            "2. PHATIC MARKERS: Use human-exclusive 'voice' connectors such as 'Essentially...', 'Interestingly enough...', 'The thing is...', 'Actually...', 'Looking back at it...'.\n"
            "3. STYLISTIC INFLECTIONS: Occasionally use natural stylistics that AI avoids, such as starting a sentence with 'And' or 'But', or using a dash for emphasis—like this.\n"
            "4. SEMANTIC VARIANCE: Avoid predictable transitions. If you've used a list, transform it into a flowing narrative.\n\n"
            f"DOCUMENT TO HUMANIZE:\n{assignment.ai_response}\n\n"
            "INSTRUCTIONS: Rewrite the FULL document. Ensure everything sounds authentic, organic, and nuanced. "
            "Return exactly two parts split by markers:\n"
            "---DRAFT---\n"
            "[The humanized markdown document]\n"
            "---COMMENT---\n"
            "[A short, friendly note about the high-intensity 'Vanish' protocol applied.]"
        )
        
        raw_response = self.chat([{'role': 'user', 'content': prompt}])
        return self._process_structured_response(assignment, raw_response, "I've applied the High-Intensity 'Vanish v2' protocol.")

    def remove_plagiarism(self, assignment) -> dict:
        """
        Specialized 'Originality Shield v2': Radical semantic flipping.
        Performs deep structural inversion to ensure absolute originality.
        """
        prompt = (
            f"You are the FlowAI Originality Master (Shield Protocol v2). Your mission is a RADICAL structural flip of '{assignment.title}' "
            "to guarantee 0% plagiarism while preserving 100% of the intellectual value.\n\n"
            "AGRESSIVE STRATEGY:\n"
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
        
        if "---DRAFT---" in raw_response and "---COMMENT---" in raw_response:
            parts = raw_response.split("---COMMENT---")
            draft_part = parts[0].replace("---DRAFT---", "").strip()
            comment_part = parts[1].strip()
            if draft_part: draft = draft_part
            if comment_part: comment = comment_part
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
        """
        prompt = (
            f"You are the FlowAI Intelligence Auditor. Your mission is to perform a deep-fidelity audit of the document "
            f"'{assignment.title}' to detect AI generation markers and structural plagiarism.\n\n"
            "AUDIT PROXIES:\n"
            "1. AI PROBABILITY: Based on perplexity (predictability) and burstiness (sentence variance).\n"
            "2. ORIGINALITY: Based on semantic uniqueness and common academic structural patterns.\n\n"
            f"DOCUMENT TO AUDIT:\n{assignment.ai_response}\n\n"
            "INSTRUCTIONS:\n"
            "1. Segment the text into meaningful blocks.\n"
            "2. Assign a probability (0-100) and type ('ai', 'plagiarism', or 'human') to each segment.\n"
            "3. Provide overall scores (0-100) for AI and Originality.\n"
            "4. Provide a final 'Verdict' and a brief 'Mission Summary'.\n\n"
            "RETURN ONLY RAW JSON in this format:\n"
            "{\n"
            "  'ai_score': number,\n"
            "  'originality_score': number,\n"
            "  'readability': number,\n"
            "  'segments': [{ 'text': string, 'type': 'ai'|'plagiarism'|'human', 'probability': number, 'reason': string }],\n"
            "  'verdict': string,\n"
            "  'summary': string\n"
            "}"
        )
        
        try:
            raw_response = self.chat_sync([{'role': 'system', 'content': "Return only valid JSON. No markdown backticks."}, {'role': 'user', 'content': prompt}])
            import json
            import re
            
            # Use regex to find the JSON block even if conversational filler is present
            match = re.search(r'(\{.*\})', raw_response, re.DOTALL)
            if match:
                clean_json = match.group(1)
            else:
                clean_json = raw_response.strip().replace('```json', '').replace('```', '')
                
            return json.loads(clean_json)
        except Exception as e:
            logger.error(f"Detection Audit JSON Failure for {assignment.id}. Raw response: {raw_response[:500]}... Error: {e}")
            return {
                'ai_score': 0, 'originality_score': 100, 'readability': 0, 
                'segments': [{'text': assignment.ai_response[:500] if assignment.ai_response else "No text found.", 'type': 'human', 'probability': 0, 'reason': 'Audit failed.'}],
                'verdict': 'Audit Unavailable', 'summary': f"The synthesis engine could not parse the audit protocol. (Error: {str(e)[:50]})"
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
        """Greedy & Truncation-Aware JSON Parser: Extracts and repairs valid JSON from AI responses."""
        if not text: return default
        try:
            text = text.strip()
            import re
            
            # Phase 1: Identifying the outermost JSON enclosure
            start_indices = [text.find('{'), text.find('[')]
            start_index = min([i for i in start_indices if i != -1] or [0])
            
            end_indices = [text.rfind('}'), text.rfind(']')]
            end_index = max([i for i in end_indices if i != -1] or [len(text)])
            
            content = text[start_index : end_index + 1].strip()
            if not content: return default

            # Phase 2: Sanitize - Repair common 'un-safe' artifacts
            def cleanse_json_string(match):
                s = match.group(0)
                return s.replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t')
            
            # Escape actual newlines inside quotes
            processed_content = re.sub(r'":\s*"([\s\S]*?)"(?=\s*[,}])', cleanse_json_string, content)

            try:
                return json.loads(processed_content)
            except Exception as e:
                # Phase 3: Truncation Recovery - Force-close cut-off JSON
                if "Expecting" in str(e) or "Unterminated" in str(e) or "EOF" in str(e):
                    try:
                        temp_content = processed_content.strip()
                        
                        # Fix Unterminated String Shield
                        # If the last character isn't a closure but we are inside a string
                        if temp_content.count('"') % 2 != 0:
                            # We are inside an unclosed string. Close it.
                            temp_content += '"'
                        
                        # Count braces/brackets
                        open_braces = temp_content.count('{') - temp_content.count('}')
                        open_brackets = temp_content.count('[') - temp_content.count(']')
                        
                        if open_braces > 0 or open_brackets > 0:
                            repair = temp_content
                            if temp_content.endswith(','): repair = repair[:-1]
                            repair += '}' * open_braces
                            repair += ']' * open_brackets
                            try:
                                return json.loads(repair)
                            except: pass
                    except: pass
                
                # Fallback to the original extracted block or emergency eval
                try:
                    return json.loads(content)
                except:
                    try:
                        import ast
                        return ast.literal_eval(content)
                    except:
                        # Final resort: Clean markdown artifacts and find the largest JSON block
                        try:
                            cleaned = re.sub(r'```(?:json|mermaid)?', '', content).strip()
                            json_blocks = re.findall(r'\{[\s\S]*\}', cleaned)
                            if json_blocks:
                                candidate = max(json_blocks, key=len)
                                try: return json.loads(candidate)
                                except: pass
                            return default
                        except:
                            return default
        except Exception:
            return default
