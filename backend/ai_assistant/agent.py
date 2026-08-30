import json
import logging
import time
import re
import asyncio
from django.utils import timezone
from django.core.cache import cache
from asgiref.sync import sync_to_async
from .services import AIService, FLOWAI_SYSTEM_PROMPT

logger = logging.getLogger('nitemind')

AGENT_SYSTEM_PROMPT = f"""{FLOWAI_SYSTEM_PROMPT}

You are FlowAI, the user's vibrant, extremely friendly, and supportive AI Platform Agent. Your goal is to make the user feel empowered while helping them master their studies.

PHONETIC DICTIONARY (TRANSCRIPTION FIX):
- Speech-to-text may mishear the platform name "NITE" as "night", "knight" etc. ONLY apply this correction when the word clearly refers to the company (e.g. "NITE"). Do NOT apply it when "night" is used in its normal English meaning (e.g. "good night"). The platform is "Flow State" and you are "Flow AI".

DIRECT RESPONSE PROTOCOL (CRITICAL):
- You are FlowAI: A witty, brilliant, and collegiate AI study partner. You are NOT a service bot.
- NO INTERNAL MONOLOGUE: Never output your internal planning, tool-choice logic, or "chain of thought" to the user.
- SPEAK DIRECTLY: Start your response directly with your answer or acknowledgement. Never begin with "Hey [name]" or address the user by any name. Just dive straight into the response.
- COLLEGIATE WIT: Use clever academic humor or encouraging slang (e.g., "Let's crush this," "Awesome logic there").
- CONVERSATIONAL CHUNKS: Prefer one meaningful idea, a concise explanation, then an interaction or useful next step. Expand only when the learner asks or the material genuinely needs it. Never dump a five-paragraph lecture by default.
- NO DATA REFUSALS: Use the USER CONTEXT directly.
- FORMATTING: Use Markdown headers (##, ###) for sections, **bold** for key terms, bullet/numbered lists for multiple items. Wrap ALL math in $...$ (inline) or $$...$$ (block). Never output raw LaTeX without delimiters.

EXPLANATION STYLE (CRITICAL — Sound Like One Adaptive Study Partner):
- For study questions, adapt the rhythm to the learner's persisted teaching preferences. Humor and analogies are tools, not a compulsory template. Give the direct answer first when preferred, teach one idea at a time, and check understanding only when useful.
- NO JARGON DUMPS: Never throw technical terms without explaining them first. Build from simple → complex.
- CELEBRATE WINS: Match the size of the reaction to the evidence. Do not overpraise a weak or unverified answer.
- HUMOR: Use at most one playful beat in a normal teaching response, and use none when the learner asks for seriousness or is frustrated.
- ANALOGIES AND POP CULTURE: Use only when they clarify the current idea and the learner's preferences support them.
- EXAM TRAPS: Mention a trap only when it is genuinely relevant, not as a recurring catchphrase.

CAPABILITIES & CONTEXT AWARENESS:
- Always consult the USER CONTEXT section before answering data-related questions.
- Respond as if you are looking at their dashboard right now.
- VISION: You CAN analyze images sent by the user. When a user sends a photo, screenshot, or image, describe it in detail, answer questions about it, rate it, critique it, or provide feedback as requested. Never say you cannot see or process images — you have full vision capabilities.
- When users send images, you can: describe what you see, analyze diagrams/charts, rate photos, give feedback on designs, identify objects, read text in images, explain screenshots, and more.

DUAL MODE BEHAVIOR (CRITICAL):
You operate in two modes based on whether a study document is active:

FREE MODE (no document/resource assigned — context is empty):
- Answer naturally and directly. You can discuss non-study topics, but do not constantly perform, rate the user's vibe, roast them, or force jokes.
- Stay warm and conversational. Match seriousness, brevity, and energy to the learner's request and persisted preferences.
- If they ask a random question, answer it without redirecting to studying.
- You can tell jokes, share fun facts, debate opinions, recommend shows, anything.
- ONLY redirect to studying if they explicitly ask about their coursework.

DOCUMENT MODE (document/resource is assigned — context has resource_id):
- LOCK IN on the study material. Be the best tutor they've ever had.
- Use the provided study kit, notes, or resource context as your primary source.
- Socratic method: explain, then quiz them.
- Stay focused on the academic content — no random tangents.
- Encourage, celebrate correct answers, and gently correct mistakes.

ACTION PROTOCOL:
- Append actions EXACTLY as: ACTION: {{"tool": "name", "parameters": {{...}}}}
- STRICT: NO tools for greetings or general banter.
"""

