from rest_framework import generics, permissions, status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from datetime import timedelta, datetime
from .models import StudySession, Deadline
from .serializers import StudySessionSerializer, DeadlineSerializer
from ai_assistant.services import AIService
import json
import re


class StudySessionListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StudySessionSerializer
    # Disable pagination for the planner — the calendar needs ALL sessions for
    # the current week in one flat array, not a paginated envelope.
    pagination_class = None

    def get_queryset(self):
        qs = StudySession.objects.filter(user=self.request.user)
        start = self.request.query_params.get('start')
        end = self.request.query_params.get('end')
        if start:
            qs = qs.filter(start_time__gte=start)
        if end:
            qs = qs.filter(start_time__lte=end)
        return qs.order_by('start_time')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class StudySessionDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StudySessionSerializer

    def get_queryset(self):
        return StudySession.objects.filter(user=self.request.user)

    def perform_update(self, serializer):
        old_status = self.get_object().status
        instance = serializer.save()
        # Log study time when session is marked completed
        if old_status != 'completed' and instance.status == 'completed':
            minutes = instance.duration_minutes or 0
            if minutes > 0:
                self.request.user.log_study_time(minutes)


class CompleteSessionView(APIView):
    """Mark a session as completed and log study time."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            session = StudySession.objects.get(pk=pk, user=request.user)
        except StudySession.DoesNotExist:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if session.status == 'completed':
            return Response({'detail': 'Already completed.'})

        session.status = 'completed'
        if not session.end_time or session.end_time > timezone.now():
            session.end_time = timezone.now()
        session.save()

        minutes = session.duration_minutes or 0
        if minutes > 0:
            request.user.log_study_time(minutes)

        return Response({
            'detail': 'Session completed.',
            'minutes_logged': minutes,
            'study_streak': request.user.study_streak,
            'total_study_time': request.user.total_study_time,
        })


class DeadlineListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DeadlineSerializer

    def get_queryset(self):
        return Deadline.objects.filter(user=self.request.user, is_completed=False)

    def perform_create(self, serializer):
        deadline = serializer.save(user=self.request.user)
        # Notify if deadline is soon
        days_until = (deadline.due_date - timezone.now()).days
        if days_until <= 7:
            try:
                from users.notifications import notify_deadline_approaching
                notify_deadline_approaching(self.request.user, deadline.title, days_until)
            except Exception:
                pass


class DeadlineDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DeadlineSerializer

    def get_queryset(self):
        return Deadline.objects.filter(user=self.request.user)


class BulkCreateSessionsView(APIView):
    """Create a series of recurring sessions (Classes/Lessons)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        import uuid
        from dateutil.relativedelta import relativedelta
        
        data = request.data
        title = data.get('title')
        subject = data.get('subject', '')
        session_type = data.get('session_type', 'class')
        start_time_str = data.get('start_time')
        end_time_str = data.get('end_time')
        days = data.get('days', []) # List of ints 0-6 (Mon-Sun)
        weeks_count = int(data.get('weeks_count', 12))
        
        if not title or not start_time_str or not end_time_str or not days:
            return Response({'error': 'Missing required fields (title, start_time, end_time, days).'}, status=400)

        from django.utils.dateparse import parse_datetime
        base_start = parse_datetime(start_time_str)
        base_end = parse_datetime(end_time_str)
        
        if not base_start or not base_end:
            return Response({'error': 'Invalid date format.'}, status=400)

        recurrence_id = uuid.uuid4()
        sessions_to_create = []
        
        # Generator for the next N weeks
        for week_offset in range(weeks_count):
            # For each week, check the requested days
            # We want to find the date for each requested day of week starting from base_start's week
            # startOfWeek (Mon) of base_start
            monday_of_week = base_start - timedelta(days=base_start.weekday())
            
            for day_index in days:
                actual_start = monday_of_week + timedelta(weeks=week_offset, days=day_index)
                
                # Copy the time from base_start
                actual_start = actual_start.replace(hour=base_start.hour, minute=base_start.minute, second=base_start.second)
                
                # Check if this instance is before the user's start (optional, but usually we start from base_start)
                if actual_start < base_start and week_offset == 0:
                    continue

                duration = base_end - base_start
                actual_end = actual_start + duration
                
                sessions_to_create.append(StudySession(
                    user=request.user,
                    title=title,
                    subject=subject,
                    session_type=session_type,
                    start_time=actual_start,
                    end_time=actual_end,
                    recurrence_id=recurrence_id,
                    status='scheduled'
                ))

        StudySession.objects.bulk_create(sessions_to_create)
        
        return Response({
            'detail': f'Generated {len(sessions_to_create)} sessions.',
            'recurrence_id': recurrence_id,
            'count': len(sessions_to_create)
        }, status=status.HTTP_201_CREATED)


