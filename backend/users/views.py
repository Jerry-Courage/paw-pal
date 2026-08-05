from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from .serializers import RegisterSerializer, UserSerializer, UpdateProfileSerializer

User = get_user_model()


class AwardXPView(APIView):
    """
    POST /api/auth/award-xp/
    Body: { "amount": 50, "reason": "Section 3 quiz", "resource_id": 123 }
    Awards XP to the user by adding it to the ResourceProgress for that resource.
    Creates a ResourceProgress if one doesn't exist yet.
    Returns the new total XP.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from django.db import models as db_models
        amount = int(request.data.get('amount', 0))
        resource_id = request.data.get('resource_id')
        reason = request.data.get('reason', 'Study activity')

        if amount <= 0 or amount > 500:
            return Response({'error': 'Invalid XP amount'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if resource_id:
                from library.models import Resource, ResourceProgress
                resource = Resource.objects.filter(id=resource_id).first()
                if resource:
                    progress, _ = ResourceProgress.objects.get_or_create(
                        user=request.user,
                        resource=resource,
                    )
                    progress.xp_earned += amount
                    progress.save(update_fields=['xp_earned', 'updated_at'])
            else:
                # No resource — create a dummy progress entry on first resource if exists
                # or just log it (XP still shows via aggregate)
                from library.models import ResourceProgress
                # Get any resource owned by user and award there
                from library.models import Resource
                resource = Resource.objects.filter(owner=request.user).first()
                if resource:
                    progress, _ = ResourceProgress.objects.get_or_create(
                        user=request.user, resource=resource
                    )
                    progress.xp_earned += amount
                    progress.save(update_fields=['xp_earned', 'updated_at'])

            # Calculate new total XP
            from library.models import ResourceProgress
            from django.db.models import Sum
            total = ResourceProgress.objects.filter(user=request.user).aggregate(
                total=Sum('xp_earned')
            )['total'] or 0

            return Response({'xp_awarded': amount, 'total_xp': total, 'reason': reason})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


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


class PushSubscriptionView(APIView):
    """Register or update a push subscription for the current user."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from .models import PushSubscription
        endpoint = request.data.get('endpoint')
        keys = request.data.get('keys', {})
        p256dh = keys.get('p256dh')
        auth = keys.get('auth')

        if not endpoint or not p256dh or not auth:
            return Response({'error': 'Missing subscription details'}, status=status.HTTP_400_BAD_REQUEST)

        sub, created = PushSubscription.objects.update_or_create(
            endpoint=endpoint,
            defaults={
                'user': request.user,
                'p256dh': p256dh,
                'auth': auth
            }
        )
        return Response({'status': 'subscribed', 'id': sub.id})


from asgiref.sync import sync_to_async

class UpdateOnboardingView(APIView):
    """Mark a specific tour as completed in the onboarding_status."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        tour_id = request.data.get('tour_id')
        if not tour_id:
            return Response({'error': 'tour_id required'}, status=status.HTTP_400_BAD_REQUEST)

        user = request.user
        if not user.onboarding_status:
            user.onboarding_status = {}
        user.onboarding_status[tour_id] = True
        user.save(update_fields=['onboarding_status'])
        return Response({'onboarding_status': user.onboarding_status})


class GlobalConfigView(APIView):
    """Fetch public app configuration."""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        from .models import GlobalConfig
        config = GlobalConfig.get_config()
        
        # Determine video source
        video_url = config.tutorial_video_url
        if config.tutorial_video_file:
            # If a local file is uploaded, provide its absolute URL
            video_url = request.build_absolute_uri(config.tutorial_video_file.url)

        return Response({
            'app_name': config.app_name,
            'tutorial_video_url': video_url,
            'is_tutorial_enabled': config.is_tutorial_enabled,
            'maintenance_mode': config.maintenance_mode,
        })


class RankingsView(APIView):
    """
    GET /api/auth/rankings/
    Returns the global XP leaderboard — top 100 users ranked by total XP.
    Also includes the current user's rank, even if outside top 100.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from django.db.models import Sum
        from library.models import ResourceProgress
        from .models import UserObservation

        # Aggregate earned XP per user from ResourceProgress
        earned_qs = (
            ResourceProgress.objects
            .values('user_id')
            .annotate(earned=Sum('xp_earned'))
        )
        earned_map = {row['user_id']: row['earned'] or 0 for row in earned_qs}

        # Get all observation records (bonus + spent XP adjustments)
        obs_qs = UserObservation.objects.filter(key__in=['bonus_xp', 'spent_xp']).select_related('user')
        obs_map: dict = {}
        for obs in obs_qs:
            uid = obs.user_id
            if uid not in obs_map:
                obs_map[uid] = {'bonus_xp': 0, 'spent_xp': 0}
            try:
                obs_map[uid][obs.key] = int(obs.value)
            except (ValueError, TypeError):
                pass

        # Build combined user list
        all_users = User.objects.only('id', 'email', 'first_name', 'last_name', 'study_streak')
        user_scores = []
        for u in all_users:
            earned = earned_map.get(u.id, 0)
            bonus  = obs_map.get(u.id, {}).get('bonus_xp', 0)
            spent  = obs_map.get(u.id, {}).get('spent_xp', 0)
            total  = max(0, earned + bonus - spent)
            display_name = u.get_full_name().strip() or u.email.split('@')[0]
            user_scores.append({
                'user_id':  u.id,
                'name':     display_name,
                'initials': (display_name[:2]).upper(),
                'streak':   u.study_streak or 0,
                'total_xp': total,
                'is_me':    (u.id == request.user.id),
            })

        # Sort descending by XP, then by name as tiebreaker
        user_scores.sort(key=lambda x: (-x['total_xp'], x['name']))

        # Assign ranks (1-based)
        for i, entry in enumerate(user_scores):
            entry['rank'] = i + 1

        # Find current user's entry
        me_entry = next((e for e in user_scores if e['is_me']), None)

        # Return top 100 + current user (if outside top 100)
        top_100 = user_scores[:100]
        if me_entry and me_entry['rank'] > 100:
            top_100.append(me_entry)

        return Response({
            'leaderboard': top_100,
            'my_rank':     me_entry['rank'] if me_entry else None,
            'my_xp':       me_entry['total_xp'] if me_entry else 0,
            'total_users': len(user_scores),
        })