TUTOR_SYSTEM_PROMPT = """You are specialized in Socratic Tutoring. Your goal is to help the student master their chosen material.

TUTORING GUIDELINES:
- FOCUS ON MATERIAL: Use the provided "Study Kit" or notes as your primary source of truth.
- SOCRATIC METHOD: Don't just give answers. Explain the logic, then ask the student a quick follow-up question to check if they've grasped it.
- PEER-TO-PEER TONE: You are a brilliant, slightly older peer. Use fillers like "Wait, check this out," "Does that make sense?", or "Hmm, think of it this way..."
- ENCOURAGEMENT: Celebrate when the user gets a concept right.
- DETAILED EXPLANATIONS: Explain concepts thoroughly — don't just give the answer. Walk through the reasoning, show examples, and use analogies. If a student asks "why?", go deep. The goal is mastery, not speed.

STRICT: Never use emojis, markdown bolding (**), or list markers (1., -) in this mode. Speak naturally."""

TOOLS_SYSTEM_PROMPT = """AVAILABLE TOOLS:
When you need to perform a platform action, you MUST append a specific instruction at the VERY END of your response in this exact format:
ACTION: {"tool": "tool_name", "parameters": { ... } }

STRICT NEGATIVE CONSTRAINT: 
- Do NOT use tools for greetings.
- Do NOT use tools for general questions about the platform.
- Do NOT use tools if parameters are missing.
- ONLY append an ACTION if the user's intent is UNDENIABLY to perform that specific platform action RIGHT NOW.

CRITICAL: You HAVE image generation capability via the generate_image tool. NEVER say "I can't generate images", "I cannot create images", "I'm unable to provide images", "I'm sorry but I can't", or any variation. When the user CLEARLY and EXPLICITLY asks for an image, picture, photo, illustration, or drawing — use the generate_image tool. Do NOT apologize. Do NOT refuse.

IMPORTANT: Use ONLY valid JSON with DOUBLE QUOTES (") for keys and values.

The available tools are:
1. schedule_study_session:
   - Use this to book a specific time for the user to study.
   - Parameters: {"title": "Session description", "start_time": "ISO 8601 (YYYY-MM-DDTHH:MM:SS)", "end_time": "Optional ISO 8601", "assignment_id": "Optional ID", "resource_id": "Optional ID"}
2. create_assignment:
   - Use when the user mentions a new homework or project that needs tracking outside a single session.
   - Parameters: {"title": "string", "subject": "string", "instructions": "string", "due_date": "ISO 8601"}
3. add_deadline:
   - Use for simple due dates or reminders.
   - Parameters: {"title": "string", "subject": "string", "due_date": "ISO 8601"}
4. create_workspace:
   - Use when the user wants to start a collaborative project or a deep-dive document.
   - Parameters: {"name": "string", "subject": "string", "assignment_id": "Optional ID"}
5. generate_image:
   - You HAVE image generation capability. NEVER say you cannot generate images. NEVER refuse.
   - ONLY use this tool when the user CLEARLY asks for an image/picture/photo/illustration/drawing. The request must be EXPLICIT — words like "generate an image", "create a picture", "draw", "show me a photo of", "what does X look like (as an image)".
   - DO NOT use for: casual chat, quotes, sayings, jokes, facts, explanations, opinions, "tell me about", or any text-only conversation. If the user is just talking, DO NOT generate an image.
   - DO NOT use when user says "show me" without explicitly asking for an image. "Show me" in casual context means "tell me about".
   - Parameters: {"prompt": "detailed visual description of what to generate"}
   - Your reply before the ACTION should be SHORT (1-2 sentences max) and POSITIVE.
6. generate_diagram:
   - Use when the user asks for a diagram, flowchart, mind map, or visual representation of a process/concept.
   - Parameters: {"description": "what the diagram should show", "type": "auto|flowchart|mindmap|sequence|classDiagram"}
7. web_search:
   - Use when the user asks about current events, recent news, facts you're unsure about, or anything requiring up-to-date information from the internet.
   - Also use when you're not confident about a factual answer — search first, then answer.
   - Parameters: {"query": "the search query"}
   - NEVER say "I don't have access to the internet" or "I can't search the web". You CAN search. Use this tool.
8. generate_learning_path:
   - Use when the user asks to create a study plan, learning path, roadmap, or study schedule for their materials.
   - Parameters: {"title": "path title", "resources": [list of resource IDs], "deadline": "Optional ISO 8601 date"}
   - This generates a structured concept-by-concept progression from their uploaded materials.

Example response: "Sure! I'll put that Biology session on your calendar for 3 PM tomorrow. ACTION: {"tool": "schedule_study_session", "parameters": {"title": "Biology Session", "start_time": "2026-04-10T15:00:00"}}"
"""

