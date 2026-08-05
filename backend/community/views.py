from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.db.models import Count
from .models import Post, Comment, StudyEvent, StudyRoom, Story
from .serializers import PostSerializer, CommentSerializer, StudyEventSerializer, StudyRoomSerializer, StorySerializer


class PostListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = PostSerializer

    def get_queryset(self):
        qs = Post.objects.all().select_related('author').prefetch_related('comments', 'likes')
        post_type = self.request.query_params.get('type')
        tag = self.request.query_params.get('tag')
        if post_type:
            qs = qs.filter(post_type=post_type)
        if tag:
            qs = qs.filter(tags__contains=[tag])
        return qs

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def get_serializer_context(self):
        return {'request': self.request}


class PostDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = PostSerializer

    def get_queryset(self):
        return Post.objects.all().select_related('author').prefetch_related('comments', 'likes')

    def get_serializer_context(self):
        return {'request': self.request}


class LikePostView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        post = get_object_or_404(Post, pk=pk)
        if post.likes.filter(id=request.user.id).exists():
            post.likes.remove(request.user)
            return Response({'liked': False, 'like_count': post.likes.count()})
        post.likes.add(request.user)
        return Response({'liked': True, 'like_count': post.likes.count()})


class CommentListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = CommentSerializer

    def get_queryset(self):
        return Comment.objects.filter(post_id=self.kwargs['post_id'])

    def perform_create(self, serializer):
        post = get_object_or_404(Post, pk=self.kwargs['post_id'])
        serializer.save(author=self.request.user, post=post)

    def get_serializer_context(self):
        return {'request': self.request}


class LikeCommentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        comment = get_object_or_404(Comment, pk=pk)
        if comment.likes.filter(id=request.user.id).exists():
            comment.likes.remove(request.user)
        else:
            comment.likes.add(request.user)
        return Response({'like_count': comment.likes.count()})


class AIAnswerView(APIView):
    """Generate an AI answer for a question post."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        post = get_object_or_404(Post, pk=pk, post_type='question')
        # Don't generate twice
        if post.comments.filter(is_ai_answer=True).exists():
            return Response({'detail': 'AI answer already exists.'})
        try:
            from ai_assistant.services import AIService
            ai = AIService()
            answer = ai.chat([{
                'role': 'user',
                'content': f'A student asked: "{post.content}"\n\nProvide a clear, helpful study-focused answer in 2-3 paragraphs.'
            }])
            from django.contrib.auth import get_user_model
            User = get_user_model()
            # Use the post author's user as placeholder (AI answer flagged separately)
            comment = Comment.objects.create(
                post=post, author=request.user,
                content=answer, is_ai_answer=True
            )
            post.is_answered = True
            post.save(update_fields=['is_answered'])
            return Response(CommentSerializer(comment, context={'request': request}).data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class StudyRoomListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StudyRoomSerializer

    def get_queryset(self):
        return StudyRoom.objects.filter(is_active=True).prefetch_related('participants')

    def perform_create(self, serializer):
        room = serializer.save(host=self.request.user)
        room.participants.add(self.request.user)  # host auto-joins

    def get_serializer_context(self):
        return {'request': self.request}


class StudyRoomJoinLeaveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        room = get_object_or_404(StudyRoom, pk=pk, is_active=True)
        if room.participants.filter(id=request.user.id).exists():
            room.participants.remove(request.user)
            # Close room if host leaves and no one else
            if room.host_id == request.user.id and room.participants.count() == 0:
                room.is_active = False
                room.save()
            return Response({'joined': False, 'participant_count': room.participants.count()})
        if room.participants.count() >= room.max_participants:
            return Response({'error': 'Room is full.'}, status=status.HTTP_400_BAD_REQUEST)
        room.participants.add(request.user)
        return Response({'joined': True, 'participant_count': room.participants.count()})


class StudyEventListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StudyEventSerializer

    def get_queryset(self):
        return StudyEvent.objects.all()

    def perform_create(self, serializer):
        serializer.save(host=self.request.user)

    def get_serializer_context(self):
        return {'request': self.request}


class RegisterEventView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        event = get_object_or_404(StudyEvent, pk=pk)
        if event.registrations.filter(id=request.user.id).exists():
            event.registrations.remove(request.user)
            return Response({'registered': False})
        event.registrations.add(request.user)
        return Response({'registered': True})


class LeaderboardView(APIView):
    """Global & Community Leaderboard — Ranked strictly by Earned Study XP and effort."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from django.contrib.auth import get_user_model
        from library.models import ResourceProgress
        from django.db.models import Sum, Coalesce
        User = get_user_model()

        users = User.objects.filter(is_active=True).annotate(
            earned_xp=Coalesce(Sum('resources__progress_records__xp_earned'), 0)
        ).order_by('-earned_xp', '-study_streak', '-total_study_time')[:50]

        leaderboard = []
        for i, u in enumerate(users):
            earned_xp = getattr(u, 'earned_xp', 0)
            if earned_xp < 500:
                level_name = 'Freshman'
            elif earned_xp < 1500:
                level_name = 'Sophomore'
            elif earned_xp < 3500:
                level_name = 'Junior'
            elif earned_xp < 7000:
                level_name = 'Senior'
            else:
                level_name = 'Graduate'

            leaderboard.append({
                'rank': i + 1,
                'user_id': u.id,
                'username': u.username,
                'full_name': u.get_full_name() or u.username,
                'avatar_url': request.build_absolute_uri(u.avatar.url) if u.avatar else None,
                'earned_xp': earned_xp,
                'study_streak': u.study_streak,
                'total_study_hours': round(u.total_study_time, 1),
                'university': u.university or 'FlowState Scholar',
                'level_name': level_name,
                'is_me': u.id == request.user.id,
            })

        # Find current user's rank
        my_rank = next((l for l in leaderboard if l['is_me']), None)
        if not my_rank:
            all_users = list(User.objects.filter(is_active=True).order_by('-study_streak', '-total_study_time').values_list('id', flat=True))
            try:
                rank = all_users.index(request.user.id) + 1
            except ValueError:
                rank = len(all_users)
            
            my_earned_xp = ResourceProgress.objects.filter(user=request.user).aggregate(
                total=Sum('xp_earned')
            )['total'] or 0

            my_rank = {
                'rank': rank,
                'user_id': request.user.id,
                'username': request.user.username,
                'full_name': request.user.get_full_name() or request.user.username,
                'avatar_url': request.build_absolute_uri(request.user.avatar.url) if request.user.avatar else None,
                'earned_xp': my_earned_xp,
                'study_streak': request.user.study_streak,
                'total_study_hours': round(request.user.total_study_time, 1),
                'university': request.user.university or 'FlowState Scholar',
                'level_name': 'Freshman',
                'is_me': True,
            }

        return Response({'leaderboard': leaderboard, 'my_rank': my_rank})


class StoryListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StorySerializer

    def get_queryset(self):
        from django.utils import timezone
        # Filter: Only active (not expired) stories from workspaces the user belongs to
        user_workspaces = self.request.user.workspaces.all()
        return Story.objects.filter(
            workspace__in=user_workspaces,
            expires_at__gt=timezone.now()
        ).select_related('author', 'workspace')

    def perform_create(self, serializer):
        # Validation: Ensure user is a member of the workspace they're posting to
        workspace_id = self.request.data.get('workspace')
        from workspace.models import Workspace
        workspace = get_object_or_404(Workspace, id=workspace_id, memberships__user=self.request.user)
        serializer.save(author=self.request.user, workspace=workspace)

    def get_serializer_context(self):
        return {'request': self.request}
