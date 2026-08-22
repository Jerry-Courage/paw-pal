import re
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from .models import StudyGroup, GroupMembership, GroupSession, GroupTask, GroupMessage, GroupDocument, QuizRoom, QuizQuestion, QuizPlayer, QuizAnswer, BattleHistory
from .serializers import (
    StudyGroupSerializer, GroupSessionSerializer,
    GroupTaskSerializer, GroupMessageSerializer, GroupDocumentSerializer,
    QuizRoomSerializer, QuizQuestionSerializer, BattleHistorySerializer,
)
from ai_assistant.services import AIService

_quiz_columns_fixed = False

def _ensure_quiz_columns():
    global _quiz_columns_fixed
    if _quiz_columns_fixed:
        return
    from django.db import connection
    cursor = connection.cursor()
    for col, typedef in [
        ('ready', 'BOOLEAN DEFAULT FALSE NOT NULL'),
        ('correct_count', 'INTEGER DEFAULT 0 NOT NULL'),
        ('total_time', 'DOUBLE PRECISION DEFAULT 0 NOT NULL'),
    ]:
        cursor.execute("SELECT 1 FROM information_schema.columns WHERE table_name='groups_quizplayer' AND column_name=%s", [col])
        if not cursor.fetchone():
            cursor.execute(f'ALTER TABLE groups_quizplayer ADD COLUMN {col} {typedef}')
            print(f'[Quiz Fix] Added missing column groups_quizplayer.{col}')
    for col, typedef in [
        ('explanation', 'TEXT DEFAULT \'\' NOT NULL'),
    ]:
        cursor.execute("SELECT 1 FROM information_schema.columns WHERE table_name='groups_quizquestion' AND column_name=%s", [col])
        if not cursor.fetchone():
            cursor.execute(f'ALTER TABLE groups_quizquestion ADD COLUMN {col} {typedef}')
            print(f'[Quiz Fix] Added missing column groups_quizquestion.{col}')
    cursor.execute("SELECT 1 FROM information_schema.tables WHERE table_name='groups_battlehistory' LIMIT 1")
    if not cursor.fetchone():
        cursor.execute('''CREATE TABLE IF NOT EXISTS groups_battlehistory (
            id BIGSERIAL PRIMARY KEY,
            score INTEGER DEFAULT 0 NOT NULL,
            "rank" INTEGER DEFAULT 0 NOT NULL,
            correct_count INTEGER DEFAULT 0 NOT NULL,
            total_questions INTEGER DEFAULT 0 NOT NULL,
            best_streak INTEGER DEFAULT 0 NOT NULL,
            avg_time DOUBLE PRECISION DEFAULT 0 NOT NULL,
            xp_earned INTEGER DEFAULT 0 NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            room_id INTEGER REFERENCES groups_quizroom(id) ON DELETE SET NULL,
                player_id INTEGER REFERENCES users_user(id) ON DELETE CASCADE
        )''')
        print('[Quiz Fix] Created missing groups_battlehistory table')
    _quiz_columns_fixed = True


class GroupListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StudyGroupSerializer

    def get_queryset(self):
        filter_type = self.request.query_params.get('filter', 'my')
        if filter_type == 'all':
            return StudyGroup.objects.filter(is_public=True).select_related('owner').prefetch_related('memberships')
        return StudyGroup.objects.filter(memberships__user=self.request.user).select_related('owner').prefetch_related('memberships')

    def perform_create(self, serializer):
        group = serializer.save(owner=self.request.user)
        GroupMembership.objects.create(user=self.request.user, group=group, role='admin')

    def get_serializer_context(self):
        return {'request': self.request}


class GroupDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StudyGroupSerializer

    def get_queryset(self):
        return StudyGroup.objects.all()

    def get_serializer_context(self):
        return {'request': self.request}


class JoinLeaveGroupView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        group = get_object_or_404(StudyGroup, pk=pk)
        membership, created = GroupMembership.objects.get_or_create(user=request.user, group=group)
        if created:
            return Response({'detail': 'Joined group.'}, status=status.HTTP_201_CREATED)
        return Response({'detail': 'Already a member.'})

    def delete(self, request, pk):
        group = get_object_or_404(StudyGroup, pk=pk)
        GroupMembership.objects.filter(user=request.user, group=group).delete()
        return Response({'detail': 'Left group.'}, status=status.HTTP_204_NO_CONTENT)


class GroupSessionListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = GroupSessionSerializer

    def get_queryset(self):
        group_id = self.kwargs['group_id']
        return GroupSession.objects.filter(group_id=group_id)

    def perform_create(self, serializer):
        group = get_object_or_404(StudyGroup, pk=self.kwargs['group_id'])
        serializer.save(group=group)


class GroupTaskView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = GroupTaskSerializer

    def get_queryset(self):
        return GroupTask.objects.filter(group_id=self.kwargs['group_id'])

    def perform_create(self, serializer):
        group = get_object_or_404(StudyGroup, pk=self.kwargs['group_id'])
        serializer.save(group=group)


class GroupTaskDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = GroupTaskSerializer

    def get_queryset(self):
        return GroupTask.objects.filter(group_id=self.kwargs['group_id'])


class GroupMessageView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = GroupMessageSerializer

    def get_queryset(self):
        return GroupMessage.objects.filter(group_id=self.kwargs['group_id'])

    def perform_create(self, serializer):
        group = get_object_or_404(StudyGroup, pk=self.kwargs['group_id'])
        msg = serializer.save(group=group, sender=self.request.user)

        # Auto AI response if message mentions Flow, Flow AI, or STT variations like 'night'
        trigger_pattern = (
            r'\b(flow(?:ai|state)?|flow\s+ai|flow\s+state)\b'
            r'|(?:^|[\s,!?])(?:hey|yo|ok|okay|hi)\s+(flow|flowai|flowstate)\b'
            r'|\b(nite(?:ai|mind)?|nite\s+ai|nite\s+mind)\b'
            r'|\b(night\s*ai|night\s*mind|nightmind)\b'
            r'|\bflow[,!?]'
            r'|\bassistant\b'
        )
        if re.search(trigger_pattern, msg.content, re.IGNORECASE):
            ai = AIService()
            try:
                reply = ai.group_chat_assist(group.name, '', msg.content)
                GroupMessage.objects.create(group=group, sender=self.request.user, content=reply, is_ai=True)
            except Exception:
                pass

    def get_serializer_context(self):
        return {'request': self.request}


class GroupDocumentView(generics.ListCreateAPIView):
    """List and create documents for a group."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = GroupDocumentSerializer

    def get_queryset(self):
        return GroupDocument.objects.filter(group_id=self.kwargs['group_id'])

    def perform_create(self, serializer):
        group = get_object_or_404(StudyGroup, pk=self.kwargs['group_id'])
        serializer.save(group=group, author=self.request.user)


class GroupDocumentDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or delete a single group document."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = GroupDocumentSerializer

    def get_queryset(self):
        return GroupDocument.objects.filter(group_id=self.kwargs['group_id'])


# ── Quiz Battle Views ─────────────────────────────────────────────────────────

class QuizRoomCreateView(APIView):
    """POST /api/groups/quiz/  — create a quiz room with questions."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        title       = request.data.get('title', 'Quiz Battle').strip()
        time_per_q  = int(request.data.get('time_per_q', 20))
        questions   = request.data.get('questions', [])

        if not questions:
            return Response({'error': 'At least one question is required.'}, status=400)

        room = QuizRoom.objects.create(
            title=title,
            host=request.user,
            time_per_q=time_per_q,
        )
        for i, q in enumerate(questions):
            QuizQuestion.objects.create(
                room    = room,
                order   = i,
                text    = q.get('text', ''),
                opt_a   = q.get('opt_a', ''),
                opt_b   = q.get('opt_b', ''),
                opt_c   = q.get('opt_c', ''),
                opt_d   = q.get('opt_d', ''),
                correct = q.get('correct', 'A'),
            )
        # Host auto-joins as first player
        QuizPlayer.objects.create(room=room, user=request.user)
        return Response(QuizRoomSerializer(room).data, status=201)


class QuizRoomJoinView(APIView):
    """POST /api/groups/quiz/join/  — join by 6-digit PIN."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        pin = request.data.get('pin', '').strip()
        room = get_object_or_404(QuizRoom, pin=pin)

        if room.status != 'lobby':
            return Response({'error': 'Game already in progress.'}, status=400)

        player, created = QuizPlayer.objects.get_or_create(room=room, user=request.user)
        return Response(QuizRoomSerializer(room).data)


class QuizRoomDetailView(APIView):
    """GET /api/groups/quiz/<pin>/  — poll room state."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pin):
        room = get_object_or_404(QuizRoom, pin=pin)
        return Response(QuizRoomSerializer(room).data)