class SmartScheduleView(APIView):
    """AI-powered schedule suggestions based on deadlines and available time."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        
        # 1. Fetch Deadlines
        deadlines = Deadline.objects.filter(
            user=request.user, is_completed=False
        ).order_by('due_date')[:5]

        # 2. Fetch Busy Slots for the next 7 days (including Classes)
        busy_sessions = StudySession.objects.filter(
            user=request.user,
            start_time__gte=now,
            start_time__lte=now + timedelta(days=7)
        ).order_by('start_time')

        suggestions = []

        # Find a gap for each deadline
        for deadline in deadlines:
            days_left = max(1, (deadline.due_date - now).days)
            # Try to find a slot in the next 'interval' days
            interval = min(3, days_left)
            
            # Simple Gap Finder: 
            # 1. Target a day in the future
            # 2. Check if the user is busy during a default study time (e.g. 15:00)
            suggested_dt = now + timedelta(days=interval)
            # Default to 15:00 check
            target_time = suggested_dt.replace(hour=15, minute=0, second=0, microsecond=0)
            
            # Check for conflict
            conflict = busy_sessions.filter(
                start_time__lt=target_time + timedelta(hours=1),
                end_time__gt=target_time
            ).exists()

            if conflict:
                # If 15:00 is busy, try 10:00 or 19:00
                for alt_hour in [10, 19, 14, 16]:
                    target_time = suggested_dt.replace(hour=alt_hour, minute=0, second=0)
                    if not busy_sessions.filter(start_time__lt=target_time + timedelta(hours=1), end_time__gt=target_time).exists():
                        break

            suggestions.append({
                'title': f'{deadline.subject or deadline.title} Study',
                'subject': deadline.subject or '',
                'deadline_title': deadline.title,
                'type': 'assignment_deadline',
                'suggested_date': target_time.date().isoformat(),
                'suggested_time': target_time.strftime('%H:%M'),
                'duration_minutes': 60,
                'urgency': 'high' if days_left <= 3 else 'medium',
                'reason': f'Optimal gap found for {deadline.title}'
            })

        # Flashcard Review
        try:
            from library.models import Flashcard
            due_count = Flashcard.objects.filter(owner=request.user, next_review__lte=now).count()
            if due_count > 0:
                suggestions.insert(0, {
                    'title': 'Flashcard Review',
                    'subject': 'Spaced Repetition',
                    'type': 'review',
                    'suggested_date': now.date().isoformat(),
                    'suggested_time': now.strftime('%H:%M'),
                    'duration_minutes': 20,
                    'reason': f'{due_count} flashcards due now!',
                    'urgency': 'high',
                })
        except Exception: pass

        return Response({'suggestions': suggestions[:10]})


class InterpretScheduleView(APIView):
    """Parses natural language into structured session data."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        prompt = request.data.get('prompt', '').strip()
        if not prompt:
            return Response({'error': 'Prompt required'}, status=status.HTTP_400_BAD_REQUEST)

        # Prefer the client's local datetime so the AI interprets "today/tomorrow"
        # relative to the user's actual calendar day, not the UTC server clock.
        local_now_str = request.data.get('local_now', '')
        if local_now_str:
            from django.utils.dateparse import parse_datetime
            parsed = parse_datetime(local_now_str)
            now_for_ai = parsed if parsed else timezone.now()
        else:
            now_for_ai = timezone.now()

        system_prompt = f"""
        Current Time: {now_for_ai.strftime('%Y-%m-%dT%H:%M:%S')}
        Today is {now_for_ai.strftime('%A, %B %d, %Y')}.
        
        Extract study session details from the user prompt. 
        Detect if it's RECURRING (e.g. "every", "weekly", "daily").
        
        Return ONLY a single valid JSON object. 
        STRICT: No comments (//) inside the JSON. No markdown blocks.
        
        Schema:
        {{
          "title": "mission title",
          "subject": "subject name or empty",
          "session_type": "study, class, exam, assignment, or personal",
          "start_time": "ISO 8601 string WITHOUT timezone suffix (e.g. 2026-08-04T09:00:00 — no Z, no +00:00)",
          "duration_minutes": integer,
          "is_recurring": boolean,
          "days": [integer]
        }}
        
        Days Mapping: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
        Interpretation rules:
        - "Every Monday" -> is_recurring=true, days=[0]
        - "Weekdays" -> is_recurring=true, days=[0,1,2,3,4]
        - Otherwise, is_recurring=false, days=[]
        """
        
        ai = AIService()
        try:
            response_text = ai.chat_sync([
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': prompt}
            ])
            
            # 0. Check for Service Availability
            if "trouble connecting to the AI" in response_text.lower():
                return Response({'error': 'AI Service Offline', 'detail': 'Could not connect to OpenRouter/Gemini. Check API Keys.'}, status=503)

            # SURGICAL JSON PRE-PROCESSOR
            try:
                # 1. Remove markers and comments
                clean_text = re.sub(r'```json\s*|\s*```', '', response_text).strip()
                clean_text = re.sub(r'//.*', '', clean_text) # Strip // comments
                clean_text = re.sub(r'/\*.*?\*/', '', clean_text, flags=re.DOTALL) # Strip /* */
                
                # 2. Extract outermost JSON object
                start = clean_text.find('{')
                end = clean_text.rfind('}')
                if start != -1 and end != -1:
                    json_str = clean_text[start:end+1]
                    data = json.loads(json_str)
                    # Strip any timezone suffix from start_time so the frontend
                    # gets a naive local ISO string. The client sent us local time
                    # and expects local time back — we don't want Z or +00:00
                    # causing a UTC conversion when JS parses the date.
                    if isinstance(data.get('start_time'), str):
                        st = data['start_time']
                        # Remove trailing Z or offset like +05:30 / -08:00
                        st = re.sub(r'([+-]\d{2}:\d{2}|Z)$', '', st)
                        data['start_time'] = st
                    return Response(data)
                raise ValueError("No valid JSON payload detected")
            except Exception as parse_err:
                logger.error(f"Interpretation Failure: {parse_err} | Raw AI Answer: {response_text}")
                return Response({
                    'error': 'Interpretation Conflict',
                    'detail': str(parse_err)
                }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


import logging
logger = logging.getLogger('nitemind')


class ParseTimetableView(APIView):
    """
    POST /api/planner/parse-timetable/
    Accepts an image or PDF of a class timetable and returns structured sessions.
    Body: multipart/form-data with 'file' field, or JSON with 'image' (base64 data-url).
    Returns: { sessions: [{title, session_type, start_time, end_time, subject}] }
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        import base64

        now = timezone.now()
        image_data = request.data.get('image', '')
        file_obj = request.FILES.get('file')

        if file_obj:
            ext = file_obj.name.lower().split('.')[-1] if '.' in file_obj.name else ''
            if ext == 'pdf':
                try:
                    import fitz  # PyMuPDF
                    pdf_bytes = file_obj.read()
                    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
                    page = doc[0]
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                    img_bytes = pix.tobytes('png')
                    b64 = base64.b64encode(img_bytes).decode('utf-8')
                    image_data = f'data:image/png;base64,{b64}'
                except Exception as e:
                    logger.error(f'[ParseTimetable] PDF render error: {e}')
                    return Response({'error': 'Could not read PDF. Try uploading an image instead.'}, status=400)
            else:
                raw = file_obj.read()
                mime = file_obj.content_type or 'image/png'
                b64 = base64.b64encode(raw).decode('utf-8')
                image_data = f'data:{mime};base64,{b64}'

        if not image_data:
            logger.error(f'[ParseTimetable] No image data. FILES={list(request.FILES.keys())} DATA_KEYS={list(request.data.keys())}')
            return Response({'error': 'No image or file provided.'}, status=400)

        system_prompt = f"""You are a timetable parser. Today is {now.strftime('%A, %B %d, %Y')}.

IMPORTANT: The timetable columns may be numbered periods with time ranges shown in the header row (e.g. "1 / 8:00-8:55", "5 / 13:00-13:55"). You MUST read the actual time ranges from the column headers — do not guess or invent times.

Days: Mo/Mon=0, Tu/Tue=1, We/Wed=2, Th/Thu=3, Fr/Fri=4, Sa/Sat=5, Su/Sun=6

Extract EVERY class cell visible. Each cell may contain a course code, group label, lecturer name, and room code. Create one session object per cell.

Return a JSON object with a single key "sessions" whose value is an array of session objects.
Each session object must have exactly these keys:
  "title": course code + group label if present (e.g. "CSM 258 Group 1"),
  "session_type": "class",
  "subject": just the course code (e.g. "CSM 258"),
  "day_of_week": integer 0-6 (0=Monday),
  "start_time": "HH:MM" 24-hour — taken directly from the column header time range,
  "end_time": "HH:MM" 24-hour — taken directly from the column header time range,
  "location": room/venue code or empty string"""
        ai = AIService()
        try:
            content_parts = [
                {'type': 'text', 'text': system_prompt},
                {'type': 'image_url', 'image_url': {'url': image_data}},
            ]
            messages = [{'role': 'user', 'content': content_parts}]

            # Try Groq qwen3.6-27b with JSON mode first — guarantees clean parseable output
            import os as _os, httpx as _httpx
            result = None
            groq_key = _os.getenv('GROQ_API_KEY', '')
            if groq_key:
                try:
                    import asyncio as _asyncio
                    async def _groq_vision():
                        async with _httpx.AsyncClient() as c:
                            r = await c.post(
                                'https://api.groq.com/openai/v1/chat/completions',
                                headers={'Authorization': f'Bearer {groq_key}', 'Content-Type': 'application/json'},
                                json={
                                    'model': 'qwen/qwen3.6-27b',
                                    'messages': messages,
                                    'max_tokens': 8192,
                                    'response_format': {'type': 'json_object'},
                                },
                                timeout=45,
                            )
                            return r
                    try:
                        resp = _asyncio.run(_groq_vision())
                    except RuntimeError:
                        from asgiref.sync import async_to_sync
                        resp = async_to_sync(_groq_vision)()
                    if resp.status_code == 200:
                        result = resp.json()['choices'][0]['message']['content']
                        logger.info('[ParseTimetable] ✓ Groq qwen3.6-27b (JSON mode)')
                    else:
                        logger.warning(f'[ParseTimetable] Groq JSON mode failed {resp.status_code}: {resp.text[:150]}')
                except Exception as ge:
                    logger.warning(f'[ParseTimetable] Groq direct call error: {ge}')

            # Fall back to generic AIService if Groq didn't work
            if not result:
                result = ai.chat_sync(messages, max_tokens=8192)

            logger.info(f'[ParseTimetable] AI raw response (first 500): {result[:500] if result else "EMPTY"}')

            # Parse the JSON — handle various formats the AI might return
            import re as _re
            import json as _json

            # Strip markdown code fences first
            clean = _re.sub(r'```(?:json)?\s*', '', result or '').strip()

            raw_sessions = None

            # Try to find a JSON array anywhere in the response
            match = _re.search(r'\[[\s\S]*\]', clean)
            if match:
                try:
                    raw_sessions = _json.loads(match.group(0))
                except _json.JSONDecodeError:
                    # Response was truncated — salvage complete objects from the partial array
                    partial = match.group(0)
                    # Find all complete {...} objects inside the array
                    objects = _re.findall(r'\{[^{}]*\}', partial)
                    raw_sessions = []
                    for obj_str in objects:
                        try:
                            raw_sessions.append(_json.loads(obj_str))
                        except Exception:
                            continue
                    if not raw_sessions:
                        logger.error(f'[ParseTimetable] JSON truncated and no complete objects salvaged. partial={partial[:300]}')
                        return Response({'error': 'Could not parse timetable. Try a clearer image.'}, status=400)
                    logger.warning(f'[ParseTimetable] JSON was truncated — salvaged {len(raw_sessions)} complete sessions')

            if raw_sessions is None:
                # Maybe the AI returned a JSON object with a sessions key
                obj_match = _re.search(r'\{[\s\S]*\}', clean)
                if obj_match:
                    try:
                        obj = _json.loads(obj_match.group(0))
                        raw_sessions = obj.get('sessions', [])
                    except Exception:
                        pass

            if not raw_sessions:
                logger.error(f'[ParseTimetable] No parseable JSON in AI response. clean={clean[:300]}')
                return Response({'error': 'Could not parse timetable. Try a clearer image.'}, status=400)

            # Convert day_of_week + time strings → ISO start/end for the current week.
            # Use naive datetimes (no timezone suffix) so the frontend's date-part
            # matching works correctly regardless of the user's local timezone.
            sessions = []
            import datetime as _dt
            week_monday = now.date() - _dt.timedelta(days=now.weekday())
            for s in raw_sessions:
                try:
                    dow = int(s.get('day_of_week', 0))
                    session_date = week_monday + _dt.timedelta(days=dow)
                    sh, sm = map(int, s['start_time'].split(':'))
                    eh, em = map(int, s['end_time'].split(':'))
                    # Naive ISO string — no timezone suffix — keeps the calendar
                    # date stable on the frontend regardless of the user's offset.
                    start_str = f"{session_date}T{sh:02d}:{sm:02d}:00"
                    end_str   = f"{session_date}T{eh:02d}:{em:02d}:00"
                    sessions.append({
                        'title': s.get('title', 'Class'),
                        'session_type': s.get('session_type', 'class'),
                        'subject': s.get('subject', ''),
                        'location': s.get('location', ''),
                        'start_time': start_str,
                        'end_time': end_str,
                        'status': 'scheduled',
                    })
                except Exception as ex:
                    logger.warning(f'[ParseTimetable] Skipped session: {ex}')
                    continue

            return Response({'sessions': sessions, 'count': len(sessions)})

        except Exception as e:
            logger.error(f'[ParseTimetable] Error: {e}')
            return Response({'error': str(e)}, status=500)


class SessionRemindersView(APIView):
    """
    POST /api/planner/send-reminders/
    Sends push notifications for sessions starting within the next 20 minutes.
    Safe to call frequently — deduplication is handled by a simple in-memory set
    on the server side (stateless — each Render dyno is independent, good enough for now).
    """
    permission_classes = [permissions.IsAuthenticated]

    _sent_ids: set = set()  # class-level dedup — reset on dyno restart

    def post(self, request):
        from users.push_service import PushService
        now = timezone.now()
        window_end = now + timedelta(minutes=20)

        upcoming = StudySession.objects.filter(
            user=request.user,
            start_time__gte=now,
            start_time__lte=window_end,
            status='scheduled',
        )

        sent = 0
    for session in upcoming:
        if session.id in SessionRemindersView._sent_ids:
            continue
        # Check user's notification preference for study_reminders
        prefs = getattr(session.user, 'notification_preferences', None) or {}
        if not prefs.get('study_reminders', True):
            continue
        minutes_away = max(0, int((session.start_time - now).total_seconds() / 60))
        label = 'now' if minutes_away < 2 else f'in {minutes_away} min'
        PushService.send_notification(
                user=request.user,
                title=f'⏰ {session.title} starts {label}!',
                body=f'{session.session_type.title()} · {session.start_time.strftime("%I:%M %p")}',
                link='/planner',
            )
            SessionRemindersView._sent_ids.add(session.id)
            sent += 1

        return Response({'sent': sent})


def send_planner_reminders():
    """
    Server-side scheduled task — sends push notifications for sessions starting
    within the next 20 minutes. Runs via Django-Q every 5 minutes.
    Uses DB-backed dedup (reminder_sent field) so it works across dynos/restarts.
    """
    from users.push_service import PushService
    import logging
    logger = logging.getLogger('nitemind')

    now = timezone.now()
    window_end = now + timedelta(minutes=20)

    upcoming = StudySession.objects.filter(
        start_time__gte=now,
        start_time__lte=window_end,
        status='scheduled',
        reminder_sent=False,
    ).select_related('user')

    sent = 0
    for session in upcoming:
        try:
            # Check user's notification preference for study_reminders
            prefs = getattr(session.user, 'notification_preferences', None) or {}
            if not prefs.get('study_reminders', True):
                session.reminder_sent = True
                session.save(update_fields=['reminder_sent'])
                continue
            minutes_away = max(0, int((session.start_time - now).total_seconds() / 60))
            label = 'now' if minutes_away < 2 else f'in {minutes_away} min'
            PushService.send_notification(
                user=session.user,
                title=f'⏰ {session.title} starts {label}!',
                body=f'{session.session_type.title()} · {session.start_time.strftime("%I:%M %p")}',
                link='/planner',
            )
            session.reminder_sent = True
            session.save(update_fields=['reminder_sent'])
            sent += 1
        except Exception as e:
            logger.error(f'Failed to send reminder for session {session.id}: {e}')

    if sent:
        logger.info(f'[PlannerReminders] Sent {sent} push notifications')
    return sent
