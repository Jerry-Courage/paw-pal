from rest_framework import generics, permissions, status
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

    def get_queryset(self):
        qs = StudySession.objects.filter(user=self.request.user)
        start = self.request.query_params.get('start')
        end = self.request.query_params.get('end')
        if start:
            qs = qs.filter(start_time__gte=start)
        if end:
            qs = qs.filter(start_time__lte=end)
        return qs

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

        now = timezone.now()
        system_prompt = f"""
        Current Time: {now.isoformat()}
        Today is {now.strftime('%A, %B %d, %Y')}.
        
        Extract study session details from the user prompt. 
        Detect if it's RECURRING (e.g. "every", "weekly", "daily").
        
        Return ONLY a single valid JSON object. 
        STRICT: No comments (//) inside the JSON. No markdown blocks.
        
        Schema:
        {{
          "title": "mission title",
          "subject": "subject name or empty",
          "session_type": "study, class, exam, assignment, or personal",
          "start_time": "ISO 8601 string",
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
            response_text = ai.chat([
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