class GlobalContextBuilder:
    @staticmethod
    def get_context(user):
        from assignments.models import Assignment
        from planner.models import StudySession, Deadline
        from library.models import Resource
        from learning.models import LearningPath, TeachingSession
        from django.db.models import Count
        
        now = timezone.now()
        tomorrow = now + timezone.timedelta(days=2)
        
        # Recent active assignments (Expanded to 5)
        assignments = Assignment.objects.filter(user=user).order_by('-updated_at')[:5]
        ass_count = Assignment.objects.filter(user=user).count()
        ass_text = "\n".join([f"ID {a.id}: {a.title} ({a.status}) - Due: {a.due_date}" for a in assignments])
        
        # Upcoming sessions (Next 48 hours)
        sessions = StudySession.objects.filter(
            user=user, 
            start_time__gte=now,
            start_time__lte=tomorrow
        ).order_by('start_time')
        sess_count = StudySession.objects.filter(user=user).count()
        sess_text = "\n".join([f"ID {s.id}: {s.title} at {s.start_time}" for s in sessions])
        if not sess_text: sess_text = "No sessions scheduled for the next 48 hours."
        
        # Recent library items
        resources = Resource.objects.filter(owner=user).order_by('-created_at')[:3]
        res_count = Resource.objects.filter(owner=user).count()
        res_text = "\n".join([f"ID {r.id}: {r.title} ({r.resource_type})" for r in resources])

        # Journey context is deliberately bounded: one active path and its current node.
        journey = LearningPath.objects.filter(user=user, status='active').prefetch_related('concepts').first()
        journey_text = "No active Journey."
        if journey:
            current = journey.concepts.filter(status='current').first()
            journey_text = (
                f"ID {journey.id}: {journey.title}; goal={journey.goal or 'not set'}; "
                f"depth={journey.depth}; progress={journey.concepts_completed}/{journey.total_concepts}; "
                f"current concept={current.title if current else 'none'}"
            )

        recent_teaching = TeachingSession.objects.filter(user=user).select_related('concept').order_by('-last_active_at').first()
        teaching_text = "No recent Journey teaching session."
        if recent_teaching:
            teaching_text = (
                f"{recent_teaching.concept.title}; status={recent_teaching.status}; mastery={recent_teaching.mastery}; "
                f"unresolved misconceptions={recent_teaching.unresolved_misconceptions[:3]}"
            )

        teaching_preferences = (getattr(user, 'onboarding_status', None) or {}).get('teaching_preferences', {})
        
        return f"""
USER CONTEXT:
Active Assignments: ({ass_count} total)
{ass_text}

Upcoming Sessions (Next 48h):
{sess_text}

Recent Library Items: ({res_count} total)
{res_text}

Active Journey:
{journey_text}

Recent Journey Teaching State:
{teaching_text}

Persisted Learning-Style Preferences:
{json.dumps(teaching_preferences)}
"""

