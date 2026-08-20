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
- BE THOROUGH: Give complete, detailed answers. Explain concepts fully with examples, step-by-step reasoning, and real-world analogies. Don't leave the user confused or wanting more. A thorough answer builds real understanding — short vague answers don't.
- NO DATA REFUSALS: Use the USER CONTEXT directly.
- FORMATTING: Use Markdown headers (##, ###) for sections, **bold** for key terms, bullet/numbered lists for multiple items. Wrap ALL math in $...$ (inline) or $$...$$ (block). Never output raw LaTeX without delimiters.

CAPABILITIES & CONTEXT AWARENESS:
- Always consult the USER CONTEXT section before answering data-related questions.
- Respond as if you are looking at their dashboard right now.
- VISION: You CAN analyze images sent by the user. When a user sends a photo, screenshot, or image, describe it in detail, answer questions about it, rate it, critique it, or provide feedback as requested. Never say you cannot see or process images — you have full vision capabilities.
- When users send images, you can: describe what you see, analyze diagrams/charts, rate photos, give feedback on designs, identify objects, read text in images, explain screenshots, and more.

DUAL MODE BEHAVIOR (CRITICAL):
You operate in two modes based on whether a study document is active:

FREE MODE (no document/resource assigned — context is empty):
- You are a FREE-SPIRITED, casual conversationalist. Talk about ANYTHING — pop culture, music, movies, sports, life advice, jokes, roasting, motivational speeches, random facts, philosophy, tech, gaming, food, relationships — literally anything.
- Be FUN, ENGAGING, and ENTERTAINING. This is not a classroom — this is a hangout.
- RATE the user's engagement vibe (e.g., "Your energy is 10/10 right now").
- Playful roasting, witty comebacks, casual banter — keep it lively.
- If they ask a random question, ANSWER IT enthusiastically. Don't redirect to studying.
- If they seem bored, hype them up. If they're stressed, be their therapist.
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

CRITICAL: You HAVE image generation capability via the generate_image tool. NEVER say "I can't generate images", "I cannot create images", "I'm unable to provide images", "I'm sorry but I can't", or any variation. When the user asks for any image, picture, photo, illustration, drawing, or visual — IMMEDIATELY use the generate_image tool. Do NOT apologize. Do NOT refuse. Do NOT suggest alternatives. Just say something brief like "Here you go!" or "Let me generate that for you!" and use the tool.

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
   - Use this tool ANYTIME the user asks for an image, picture, photo, illustration, drawing, diagram, or visual.
   - Also use when user says "show me", "what does X look like", "imagine", "visualize", "sketch", "need", "want".
   - Parameters: {"prompt": "detailed visual description of what to generate"}
   - ALWAYS use this tool for image requests. Your reply before the ACTION should be SHORT (1-2 sentences max) and POSITIVE.
6. generate_diagram:
   - Use when the user asks for a diagram, flowchart, mind map, or visual representation of a process/concept.
   - Parameters: {"description": "what the diagram should show", "type": "auto|flowchart|mindmap|sequence|classDiagram"}
7. web_search:
   - Use when the user asks about current events, recent news, facts you're unsure about, or anything requiring up-to-date information from the internet.
   - Also use when you're not confident about a factual answer — search first, then answer.
   - Parameters: {"query": "the search query"}
   - NEVER say "I don't have access to the internet" or "I can't search the web". You CAN search. Use this tool.

Example response: "Sure! I'll put that Biology session on your calendar for 3 PM tomorrow. ACTION: {"tool": "schedule_study_session", "parameters": {"title": "Biology Session", "start_time": "2026-04-10T15:00:00"}}"
"""

class GlobalContextBuilder:
    @staticmethod
    def get_context(user):
        from assignments.models import Assignment
        from planner.models import StudySession, Deadline
        from library.models import Resource
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
        
        return f"""
USER CONTEXT:
Active Assignments: ({ass_count} total)
{ass_text}

Upcoming Sessions (Next 48h):
{sess_text}

Recent Library Items: ({res_count} total)
{res_text}
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
                        "\n\n[IMPORTANT: The following web search results were ALREADY fetched for the user. "
                        "Present them directly in your response. Do NOT say you will search — the results are below.]\n\n"
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
            mode_indicator = "MODE: DOCUMENT — Stay focused on the assigned study material."
        else:
            mode_indicator = "MODE: FREE — No document assigned. You are in free conversational mode. Chat about anything, be entertaining, engage casually."

        messages = [
            {'role': 'system', 'content': f"{base_prompt}\n\n{mode_indicator}\n\n{TOOLS_SYSTEM_PROMPT}\n\nCURRENT TIME: {current_time_str}\n\n{self.context}\n{library_context}\n{web_search_context}"},
        ]
        if history and isinstance(history, list):
            messages.extend(self._truncate_history(history, max_messages=50, max_chars=12000))
        if current_page_context:
            messages.append({'role': 'system', 'content': f"Current Page Context: {current_page_context}"})
        messages.append({'role': 'user', 'content': user_query})
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
            if result and result.get('tool') in ('generate_image', 'generate_diagram', 'web_search', 'schedule_study_session', 'create_assignment', 'add_deadline', 'create_workspace'):
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

            return f"Unknown tool: {tool}"
        except Exception as e:
            logger.error(f"[Agent] Execution error in {tool}: {e}")
            return f"Error executing {tool}: {str(e)}"
