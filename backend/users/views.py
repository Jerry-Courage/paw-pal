from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from .serializers import RegisterSerializer, UserSerializer, UpdateProfileSerializer

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user, context={'request': request}).data,
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }, status=status.HTTP_201_CREATED)


class MeView(generics.RetrieveUpdateAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return UpdateProfileSerializer
        return UserSerializer

    def get_object(self):
        return self.request.user

    def get_serializer_context(self):
        return {'request': self.request}

    def retrieve(self, request, *args, **kwargs):
        # Validate streak in real-time whenever user fetches their profile (dashboard/nexus)
        request.user.validate_streak()

        # Check streak at risk on profile fetch (throttled by checking existing notif)
        try:
            from .notifications import notify_streak_at_risk
            from .models import Notification
            from django.utils import timezone
            today = timezone.now().date()
            already_notified = Notification.objects.filter(
                user=request.user, type='streak',
                created_at__date=today
            ).exists()
            if not already_notified and request.user.study_streak > 0:
                notify_streak_at_risk(request.user)
        except Exception:
            pass
        return super().retrieve(request, *args, **kwargs)


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data['refresh']
            token = RefreshToken(refresh_token)
            token.blacklist()
        except Exception:
            pass
        return Response({'detail': 'Logged out.'}, status=status.HTTP_200_OK)


class AnalyticsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from .analytics import get_user_analytics
        data = get_user_analytics(request.user)
        return Response(data)


class LogStudyView(APIView):
    """Directly log study time (called by Focus Timer)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        minutes = request.data.get('minutes')
        if not minutes or float(minutes) <= 0:
            return Response({'error': 'minutes required'}, status=status.HTTP_400_BAD_REQUEST)
        request.user.log_study_time(float(minutes))
        return Response({
            'study_streak': request.user.study_streak,
            'total_study_time': request.user.total_study_time,
        })


class SetWeeklyGoalView(APIView):
    """Update the user's weekly study goal."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        hours = request.data.get('hours')
        if hours is None or float(hours) <= 0:
            return Response({'error': 'hours required'}, status=status.HTTP_400_BAD_REQUEST)
        request.user.weekly_goal_hours = float(hours)
        request.user.save(update_fields=['weekly_goal_hours'])
        return Response({'weekly_goal_hours': request.user.weekly_goal_hours})


class NotificationsView(APIView):
    """List notifications and mark all as read."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from .models import Notification
        notifs = Notification.objects.filter(user=request.user)[:50]
        data = [
            {
                'id': n.id,
                'type': n.type,
                'title': n.title,
                'body': n.body,
                'link': n.link,
                'is_read': n.is_read,
                'created_at': n.created_at.isoformat(),
            }
            for n in notifs
        ]
        unread_count = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({'results': data, 'unread_count': unread_count})

    def patch(self, request):
        """Mark all as read."""
        from .models import Notification
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({'detail': 'All marked as read.'})


class NotificationDetailView(APIView):
    """Mark a single notification as read or delete it."""
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        from .models import Notification
        try:
            n = Notification.objects.get(pk=pk, user=request.user)
            n.is_read = True
            n.save(update_fields=['is_read'])
            return Response({'detail': 'Marked as read.'})
        except Notification.DoesNotExist:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

    def delete(self, request, pk):
        from .models import Notification
        try:
            Notification.objects.get(pk=pk, user=request.user).delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Notification.DoesNotExist:
            return Response({'error': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)


from asgiref.sync import sync_to_async

class UpdateOnboardingView(APIView):
    """Mark a specific tour as completed in the onboarding_status."""
    permission_classes = [permissions.IsAuthenticated]

    async def post(self, request):
        tour_id = request.data.get('tour_id')
        if not tour_id:
            return Response({'error': 'tour_id required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Define a helper for the sync DB operation
        @sync_to_async
        def update_user_status(user_id, t_id):
            user = User.objects.get(id=user_id)
            if not user.onboarding_status:
                user.onboarding_status = {}
            user.onboarding_status[t_id] = True
            user.save(update_fields=['onboarding_status'])
            return user.onboarding_status

        new_status = await update_user_status(request.user.id, tour_id)
        return Response({'onboarding_status': new_status})
