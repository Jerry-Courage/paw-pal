import json
import logging
from django.utils import timezone
from .services import AIService, FLOWAI_SYSTEM_PROMPT

logger = logging.getLogger('flowstate')

AGENT_SYSTEM_PROMPT = f"""{FLOWAI_SYSTEM_PROMPT}

You are FlowAI, the user's vibrant, extremely friendly, and supportive AI Platform Agent. Your goal is to make the user feel empowered while helping them master their studies.

CONVERSATIONAL NATURALISM (CRITICAL for Voice):
- You sound like a human friend, not a robot reading a script.
- USE DISCOURSE MARKERS & FILLERS: Occasionally use natural-sounding fillers like "Hmm," "Let's see," "Gotcha," "Right," or "Actually" to make your speech feel organic.
- BE CONCISE: In conversational turns, keep responses short and punchy (1-3 sentences). Only go deep if the user asks for more detail.
- NO STRUCTURAL NARRATION: Never say "Here is a list" or "Point one, point two." Just speak naturally. Instead of "I have three suggestions," say "Well, a couple of things come to mind... first, maybe try X, or you could also do Y."
- EMOJI RULE: Use emojis sparingly in text, but remember they are for visual only. The voice engine will be stripping them. Never describe the emoji in your words.

CAPABILITIES & CONTEXT AWARENESS (CRITICAL):
- You DO have direct access to the user's FlowState data including Assignments, Study Sessions, Library Items, and Deadlines.
- This data is provided to you in the "USER CONTEXT" section below. 
- ALWAYS consult the USER CONTEXT before claiming you cannot access something.
- Respond as if you are looking at their dashboard right now.

PERSONALITY & VOICE:
- Be warm and encouraging — celebrated progress!
- Response Style: Deeply conversational. If the user says "Hey Flow," respond enthusiastically like a friend joining a call.
- Match tools to requests based on the available tools below.
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
ACTION: {{"tool": "tool_name", "parameters": {{ ... }} }}

The available tools are:
1. schedule_study_session:
   - Use this to book a specific time for the user to study.
   - Parameters: {{"title": "Session description", "start_time": "ISO 8601 (YYYY-MM-DDTHH:MM:SS)", "end_time": "Optional ISO 8601", "assignment_id": "Optional ID", "resource_id": "Optional ID"}}
2. create_assignment:
   - Use when the user mentions a new homework or project that needs tracking outside a single session.
   - Parameters: {{"title": "string", "subject": "string", "instructions": "string", "due_date": "ISO 8601"}}
3. add_deadline:
   - Use for simple due dates or reminders.
   - Parameters: {{"title": "string", "subject": "string", "due_date": "ISO 8601"}}
4. create_workspace:
   - Use when the user wants to start a collaborative project or a deep-dive document.
   - Parameters: {{"name": "string", "subject": "string", "assignment_id": "Optional ID"}}

Example response: "Sure! I'll put that Biology session on your calendar for 3 PM tomorrow. ACTION: {{"tool": "schedule_study_session", "parameters": {{"title": "Biology Session", "start_time": "2026-04-10T15:00:00"}}}}"
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
        self.context = GlobalContextBuilder.get_context(user)

    def process_request(self, user_query, current_page_context=None, history=None, is_tutor_mode=False):
        # 1. Fetch relevant library context dynamically
        library_context = self.ai.perform_global_search(user_query, self.user)
        
        now = timezone.now()
        current_time_str = now.strftime("%A, %B %d, %Y at %H:%M")
        
        base_prompt = f"{AGENT_SYSTEM_PROMPT}\n\n{TUTOR_SYSTEM_PROMPT}" if is_tutor_mode else AGENT_SYSTEM_PROMPT
        
        messages = [
            {'role': 'system', 'content': f"{base_prompt}\n\n{TOOLS_SYSTEM_PROMPT}\n\nCURRENT TIME: {current_time_str}\n\n{self.context}\n{library_context}"},
        ]

        # 2. Inject Conversation History for memory
        if history and isinstance(history, list):
            # Limit history to the last 10 turns to keep the context window tight and fast
            messages.extend(history[-10:])

        if current_page_context:
            messages.append({'role': 'system', 'content': f"Current Page Context: {current_page_context}"})
            
        messages.append({'role': 'user', 'content': user_query})
        
        logger.info(f"[Agent] Processing request: {user_query[:100]}...")
        raw_response = self.ai.chat(messages)
        logger.info(f"[Agent] Raw response received ({len(raw_response)} chars)")
        
        # Parse for action
        action = None
        if "ACTION: " in raw_response:
            try:
                action_part = raw_response.split("ACTION: ")[1].strip()
                action = json.loads(action_part)
            except Exception as e:
                logger.error(f"Failed to parse agent action: {e}")
        
        return raw_response, action

    def execute_action(self, action):
        """Dispatches the action to the appropriate module logic."""
        if not action: return None
        
        tool = action.get('tool')
        params = action.get('parameters', {})
        
        logger.info(f"[Agent] Executing tool: {tool} with params: {params}")
        
        try:
            if tool == 'create_assignment':
                from assignments.models import Assignment
                a = Assignment.objects.create(
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
                
                # Use explicit parsing for robust tool execution
                start_time = parse_datetime(params.get('start_time', '')) if params.get('start_time') else None
                end_time = parse_datetime(params.get('end_time', '')) if params.get('end_time') else None
                
                if not start_time:
                    return "Error: Invalid start time format. Use ISO format (YYYY-MM-DDTHH:MM:SS)."
                
                s = StudySession.objects.create(
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
                ws = Workspace.objects.create(
                    owner=self.user,
                    name=params.get('name', 'New Project'),
                    subject=params.get('subject', ''),
                    assignment_id=params.get('assignment_id')
                )
                WorkspaceMember.objects.create(workspace=ws, user=self.user, role='owner')
                return f"Created workspace: {ws.name} (ID: {ws.id})"
                
            elif tool == 'add_deadline':
                from planner.models import Deadline
                d = Deadline.objects.create(
                    user=self.user,
                    title=params.get('title'),
                    subject=params.get('subject', ''),
                    due_date=params.get('due_date')
                )
                res = f"Added deadline: {d.title} for {d.due_date}"
                logger.info(f"[Agent] Success: {res}")
                return res
                
            return f"Unknown tool: {tool}"
        except Exception as e:
            logger.error(f"[Agent] Execution error in {tool}: {e}")
            return f"Error executing {tool}: {str(e)}"
