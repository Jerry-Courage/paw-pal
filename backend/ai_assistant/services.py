import os
import json
import requests
import logging
from concurrent.futures import ThreadPoolExecutor
from django.conf import settings

logger = logging.getLogger('flowstate')

FALLBACK_MODELS = [
    'openrouter/free',
    'deepseek/deepseek-v3:free',
    'deepseek/deepseek-chat:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemini-2.0-flash-001:free',
    'google/gemma-3-27b-it:free',
    'qwen/qwen-2.5-72b-instruct:free',
    'mistralai/pixtral-12b:free',
]

FLOWAI_SYSTEM_PROMPT = """You are FlowAI, the intelligent AI study assistant built into FlowState — an AI-powered study platform for students.

Your identity:
- Name: FlowAI (also called the "Third Member" of any study group)
- Built by: FlowState
- Purpose: Help students learn smarter, not harder

Your capabilities:
- Explain complex concepts clearly at any academic level
- Generate flashcards, quizzes, and summaries from study materials
- Help students prepare for exams with targeted practice questions
- Analyze uploaded PDFs, YouTube transcripts, and code files
- Support collaborative group study sessions
- Provide personalized study nudges and learning insights
- Solve math, science, coding, and humanities problems
- Cite sources and suggest further reading when relevant

Your personality:
- Warm, encouraging, and patient — never condescending
- Concise but thorough — get to the point, then elaborate if needed
- Use markdown formatting (bold, bullet points, code blocks) for clarity
- Celebrate student progress and effort
- If you don't know something, say so honestly

Rules:
- Always stay focused on educational topics
- Never write harmful, unethical, or off-topic content
- If asked who made you, say you are FlowAI by FlowState
- Format code with proper syntax highlighting
- Keep responses focused and actionable"""


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

    def _call(self, messages: list, model: str, max_tokens: int = 8192, timeout: int = 120):
        return requests.post(
            f'{self.base_url}/chat/completions',
            headers=self.headers,
            json={'model': model, 'messages': messages, 'max_tokens': max_tokens},
            timeout=timeout,
        )

    def _extract_content(self, data: dict) -> str:
        msg = data['choices'][0]['message']
        content = msg.get('content') or msg.get('reasoning') or ''
        if not content:
            details = msg.get('reasoning_details', [])
            content = ' '.join(d.get('text', '') for d in details if d.get('text'))
        return content or ''

    def chat(self, messages: list, stream: bool = False, max_tokens: int = 8192) -> str:
        """Primary chat bridge: OpenRouter (Primary) -> Fallbacks -> Groq (Absolute Last Resort)."""
        log_path = os.path.join(settings.BASE_DIR, 'podcast_debug.log')
        
        # 1. PRIMARY: Try the user-configured model first
        try:
            response = self._call(messages, self.model, max_tokens=max_tokens)
            if response.status_code == 200:
                content = self._extract_content(response.json())
                # OpenRouter sometimes returns error messages inside a 200 response
                if content.strip() and "error" not in content.lower()[:50]: 
                    return content
            
            with open(log_path, 'a') as f: f.write(f"[SIGNAL] OpenRouter Primary ({self.model}) status: {response.status_code}\n")
        except Exception as e:
            with open(log_path, 'a') as f: f.write(f"[SIGNAL] OpenRouter Primary Error: {str(e)}\n")

        # 2. FALLBACK LOOP: Sequential retry through all stable FREE models
        # (This ensures success even if the primary key is zero-balance for some models)
        for model in FALLBACK_MODELS:
            if model == self.model: continue # Already tried
            try:
                # Shorter timeout for fallbacks to avoid long hangs
                response = self._call(messages, model, max_tokens=max_tokens, timeout=30)
                if response.status_code == 200:
                    content = self._extract_content(response.json())
                    if content.strip() and "error" not in content.lower()[:50]: 
                        with open(log_path, 'a') as f: f.write(f"[SIGNAL] Success via fallback model: {model}\n")
                        return content
                
                with open(log_path, 'a') as f: f.write(f"[SIGNAL] OpenRouter {model} status: {response.status_code}\n")
            except Exception as e:
                with open(log_path, 'a') as f: f.write(f"[SIGNAL] OpenRouter Error ({model}): {str(e)}\n")
                continue

        return "I'm having trouble connecting to the AI. Please try again in a moment."

    def fast_chat(self, messages: list) -> str:
        """High-speed chat bridge for near-instant interruptions (OpenRouter Free Tier)."""
        log_path = os.path.join(settings.BASE_DIR, 'podcast_debug.log')
        if not self.api_key: return "API Key missing."
        
        # Priority: Stable & Fast Free Models
        models = [
            'meta-llama/llama-3.3-70b-instruct:free',
            'xiaomi/mimo-v2-flash:free',
            'google/gemma-3-4b-it:free'
        ]
        
        for target_model in models:
            try:
                with open(log_path, 'a') as f: f.write(f"[FREE-SIGNAL] Trying {target_model}...\n")
                
                url = "https://openrouter.ai/api/v1/chat/completions"
                response = requests.post(
                    url,
                    headers=self.headers,
                    json={'model': target_model, 'messages': messages, 'max_tokens': 1024},
                    timeout=10,
                )
                
                if response.status_code == 200:
                    content = self._extract_content(response.json())
                    with open(log_path, 'a') as f: f.write(f"[FREE-SIGNAL] Success: {target_model}\n")
                    return content
            except:
                continue
        
        return self.chat(messages)

    def _call_vision(self, messages: list, max_tokens: int = 4096) -> str:
        """Specialized call for Vision-capable models."""
        # Use a reliable free vision model
        vision_model = "google/gemini-2.0-flash-001:free"
        try:
            response = self._call(messages, vision_model, max_tokens=max_tokens)
            if response.status_code == 200:
                return self._extract_content(response.json())
        except Exception as e:
            logger.error(f"Vision AI Call failed: {e}")
        return ""

    def groq_chat(self, messages: list, max_tokens: int = 1024) -> str:
        """Sub-second chat bridge using Groq directly for interruptions."""
        log_path = os.path.join(settings.BASE_DIR, 'podcast_debug.log')
        groq_key = os.getenv('GROQ_API_KEY')
        if not groq_key: 
            return "Groq Key missing."
            
        target_model = 'llama-3.3-70b-versatile'
        
        try:
            with open(log_path, 'a') as f: f.write(f"[GROQ-GURU] Requesting {target_model}...\n")
            
            url = "https://api.groq.com/openai/v1/chat/completions"
            response = requests.post(
                url,
                headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                json={'model': target_model, 'messages': messages, 'max_tokens': max_tokens},
                timeout=8,
            )
            
            if response.status_code == 200:
                content = self._extract_content(response.json())
                with open(log_path, 'a') as f: f.write(f"[GROQ-GURU] Success: {content[:50]}...\n")
                return content
            else:
                with open(log_path, 'a') as f: f.write(f"[GROQ-GURU] Failed ({response.status_code}): {response.text[:200]}\n")
        except Exception as e:
            with open(log_path, 'a') as f: f.write(f"[GROQ-GURU] Signal Error: {str(e)}\n")
        
        return ""

    def chat_stream(self, messages: list):
        if not self.api_key:
            yield "⚠️ OpenRouter API key not configured."
            return

        if not messages or messages[0].get('role') != 'system':
            messages = [{'role': 'system', 'content': FLOWAI_SYSTEM_PROMPT}] + messages

        models_to_try = [self.model] + [m for m in FALLBACK_MODELS if m != self.model]

        for model in models_to_try:
            try:
                response = requests.post(
                    f'{self.base_url}/chat/completions',
                    headers=self.headers,
                    json={'model': model, 'messages': messages, 'stream': True, 'max_tokens': 8192},
                    stream=True,
                    timeout=120,
                )
                if response.status_code in (429, 402, 404):
                    continue
                response.raise_for_status()
                for line in response.iter_lines():
                    if line:
                        line = line.decode('utf-8')
                        if line.startswith('data: '):
                            data = line[6:]
                            if data == '[DONE]':
                                return
                            try:
                                chunk = json.loads(data)
                                delta = chunk['choices'][0]['delta']
                                text = delta.get('content') or delta.get('reasoning') or ''
                                if text:
                                    yield text
                            except json.JSONDecodeError:
                                continue
                return
            except Exception as e:
                logger.error(f'Streaming error with {model}: {e}')
                continue

        yield "Streaming unavailable. Please try again."

    def _get_resource_context(self, resource) -> str:
        """Build the richest context possible for this resource."""
        parts = []

        # 1. Raw extracted text (primary source)
        if resource.ai_concepts:
            for concept in resource.ai_concepts:
                text = concept.get('extracted_text', '') or concept.get('transcript', '')
                if text:
                    parts.append(f'--- Document Text ---\n{text[:25000]}')
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
        return self.chat(messages)

    def summarize_resource(self, resource) -> str:
        context = self._get_resource_context(resource)
        if context:
            prompt = f"Summarize '{resource.title}' with structured key points and important takeaways:\n\n{context}"
        else:
            prompt = f"Create a study guide for '{resource.title}' (subject: {resource.subject or 'general'})."
        return self.chat([{'role': 'user', 'content': prompt}])

    def generate_flashcards(self, resource, count: int = 10, level: str = 'undergrad', context: str = '') -> list:
        content = context or self._get_resource_context(resource)
        base = f"for '{resource.title}' at {level} level"
        if content:
            prompt = f"Generate {count} flashcards {base} based on:\n\n{content[:15000]}\n\nReturn ONLY a JSON array: [{{\"question\": ..., \"answer\": ..., \"difficulty\": \"easy|medium|hard\"}}]"
        else:
            prompt = f"Generate {count} flashcards {base}. Return ONLY a JSON array: [{{\"question\": ..., \"answer\": ..., \"difficulty\": \"easy|medium|hard\"}}]"
        return self._parse_json(self.chat([{'role': 'user', 'content': prompt}]), [])

    def generate_quiz(self, resource, fmt: str, level: str, count: int) -> list:
        context = self._get_resource_context(resource)
        fmt_map = {
            'mcq': 'multiple choice with "options": ["option1", "option2", "option3", "option4"] and "correct_answer" (one of the strings in options)',
            'flashcard': 'Q&A pairs with "question" and "answer"',
            'short': 'short answer with "question" and "expected_answer"',
            'mixed': 'mix of MCQ and short answer',
        }
        content_part = f"\n\nBased on:\n{context[:15000]}" if context else ""
        prompt = f"Generate {count} {fmt_map.get(fmt, 'questions')} for '{resource.title}' at {level} level{content_part}. Return ONLY a JSON array."
        return self._parse_json(self.chat([{'role': 'user', 'content': prompt}]), [])

    def generate_study_nudge(self, user, recent_topics: list) -> str:
        topics = ', '.join(recent_topics) if recent_topics else 'various subjects'
        prompt = (
            f"You are FlowAI. Student {user.first_name or user.username} has been studying: {topics}. "
            "Give a short encouraging study nudge (2-3 sentences). Be warm and motivating."
        )
        return self.chat([{'role': 'user', 'content': prompt}])

    def group_chat_assist(self, group_name: str, context: str, question: str) -> str:
        system = (
            f"{FLOWAI_SYSTEM_PROMPT}\n\n"
            f"CURRENT CONTEXT: You are the 'Third Member' AI for the study group '{group_name}'. "
            "You join their sessions, monitor discussions, and proactively help the group learn together."
        )
        if context:
            system += f"\n\nCurrent discussion context: {context}"
        return self.chat([{'role': 'system', 'content': system}, {'role': 'user', 'content': question}])

    def generate_chapter_summaries(self, transcript: str, title: str) -> list:
        """Generate timestamped chapter summaries from a YouTube transcript."""
        prompt = (
            f"Analyze this YouTube video transcript for '{title}' and break it into logical chapters/sections.\n\n"
            f"Transcript:\n{transcript[:30000]}\n\n"
            "Return ONLY a JSON array of chapters:\n"
            '[{"chapter": 1, "title": "Chapter Title", "summary": "2-3 sentence summary", "key_points": ["point1", "point2"], "start_time_estimate": "0:00"}]\n'
            "Estimate timestamps based on content position. No extra text."
        )
        return self._parse_json(self.chat([{'role': 'user', 'content': prompt}]), [])

    def explain_text(self, text: str, context: str = '') -> str:
        """Explain a highlighted piece of text in simple terms."""
        system = f"{FLOWAI_SYSTEM_PROMPT}\n\nCONTEXT: {context}" if context else FLOWAI_SYSTEM_PROMPT
        prompt = (
            f"Explain this text clearly and concisely for a student:\n\n\"{text}\"\n\n"
            "Give: 1) Simple explanation, 2) Why it matters, 3) A real-world example if relevant. "
            "Keep it under 150 words. Use markdown."
        )
        return self.chat([{'role': 'system', 'content': system}, {'role': 'user', 'content': prompt}])

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
        return self._parse_json(self.chat([{'role': 'user', 'content': prompt}]), [])

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
                        'image_url': {'url': f'data:{mime};base64,{b64}', 'detail': 'high'}
                    }
                ]
            }]
            result = self._call_vision(messages)
            return result.strip() if result else f'[Diagram on page {page_number} — description unavailable]'
        except Exception as e:
            logger.warning(f'Image description failed for page {page_number}: {e}')
            return f'[Diagram on page {page_number}]'

    def generate_study_kit(self, resource, context: str = '', page_image_map: dict = None, vision_data: list = None) -> dict:
        """
        Generate a comprehensive FlowAI study kit JSON.
        Supports text-based analysis and Vision-based OCR for scanned PDFs.
        """
        text = context or self._get_resource_context(resource)
        
        # 1. VISION FALLBACK: If no text is found, we scan the page images directly
        if not text.strip() and vision_data:
            logger.info("Scanned PDF detected. Activating Vision OCR mode...")
            return self._generate_vision_study_kit(resource, vision_data)

        if not text.strip():
            return self._generate_basic_kit(resource)

        # Detect if the material is math-intensive
        is_math_intensive = any(kw in text.lower() for kw in ['integral', 'derivative', 'equation', 'formula', 'theorem', 'calculus', 'algebra', 'geometry'])
        
        # Tell AI which pages have images so it can return page_refs
        image_hint = ''
        if page_image_map:
            pages_with_images = sorted(page_image_map.keys())
            image_hint = (
                f'\n\nIMAGES AVAILABLE on pages: {pages_with_images}. '
                'For each section include a "page_refs" array of the page numbers it covers.'
            )

        math_hint = ""
        if is_math_intensive:
            math_hint = (
                "\n\nDETECTION: This content is Mathematics-Intensive. "
                "USE ```math ... ``` code blocks for all major formulas (at least 3 per section). "
                "Break down complex equations into logical 'Derivation Steps' with 'Variable Intuition'."
            )

        # Chunking (15k chars, 1k overlap)
        chunk_size = 15000
        overlap = 1000
        chunks = [text[i:i + chunk_size] for i in range(0, len(text), chunk_size - overlap)]

        all_sections = []
        all_vocabulary = []
        all_tips = []
        overview = {}

        # Parallel Chunk Processing (Speed: 10x)
        def process_chunk(idx, chunk_text):
            prompt = (
                f"You are creating a FlowAI Study Kit. Analyze PART {idx+1} of '{resource.title}'."
                f"{image_hint if idx == 0 else ''}{math_hint}\n\n"
                f"Content:\n{chunk_text}\n\n"
                "Return ONLY a JSON object:\n"
                "- 'overview': {\"title\": str, \"icon\": emoji, \"summary\": str}\n"
                "- 'sections': [{\"icon\": emoji, \"title\": str, \"content\": str, \"page_refs\": [int], \"mermaid_diagram\": str}]\n"
                f"  content RULES: Use **bold** for key terms. For formulas and derivations, strictly use ```math \\LaTeX ``` blocks. "
                "  EVERY complex calculation (more than 5 chars) MUST be in its own ```math ``` block. "
                "  STRIKT: content MUST be a single string. NEVER put a list or object inside 'content'.\n"
                "- 'vocabulary': [{\"term\": str, \"definition\": str}]\n"
                "- 'exam_tips': [str]\n"
            )
            try:
                res_content = self.chat([{'role': 'user', 'content': prompt}])
                return idx, self._parse_json(res_content, {})
            except Exception as e:
                logger.error(f"Chunk {idx} failed: {e}")
                return idx, {}

        max_chunks = 30
        active_chunks = chunks[:max_chunks]
        
        # Parallelize the AI calls
        results = []
        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = [executor.submit(process_chunk, i, c) for i, c in enumerate(active_chunks)]
            for future in futures:
                results.append(future.result())

        # Sort results by index to maintain document order
        results.sort(key=lambda x: x[0])

        for idx, result in results:
            if not result: continue
            
            # Use the overview from the first chunk as the primary one
            if idx == 0 and not overview:
                overview = result.get('overview', {})
            
            # Merge sections
            if 'sections' in result and isinstance(result['sections'], list):
                for sec in result['sections']:
                    if isinstance(sec, dict) and sec.get('title'):
                        content = sec.get('content', '')
                        if not isinstance(content, str):
                            sec['content'] = str(content)
                        all_sections.append(sec)
            
            # Merge vocabulary
            if 'vocabulary' in result and isinstance(result['vocabulary'], list):
                for v in result['vocabulary']:
                    if isinstance(v, dict) and v.get('term') and v.get('definition'):
                        all_vocabulary.append(v)
            
            # Merge tips
            if 'exam_tips' in result and isinstance(result['exam_tips'], list):
                for tip in result['exam_tips']:
                    if tip and isinstance(tip, str) and tip.strip():
                        all_tips.append(tip.strip())

        # ── Attach real images by page matching ──────────────────────────────
        used_pages: set = set()
        for sec in all_sections:
            refs = sec.pop('page_refs', []) or []
            sec_images = []
            for page_num in (refs if page_image_map else []):
                if page_num in page_image_map and page_num not in used_pages:
                    sec_images.append({
                        'url': page_image_map[page_num],
                        'caption': f'Figure — Page {page_num}',
                        'page': page_num,
                    })
                    used_pages.add(page_num)
            if sec_images:
                sec['images'] = sec_images
                sec.pop('mermaid_diagram', None)  # Real image takes priority
            else:
                # Keep Mermaid diagram as visual fallback
                mermaid = (sec.get('mermaid_diagram') or '').strip()
                if not mermaid:
                    sec.pop('mermaid_diagram', None)

        if not overview:
            overview = {
                'title': resource.title,
                'icon': '\U0001f393',
                'summary': f'Comprehensive AI study kit for {resource.title}.',
            }

        return {
            'overview': overview,
            'sections': all_sections[:50],
            'vocabulary': all_vocabulary[:60],
            'exam_tips': list(dict.fromkeys(all_tips))[:20],
        }

    def _generate_vision_study_kit(self, resource, vision_data: list) -> dict:
        """
        Specialized pipeline for scanned (image-only) PDFs.
        Uses Vision AI to OCR and analyze content in parallel.
        """
        import base64
        
        # Limit to first 20 pages for speed/token reasons in free tier
        pages = vision_data[:20]
        
        # Bundle pages into groups of 2 for context
        bundles = []
        for i in range(0, len(pages), 2):
            bundles.append(pages[i:i+2])

        def process_vision_bundle(idx, bundle):
            imgs_content = []
            page_nums = [p['page'] for p in bundle]
            
            for p in bundle:
                b64 = base64.b64encode(p['data']).decode('utf-8')
                imgs_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "low"}
                })
            
            text_prompt = {
                "type": "text",
                "text": (
                    f"Analyze these SCANNED pages ({', '.join(map(str, page_nums))}) from '{resource.title}'. "
                    "This is a high-speed Study Kit scan. Extract the text and mathematical formulas. "
                    "Return ONLY a JSON object:\n"
                    "- 'sections': [{\"icon\": emoji, \"title\": str, \"content\": str, \"page_refs\": [int]}]\n"
                    "  content RULES: Use ```math \\LaTeX ``` blocks for ALL formulas. Break down steps. "
                    "  STRIKT: content MUST be a string. NEVER a list or object.\n"
                    "- 'vocabulary': [{\"term\": str, \"definition\": str}]\n"
                    "- 'exam_tips': [str]\n"
                )
            }
            
            messages = [{"role": "user", "content": [text_prompt] + imgs_content}]
            try:
                res = self._call_vision(messages)
                return idx, self._parse_json(res, {})
            except Exception as e:
                logger.error(f"Vision bundle {idx} failed: {e}")
                return idx, {}

        results = []
        with ThreadPoolExecutor(max_workers=4) as executor:
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

        return {
            "overview": {
                "title": f"[Vision Mode] {resource.title}",
                "icon": "🔳",
                "summary": f"Visual analysis complete. We successfully scanned and solved the content from your image-only textbook."
            },
            "sections": all_sections,
            "vocabulary": all_vocabulary,
            "exam_tips": all_tips
        }


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
        return self._parse_json(self.chat([{'role': 'user', 'content': prompt}]), {})

    def generate_practice_questions(self, resource, difficulty: str = 'medium', count: int = 5) -> list:
        """Generate exam-style practice questions with detailed model answers."""
        context = self._get_resource_context(resource)
        prompt = (
            f"Generate {count} {difficulty}-difficulty exam practice questions for '{resource.title}'.\n\n"
            f"Content:\n{context[:15000] if context else resource.title}\n\n"
            "Return ONLY a JSON array of objects:\n"
            '[{"question": "...", "type": "short_answer|essay|analysis", "hint": "...", "model_answer": "..."}]\n'
            "Ensure the model_answer is detailed (2-3 paragraphs). No extra text."
        )
        return self._parse_json(self.chat([{'role': 'user', 'content': prompt}]), [])

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
        result = self.chat([{'role': 'user', 'content': prompt}])
        return self._parse_json(result, {
            'score': 0, 'grade': 'F', 'correct': False,
            'feedback': 'Could not grade answer. Please try again.',
            'strengths': [], 'improvements': [], 'tip': ''
        })

    def _call_vision(self, messages: list) -> str:
        """
        Vision-only method. Priority:
        1. OpenRouter Free Vision (High Reliability)
        2. Google Gemini 2.0 Flash (Free Tier)
        3. Groq (Llama-3.2-11b-vision)
        4. Text-only graceful fallback
        """
        # ── 1. Groq vision ────────────────────────────────────────────────────
        groq_key = os.environ.get('GROQ_API_KEY', '').strip()
        if groq_key:
            try:
                result = self._call_groq_vision(messages, groq_key)
                if result:
                    return result
            except Exception as e:
                logger.warning(f'Groq vision failed: {e}')

        # ── 2. Google Gemini fallback ─────────────────────────────────────────
        google_key = os.environ.get('GOOGLE_AI_KEY', '').strip()
        if google_key:
            try:
                result = self._call_google_vision(messages, google_key)
                if result:
                    return result
            except Exception as e:
                logger.warning(f'Google vision failed: {e}')

        # ── 1. OpenRouter free vision models ─────────────────────────────────
        vision_models = [
            'nvidia/nemotron-nano-12b-v2-vl:free',
            'qwen/qwen-2-vl-7b-instruct:free',
            'mistralai/pixtral-12b:free',
        ]
        msgs_with_sys = messages if (messages and messages[0].get('role') == 'system') else \
            [{'role': 'system', 'content': FLOWAI_SYSTEM_PROMPT}] + messages

        for model in vision_models:
            try:
                response = self._call(msgs_with_sys, model, max_tokens=2048)
                if response.status_code == 200:
                    content = self._extract_content(response.json())
                    if content.strip():
                        logger.info(f'Vision model used: {model}')
                        return content
            except Exception as e:
                logger.warning(f'Vision model {model} failed: {e}')
                continue

        # ── 4. Graceful text-only fallback ────────────────────────────────────
        text_only = []
        for msg in messages:
            if isinstance(msg.get('content'), list):
                text_parts = [p['text'] for p in msg['content'] if p.get('type') == 'text']
                text_only.append({
                    'role': msg['role'],
                    'content': ' '.join(text_parts) + (
                        '\n\n[Note: Image analysis is temporarily unavailable. '
                        'Please try again in a moment.]'
                    )
                })
            else:
                text_only.append(msg)
        return self.chat(text_only)

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
            json={'model': 'llama-3.2-11b-vision-preview', 'messages': msgs, 'max_tokens': 2048},
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

    def _call_google_vision(self, messages: list, api_key: str) -> str:
        """
        Google Gemini 2.0 Flash vision fallback.
        Only called from _call_vision().
        """
        import requests as req
        user_msg = next((m for m in reversed(messages) if m['role'] == 'user'), None)
        if not user_msg:
            return ''

        parts = []
        if isinstance(user_msg['content'], list):
            for part in user_msg['content']:
                if part['type'] == 'text':
                    parts.append({'text': part['text']})
                elif part['type'] == 'image_url':
                    url = part['image_url']['url']
                    if url.startswith('data:'):
                        header, data = url.split(',', 1)
                        mime = header.split(':')[1].split(';')[0]
                        parts.append({'inline_data': {'mime_type': mime, 'data': data}})
        else:
            parts.append({'text': str(user_msg['content'])})

        parts.insert(0, {'text': FLOWAI_SYSTEM_PROMPT + '\n\n'})
        payload = {
            'contents': [{'role': 'user', 'parts': parts}],
            'generationConfig': {'maxOutputTokens': 2048, 'temperature': 0.7},
        }
        response = req.post(
            f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}',
            json=payload, timeout=60,
        )
        if response.status_code == 200:
            try:
                return response.json()['candidates'][0]['content']['parts'][0]['text']
            except (KeyError, IndexError):
                return ''
        else:
            logger.warning(f'Google Gemini vision error {response.status_code}: {response.text[:200]}')
            return ''

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
            "Use markdown formatting. Be thorough and academic in tone."
        )

        response = self.chat([{'role': 'user', 'content': prompt}])

        # Generate overview
        overview_prompt = (
            f"In 2-3 sentences, summarize what you just did to complete this assignment: '{assignment.title}'. "
            "Mention which resources were used and the key approach taken. Be concise."
        )
        overview = self.chat([
            {'role': 'user', 'content': prompt},
            {'role': 'assistant', 'content': response},
            {'role': 'user', 'content': overview_prompt},
        ])

        # Generate structured outline
        outline_prompt = (
            "Extract the main sections of the assignment response as a JSON array. "
            "Return ONLY: [{\"section\": \"Section Title\", \"summary\": \"One sentence summary\"}]"
        )
        outline_raw = self.chat([
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
            result = self.chat([{'role': 'system', 'content': system}, {'role': 'user', 'content': prompt}], model='google/gemini-2.0-flash-001')
        except Exception:
            result = self.chat([{'role': 'system', 'content': system}, {'role': 'user', 'content': prompt}])

        return self._parse_json(result, {
            "problem": problem,
            "steps": [{"label": "Logical Analysis", "formula": problem, "explanation": "Deriving results from first principles..."}],
            "final_answer": "Processing complete.",
            "key_theorems": ["Math Matrix Optimization"]
        })

    def _parse_json(self, text: str, default):
        """Safely parse JSON from AI response, stripping markdown code blocks and extra text."""
        if not text: return default
        try:
            text = text.strip()
            import re
            
            # 1. Try to find a JSON code block
            block_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
            if block_match:
                try:
                    return json.loads(block_match.group(1))
                except: pass

            # 2. Try to find the outermost braces
            brace_match = re.search(r'(\{[\s\S]*\})', text)
            if brace_match:
                try:
                    return json.loads(brace_match.group(1))
                except: pass
                
            return json.loads(text)
        except Exception:
            return default