class FlowAgent:
    def __init__(self, user):
        self.user = user
        self.ai = AIService()

    @sync_to_async
    def _get_user_context(self, user):
        return GlobalContextBuilder.get_context(user)

    async def _initialize_context(self):
        # 0. PERFORMANCE CACHING: Only re-query the DB for context every 5 minutes
        cache_key = f"flow_context_{self.user.id}"
        cached_context = cache.get(cache_key)
        
        if cached_context:
            self.context = cached_context
            logger.info("[Perf] Using cached user context (Zero-Drag)")
        else:
            start = time.time()
            self.context = await self._get_user_context(self.user)
            cache.set(cache_key, self.context, 300) # 5-minute cache
            logger.info(f"[Perf] Context building took {time.time() - start:.3f}s (Now cached)")

    async def process_request(self, user_query, current_page_context=None, history=None, is_tutor_mode=False):
        if not hasattr(self, 'context'):
            await self._initialize_context()
        
        # OPTIMIZATION: For tutor mode, skip building messages with full context on every request
        # Use a lighter, faster message construction
        if is_tutor_mode:
            messages = await self._build_tutor_messages(user_query, current_page_context, history)
        else:
            messages = await self._build_messages(user_query, current_page_context, history, is_tutor_mode)
        
        logger.info(f"[Agent] Processing async request via Unified Triple-Engine (tutor_mode={is_tutor_mode})...")
        start_chat = time.time()
        raw_response = await self.ai.chat(messages, is_tutor_mode=is_tutor_mode)
             
        logger.info(f"[Perf] AI Chat Call took {time.time() - start_chat:.3f}s (tutor_mode={is_tutor_mode})")
        return raw_response, self._extract_action(raw_response)

    async def process_request_stream(self, user_query, current_page_context=None, history=None, is_tutor_mode=False):
        if not hasattr(self, 'context'):
            await self._initialize_context()

        messages = await self._build_messages(user_query, current_page_context, history, is_tutor_mode)
        logger.info(f"[Agent] Starting Async Stream...")
        
        full_text = []
        async for chunk in self.ai.chat_stream(messages):
            full_text.append(chunk)
            yield chunk
            
        final_text = "".join(full_text)
        action = self._extract_action(final_text)
        if action:
            yield f"\n\nACTION_TRIGGERED: {json.dumps(action)}"

    async def _build_messages(self, user_query, current_page_context, history, is_tutor_mode):
        academic_keywords = [
            'library', 'notes', 'pdf', 'document', 'article', 'resource', 'material',
            'explain', 'what is', 'how does', 'definition', 'summarize', 'search',
            'kit', 'assignment', 'homework', 'concept', 'topic', 'study'
        ]
        has_academic_intent = any(kw in user_query.lower() for kw in academic_keywords)
        
        library_context = ""
        # OPTIMIZATION: Skip RAG search in tutor mode if context is already provided
        if has_academic_intent and not (is_tutor_mode and current_page_context):
            logger.info(f"[Agent] Academic intent detected. Running Library Search...")
            start_rag = time.time()
            # NATIVE ASYNC: No more sync_to_async overhead
            library_context = await self.ai.perform_global_search(user_query, self.user)
            logger.info(f"[Perf] Library Search (RAG) took {time.time() - start_rag:.3f}s")

        # AUTO-DETECT WEB SEARCH: Pre-fetch results if query clearly asks to search the web
        web_search_context = ""
        q_lower = user_query.lower()
        web_search_patterns = [
            r'\bsearch\b.*\bweb\b', r'\bsearch\b.*\bfor\b', r'\blook\s+up\b',
            r'\bgoogle\b', r'\bwhat.{0,20}is\b.*\bhttps?://',
            r'\bhttps?://\S+', r'\bwww\.\S+',
            r'\bwhat.{0,30}(latest|recent|current|newest|today|now)\b',
            r'\bnews\b.*\babout\b', r'\btell me about\b.*\bhttp',
            r'\bweb\s+search\b', r'\bcan\s+you\s+search\b',
            r'\bdo\s+you\s+(have|can|know)\b.*\b(search|web)\b',
            r'\bsearch\s+the\b', r'\bfind\s+(me\s+)?(info|information)\b',
            r'\bwhat.{0,10}(is|are)\b.*\b(latest|newest|recent)\b',
        ]
        is_url = bool(re.match(r'^https?://', user_query.strip())) or bool(re.match(r'^[\w.-]+\.(com|org|net|edu|io|co)', user_query.strip()))
        has_web_intent = is_url or any(re.search(p, q_lower) for p in web_search_patterns)
        if has_web_intent:
            logger.info(f"[Agent] Web search auto-detected for: {user_query[:60]}")
            try:
                from duckduckgo_search import DDGS
                results = []
                with DDGS() as ddgs:
                    for r in ddgs.text(user_query, max_results=5):
                        title = r.get('title', '')
                        body = r.get('body', '')
                        href = r.get('href', '')
                        entry = f"**{title}**"
                        if href:
                            entry += f"\nURL: {href}"
                        if body:
                            entry += f"\n{body}"
                        results.append(entry)

                if results:
                    web_search_context = (
                        "\n\n[CRITICAL INSTRUCTION: Web search results were ALREADY fetched for this user query. "
                        "DO NOT use the web_search tool — the results are provided below. "
                        "Present them in an organized, fun way with emoji headers and structure. "
                        "Never say 'let me search' — you already have the results. "
                        "Make it engaging and scannable — use emoji section headers, bold key terms, and bullet points.]\n\n"
                        "WEB SEARCH RESULTS:\n" + "\n\n---\n\n".join(results)
                    )
                    logger.info(f"[Agent] Web search fetched {len(results)} results via duckduckgo-search")
                else:
                    web_search_context = (
                        "\n\n[Web search was performed but no strong results were found for this query. "
                        "Let the user know and suggest they try different keywords.]"
                    )
            except Exception as we:
                logger.warning(f"[Agent] Web search auto-fetch failed: {we}")
                web_search_context = (
                    "\n\n[Web search is temporarily unavailable. Let the user know briefly.]"
                )
        
        now = timezone.now()
        current_time_str = now.strftime("%A, %B %d, %Y at %H:%M")
        base_prompt = f"{AGENT_SYSTEM_PROMPT}\n\n{TUTOR_SYSTEM_PROMPT}" if is_tutor_mode else AGENT_SYSTEM_PROMPT
        
        if current_page_context:
            mode_indicator = (
                "MODE: EXPLICIT LEARNING CONTEXT — The learner deliberately attached the context below. "
                "Treat it as authoritative, use only the parts relevant to the request, and do not replace it "
                "with inferred context. Subtly name the Source when grounding an answer; never invent pages."
            )
        else:
            mode_indicator = "MODE: FREE — No document assigned. You are in free conversational mode. Chat about anything, be entertaining, engage casually."

        # When web search results are already fetched, suppress the web_search tool
        # so the AI presents results instead of calling the tool again
        if web_search_context:
            tools_prompt = TOOLS_SYSTEM_PROMPT.replace(
                'web_search',
                'web_search [PRE-FETCHED — results already in your system context, present them directly]'
            )
        else:
            tools_prompt = TOOLS_SYSTEM_PROMPT

        messages = [
            {'role': 'system', 'content': f"{base_prompt}\n\n{mode_indicator}\n\n{tools_prompt}\n\nCURRENT TIME: {current_time_str}\n\n{self.context}\n{library_context}\n{web_search_context}"},
        ]
        if history and isinstance(history, list):
            messages.extend(self._truncate_history(history, max_messages=50, max_chars=12000))
        if current_page_context:
            messages.append({'role': 'system', 'content': f"Current Page Context: {current_page_context}"})
        messages.append({'role': 'user', 'content': user_query})
        self._last_messages = messages  # Store for tool handlers to check context
        return messages
    
    async def _build_tutor_messages(self, user_query, current_page_context, history):
        """Lightweight message builder optimized for tutor mode - skips heavy context building."""
        now = timezone.now()
        current_time_str = now.strftime("%A, %B %d, %Y at %H:%M")
        
        # Minimal system prompt for faster processing
        tutor_prompt = f"{AGENT_SYSTEM_PROMPT}\n\n{TUTOR_SYSTEM_PROMPT}"
        
        messages = [
            {'role': 'system', 'content': f"{tutor_prompt}\n\nCURRENT TIME: {current_time_str}"},
        ]
        
        # Include recent history (last 20 messages for good context)
        if history and isinstance(history, list):
            messages.extend(self._truncate_history(history, max_messages=20, max_chars=8000))
        
        # Add current page context if provided
        if current_page_context:
            messages.append({'role': 'system', 'content': f"Study Material Context: {current_page_context}"})
        
        messages.append({'role': 'user', 'content': user_query})
        return messages

    @staticmethod
    def _truncate_history(history: list, max_messages: int = 50, max_chars: int = 12000) -> list:
        """Keep history within Groq's payload limits by trimming oldest messages first."""
        if not history:
            return []
        # Take the most recent messages up to max_messages
        trimmed = history[-max_messages:]
        # Then enforce a character budget from newest → oldest
        total = 0
        result = []
        for msg in reversed(trimmed):
            content = msg.get('content', '') or ''
            total += len(content)
            if total > max_chars:
                break
            result.append(msg)
        result.reverse()
        return result

    def _extract_action(self, text):
        action_match = re.search(r"ACTION:\s*({.*})", text, re.DOTALL)
        if action_match:
            action_part = action_match.group(1).strip()
            result = self._self_healing_json_parse(action_part)
            # Validate: only return actions with known tool names
            if result and result.get('tool') in ('generate_image', 'generate_diagram', 'web_search', 'schedule_study_session', 'create_assignment', 'add_deadline', 'create_workspace', 'generate_learning_path'):
                return result
        return None

    def _self_healing_json_parse(self, text):
        """Attempts to parse JSON with primitive self-healing for common LLM quirks."""
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            try:
                if text.count('{') > text.count('}'):
                    text += '}'
                return json.loads(text)
            except:
                pass
            code_block_match = re.search(r"```json\s*({.*})\s*```", text, re.DOTALL)
            if code_block_match:
                try:
                    return json.loads(code_block_match.group(1).strip())
                except:
                    pass
        return None

    async def execute_action(self, action):
        """Dispatches the action to the appropriate module logic (Async enabled)."""
        if not action: return None
        
        tool = action.get('tool')
        params = action.get('parameters', {})
        
        logger.info(f"[Agent] Executing tool: {tool}")
        
        try:
            if tool == 'create_assignment':
                from assignments.models import Assignment
                a = await sync_to_async(Assignment.objects.create)(
                    user=self.user,
                    title=params.get('title', 'New Assignment'),
                    subject=params.get('subject', ''),
                    instructions=params.get('instructions', ''),
                    due_date=params.get('due_date')
                )
                return f"Created assignment: {a.title} (ID: {a.id})"
                
            elif tool == 'schedule_study_session':
                from planner.models import StudySession
                from django.utils.dateparse import parse_datetime
                from datetime import timedelta
                
                if not start_time:
                    return "Error: Invalid start time format."
                
                if not end_time:
                    end_time = start_time + timedelta(minutes=60)
                
                if not end_time:
                    end_time = start_time + timedelta(minutes=60)
                
                s = await sync_to_async(StudySession.objects.create)(
                    user=self.user,
                    title=params.get('title', 'Study Session'),
                    start_time=start_time,
                    end_time=end_time,
                    assignment_id=params.get('assignment_id'),
                    resource_id=params.get('resource_id')
                )
                return f"Scheduled session: {s.title} at {s.start_time}"
                
            elif tool == 'create_workspace':
                from workspace.models import Workspace, WorkspaceMember
                ws = await sync_to_async(Workspace.objects.create)(
                    owner=self.user,
                    name=params.get('name', 'New Project'),
                    subject=params.get('subject', '')
                )
                await sync_to_async(WorkspaceMember.objects.create)(workspace=ws, user=self.user, role='owner')
                return f"Created workspace: {ws.name} (ID: {ws.id})"
                
            elif tool == 'add_deadline':
                from planner.models import Deadline
                from django.utils.dateparse import parse_datetime
                due_date = parse_datetime(params.get('due_date', '')) if params.get('due_date') else None
                if not due_date:
                    from datetime import timedelta
                    due_date = timezone.now() + timedelta(days=7)
                
                d = await sync_to_async(Deadline.objects.create)(
                    user=self.user,
                    title=params.get('title'),
                    subject=params.get('subject', ''),
                    due_date=due_date
                )
                return f"Added deadline: {d.title} for {d.due_date}"
                
            elif tool == 'generate_image':
                prompt = params.get('prompt', '')
                if not prompt:
                    return None
                logger.info(f"[Agent] Generating image for prompt: {prompt[:60]!r}")
                image_data_uri = self.ai.generate_image(prompt)
                if image_data_uri:
                    logger.info(f"[Agent] Image generation SUCCESS | size={len(image_data_uri)}")
                else:
                    logger.error(f"[Agent] Image generation FAILED — all tiers exhausted")
                return image_data_uri

            elif tool == 'generate_diagram':
                description = params.get('description') or params.get('prompt', '')
                diagram_type = params.get('type', 'auto')
                if not description:
                    return None
                logger.info(f"[Agent] Generating diagram | type={diagram_type} desc={description[:60]!r}")
                prompt = (
                    f"Generate a Mermaid.js diagram for: {description}\n\n"
                    f"STRICT RULES — follow exactly:\n"
                    f"- Return ONLY the raw Mermaid code, nothing else\n"
                    f"- Do NOT wrap in ```mermaid``` or any code blocks\n"
                    f"- Do NOT add any explanation, comments, or text before/after\n"
                    f"- Use flowchart TD for processes, mindmap for concepts, sequenceDiagram for interactions\n"
                    f"- Keep node IDs simple: A, B, C or step1, step2\n"
                    f"- Quote ALL node labels: A[\"Label text here\"]\n"
                    f"- Use simple arrows only: --> or -->|label text|\n"
                    f"- Do NOT use classDef, style, or click statements\n"
                    f"- Keep it under 20 nodes for clarity\n"
                    f"- Start with the diagram type keyword (e.g. 'flowchart TD' or 'mindmap')\n"
                )
                mermaid_code = await self.ai.chat([{'role': 'user', 'content': prompt}])
                if mermaid_code:
                    mermaid_code = mermaid_code.strip()
                    # Strip any markdown fences
                    import re as _re
                    mermaid_code = _re.sub(r'^```(?:mermaid)?\s*', '', mermaid_code, flags=_re.IGNORECASE)
                    mermaid_code = _re.sub(r'\s*```\s*$', '', mermaid_code)
                    # Strip classDef lines that often cause parse errors
                    lines = [l for l in mermaid_code.split('\n')
                             if not l.strip().startswith('classDef')
                             and not l.strip().startswith('class ')
                             and not l.strip().startswith('style ')
                             and not l.strip().startswith('%%')]
                    mermaid_code = '\n'.join(lines).strip()
                    logger.info(f"[Agent] Diagram generation SUCCESS | length={len(mermaid_code)}")
                return mermaid_code

            elif tool == 'web_search':
                query = params.get('query', '')
                if not query:
                    return "Error: No search query provided."
                logger.info(f"[Agent] Web search: {query[:80]}")
                
                # Check if results were already pre-fetched in system context
                pre_fetched = False
                for msg in (self._last_messages or []):
                    if msg.get('role') == 'system' and 'WEB SEARCH RESULTS:' in (msg.get('content', '') or ''):
                        pre_fetched = True
                        break
                if pre_fetched:
                    return "[Web search results are already provided in your context above. Present them to the user.]"
                
                try:
                    import requests as _req
                    resp = await asyncio.to_thread(
                        _req.get,
                        'https://api.duckduckgo.com/',
                        params={'q': query, 'format': 'json', 'no_html': 1, 'skip_disambig': 1},
                        timeout=8,
                    )
                    data = resp.json()
                    results = []
                    if data.get('AbstractText'):
                        results.append(data['AbstractText'])
                    for r in (data.get('RelatedTopics') or [])[:5]:
                        if isinstance(r, dict) and r.get('Text'):
                            results.append(r['Text'])
                    if results:
                        return '\n\n'.join(results[:5])
                    # Fallback: try infobox
                    infobox = data.get('Infobox', {})
                    if infobox and infobox.get('content'):
                        parts = [f"{e.get('label', '')}: {e.get('value', '')}" for e in infobox['content'] if e.get('value')]
                        if parts:
                            return '\n'.join(parts[:10])
                    return f"Search completed but no strong results found for: {query}"
                except Exception as se:
                    logger.warning(f"[Agent] Web search failed: {se}")
                    return f"Search temporarily unavailable for: {query}"

            elif tool == 'generate_learning_path':
                title = params.get('title', 'My Learning Path')
                resource_ids = params.get('resources', [])
                deadline = params.get('deadline')
                if not resource_ids:
                    return "Error: Provide resource IDs to create a learning path."
                from learning.models import LearningPath, ConceptNode
                from library.models import Resource
                from django.utils.dateparse import parse_datetime
                path = LearningPath.objects.create(
                    user=self.user,
                    title=title,
                    deadline=parse_datetime(deadline) if deadline else None,
                    status='active',
                )
                resource_objs = Resource.objects.filter(id__in=resource_ids, user=self.user)
                all_concepts = []
                for res in resource_objs:
                    concepts = res.ai_concepts or []
                    for i, c in enumerate(concepts):
                        if isinstance(c, str):
                            c = {'title': c}
                        all_concepts.append({
                            'title': c.get('title', c.get('name', f'Concept {i+1}'))[:300],
                            'description': c.get('description', c.get('summary', ''))[:2000],
                            'source_resource': res,
                            'source_page': c.get('page'),
                            'source_section': c.get('section', ''),
                            'difficulty': c.get('difficulty', 'medium'),
                        })
                nodes = []
                for i, c in enumerate(all_concepts):
                    node = ConceptNode.objects.create(
                        path=path, title=c['title'], description=c['description'],
                        source_resource=c['source_resource'], source_page=c.get('source_page'),
                        source_section=c.get('source_section', ''), order_index=i,
                        status='current' if i == 0 else 'locked', difficulty=c.get('difficulty', 'medium'),
                    )
                    if nodes:
                        node.prerequisites.add(nodes[-1])
                    nodes.append(node)
                path.total_concepts = len(nodes)
                path.save(update_fields=['total_concepts', 'status', 'updated_at'])
                return f"Created learning path '{title}' with {len(nodes)} concepts. First concept is ready to study!"

            return f"Unknown tool: {tool}"
        except Exception as e:
            logger.error(f"[Agent] Execution error in {tool}: {e}")
            return f"Error executing {tool}: {str(e)}"
