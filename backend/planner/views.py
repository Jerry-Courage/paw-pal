from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from datetime import timedelta, datetime
from .models import StudySession, Deadline
from .serializers import StudySessionSerializer, DeadlineSerializer


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


class SmartScheduleView(APIView):
    """AI-powered schedule suggestions based on deadlines and available time."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        
        # 1. Fetch Deadlines (from Assignments)
        deadlines = Deadline.objects.filter(
            user=request.user, is_completed=False
        ).order_by('due_date')[:5]

        # 2. Fetch Workspace Tasks with due dates
        from workspace.models import WorkspaceTask
        ws_tasks = WorkspaceTask.objects.filter(
            workspace__memberships__user=request.user,
            due_date__isnull=False,
            status__in=['todo', 'in_progress']
        ).order_by('due_date')[:5]

        suggestions = []

        # Process standard deadlines
        for deadline in deadlines:
            days_left = max(1, (deadline.due_date - now).days)
            num_sessions = min(3, max(1, days_left // 2))
            interval = max(1, days_left // (num_sessions + 1))

            for i in range(1, num_sessions + 1):
                study_day = now + timedelta(days=interval * i)
                if study_day >= deadline.due_date: break
                suggestions.append({
                    'title': f'{deadline.subject or deadline.title} Study',
                    'subject': deadline.subject or '',
                    'deadline_title': deadline.title,
                    'type': 'assignment_deadline',
                    'suggested_date': study_day.date().isoformat(),
                    'duration_minutes': 60,
                    'urgency': 'high' if days_left <= 3 else 'medium',
                })

        # Process Workspace Tasks
        for task in ws_tasks:
            days_left = max(1, (task.due_date - now).days)
            suggestions.append({
                'title': f'Task: {task.title}',
                'subject': task.workspace.subject or '',
                'workspace_name': task.workspace.name,
                'deadline_title': f'Task in {task.workspace.name}',
                'type': 'workspace_task',
                'suggested_date': now.date().isoformat() if days_left < 1 else (now + timedelta(days=1)).date().isoformat(),
                'duration_minutes': 30,
                'urgency': 'high' if days_left <= 2 else 'medium',
            })

        # 3. Flashcard Review Suggestion
        try:
            from library.models import Flashcard
            due_count = Flashcard.objects.filter(owner=request.user, next_review__lte=now).count()
            if due_count > 0:
                suggestions.insert(0, {
                    'title': 'Flashcard Review',
                    'subject': 'Spaced Repetition',
                    'type': 'review',
                    'suggested_date': now.date().isoformat(),
                    'duration_minutes': 20,
                    'reason': f'{due_count} flashcards due',
                    'urgency': 'high',
                })
        except Exception: pass

        return Response({'suggestions': suggestions[:10]})