class QuizQuestionsView(APIView):
    """GET /api/groups/quiz/<pin>/questions/  — host-only: get all questions with answers."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pin):
        room = get_object_or_404(QuizRoom, pin=pin, host=request.user)
        qs   = room.questions.all()
        return Response(QuizQuestionSerializer(qs, many=True).data)


class QuizGenerateView(APIView):
    """
    POST /api/groups/quiz/generate/
    Body: { resource_id, title?, count?, time_per_q? }

    Calls AIService.generate_quiz() on the given library resource,
    converts the AI output format into QuizQuestion rows, and returns
    a ready-to-join QuizRoom (host is auto-added as first player).

    AI output shape:
      [{ question, options: [a, b, c, d], correct_answer: <exact string>, explanation }]

    Our model shape:
      opt_a/b/c/d  +  correct: 'A'|'B'|'C'|'D'
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        _ensure_quiz_columns()
        from library.models import Resource
        from ai_assistant.services import AIService
        from django.db.models import Q

        resource_id = request.data.get('resource_id')
        topic       = request.data.get('topic', '').strip()
        count       = int(request.data.get('count', 10))
        time_per_q  = int(request.data.get('time_per_q', 20))
        title       = request.data.get('title', '').strip()
        difficulty  = request.data.get('difficulty', 'medium')

        if not resource_id and not topic:
            return Response({'error': 'Please select a resource, upload a file, or enter a topic.'}, status=400)

        # Map difficulty to level
        level_map = {'easy': 'highschool', 'medium': 'undergrad', 'hard': 'graduate'}
        level = level_map.get(difficulty, 'undergrad')

        ai = AIService()
        if topic:
            if not title:
                title = f'{topic} — Quiz Battle'
            raw_questions = ai.generate_quiz_from_topic(topic, fmt='mcq', level=level, count=count)
        else:
            resource = get_object_or_404(
                Resource,
                Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True))
            )
            if not title:
                title = f'{resource.title} — Quiz Battle'
            raw_questions = ai.generate_quiz(resource, fmt='mcq', level=level, count=count)

        if not raw_questions:
            return Response({'error': 'AI could not generate questions. Try a different topic or resource.'}, status=500)

        room = QuizRoom.objects.create(title=title, host=request.user, time_per_q=time_per_q)
        QuizPlayer.objects.create(room=room, user=request.user)

        for i, q in enumerate(raw_questions):
            opts = q.get('options', [])
            # Pad to 4 if AI returned fewer
            while len(opts) < 4:
                opts.append('—')
            opt_a, opt_b, opt_c, opt_d = opts[0], opts[1], opts[2], opts[3]

            correct_str = q.get('correct_answer', '')
            # Map the exact answer string back to A/B/C/D
            correct_letter = 'A'
            for letter, opt in zip(['A','B','C','D'], [opt_a, opt_b, opt_c, opt_d]):
                if opt.strip().lower() == correct_str.strip().lower():
                    correct_letter = letter
                    break

            QuizQuestion.objects.create(
                room=room, order=i,
                text=q.get('question', ''),
                opt_a=opt_a, opt_b=opt_b, opt_c=opt_c, opt_d=opt_d,
                correct=correct_letter,
                explanation=q.get('explanation', ''),
            )

        return Response(QuizRoomSerializer(room).data, status=201)


class QuizRoomCreateView(APIView):
    """POST /api/groups/quiz/  — create a quiz room with questions (manual)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        title       = request.data.get('title', 'Quiz Battle').strip()
        time_per_q  = int(request.data.get('time_per_q', 20))
        questions   = request.data.get('questions', [])

        if not questions:
            return Response({'error': 'At least one question is required.'}, status=400)

        room = QuizRoom.objects.create(
            title=title,
            host=request.user,
            time_per_q=time_per_q,
        )
        for i, q in enumerate(questions):
            QuizQuestion.objects.create(
                room        = room,
                order       = i,
                text        = q.get('text', ''),
                opt_a       = q.get('opt_a', ''),
                opt_b       = q.get('opt_b', ''),
                opt_c       = q.get('opt_c', ''),
                opt_d       = q.get('opt_d', ''),
                correct     = q.get('correct', 'A'),
                explanation = q.get('explanation', ''),
            )
        QuizPlayer.objects.create(room=room, user=request.user)
        return Response(QuizRoomSerializer(room).data, status=201)


class BattleHistoryView(APIView):
    """GET /api/groups/battle-history/ — get user's battle history."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        history = BattleHistory.objects.filter(player=request.user).select_related('room')[:20]
        return Response(BattleHistorySerializer(history, many=True).data)
