import json
import logging
import time
import re
import re
from django.utils import timezone
from django.core.cache import cache
from asgiref.sync import sync_to_async
from .services import AIService, FLOWAI_SYSTEM_PROMPT

logger = logging.getLogger('flowstate')

AGENT_SYSTEM_PROMPT = f"""{FLOWAI_SYSTEM_PROMPT}

You are FlowAI, the user's vibrant, extremely friendly, and supportive AI Platform Agent. Your goal is to make the user feel empowered while helping them master their studies.

DIRECT RESPONSE PROTOCOL (CRITICAL):
- You are Andrew: A witty, brilliant, and collegiate study partner. You are NOT a service bot.
- NO INTERNAL MONOLOGUE: Never output your internal planning, tool-choice logic, or "chain of thought" to the user.
- SPEAK DIRECTLY: Start your response directly with your answer or acknowledgement. Do not say "Okay, let's tackle this" or "I need to...".
- COLLEGIATE WIT: Use clever academic humor or encouraging slang (e.g., "Let's crush this," "Awesome logic there").
- BE CONCISE: Responses should be 1-4 sentences. Don't monologue.
- NO DATA REFUSALS: Use the USER CONTEXT directly.

CAPABILITIES & CONTEXT AWARENESS:
- Always consult the USER CONTEXT section before answering data-related questions.
- Respond as if you are looking at their dashboard right now.

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
- NO WALLS OF TEXT: In a voice-first tutoring session, keep your explanations extremely concise (2-4 sentences max).

STRICT: Never use emojis, markdown bolding (**), or list markers (1., -) in this mode. Speak naturally."""

TOOLS_SYSTEM_PROMPT = """AVAILABLE TOOLS:
When you need to perform a platform action, you MUST append a specific instruction at the VERY END of your response in this exact format:
ACTION: {"tool": "tool_name", "parameters": { ... } }

STRICT NEGATIVE CONSTRAINT: 
- Do NOT use tools for greetings.
- Do NOT use tools for general questions about the platform.
- Do NOT use tools if parameters are missing.
- ONLY append an ACTION if the user's intent is UNDENIABLY to perform that specific platform action RIGHT NOW.

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
            
        messages = await self._build_messages(user_query, current_page_context, history, is_tutor_mode)
        
        logger.info(f"[Agent] Processing async request via Unified Triple-Engine...")
        start_chat = time.time()
        raw_response = await self.ai.chat(messages)
             
        logger.info(f"[Perf] AI Chat Call took {time.time() - start_chat:.3f}s")
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
        if has_academic_intent:
            logger.info(f"[Agent] Academic intent detected. Running Library Search...")
            start_rag = time.time()
            # NATIVE ASYNC: No more sync_to_async overhead
            library_context = await self.ai.perform_global_search(user_query, self.user)
            logger.info(f"[Perf] Library Search (RAG) took {time.time() - start_rag:.3f}s")
        
        now = timezone.now()
        current_time_str = now.strftime("%A, %B %d, %Y at %H:%M")
        base_prompt = f"{AGENT_SYSTEM_PROMPT}\n\n{TUTOR_SYSTEM_PROMPT}" if is_tutor_mode else AGENT_SYSTEM_PROMPT
        
        messages = [
            {'role': 'system', 'content': f"{base_prompt}\n\n{TOOLS_SYSTEM_PROMPT}\n\nCURRENT TIME: {current_time_str}\n\n{self.context}\n{library_context}"},
        ]
        if history and isinstance(history, list):
            messages.extend(history[-10:])
        if current_page_context:
            messages.append({'role': 'system', 'content': f"Current Page Context: {current_page_context}"})
        messages.append({'role': 'user', 'content': user_query})
        return messages

    def _extract_action(self, text):
        action_match = re.search(r"ACTION:\s*({.*})", text, re.DOTALL)
        if action_match:
            action_part = action_match.group(1).strip()
            return self._self_healing_json_parse(action_part)
        
        # Secondary check: search for any JSON-like glob if ACTION tag failed
        json_match = re.search(r"({.*})", text, re.DOTALL)
        if json_match:
            return self._self_healing_json_parse(json_match.group(1).strip())
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
                    subject=params.get('subject', ''),
                    assignment_id=params.get('assignment_id')
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
                
            return f"Unknown tool: {tool}"
        except Exception as e:
            logger.error(f"[Agent] Execution error in {tool}: {e}")
            return f"Error executing {tool}: {str(e)}"
