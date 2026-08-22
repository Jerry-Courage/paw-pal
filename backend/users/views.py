import logging
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger('nitemind')
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from .serializers import RegisterSerializer, UserSerializer, UpdateProfileSerializer

User = get_user_model()


class CustomLoginView(TokenObtainPairView):
    """Login view that auto-updates the daily streak on successful authentication."""
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            try:
                from rest_framework_simplejwt.tokens import RefreshToken
                refresh = RefreshToken(response.data['refresh'])
                user_id = refresh['user_id']
                user = User.objects.get(id=user_id)
                streak = user.daily_check_in()
                response.data['study_streak'] = streak
            except Exception:
                pass
        return response


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
            total += int((request.user.onboarding_status or {}).get('quiz_xp', 0))

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

    def update(self, request, *args, **kwargs):
        # Handle notification_preferences separately — stored inside onboarding_status
        notif_prefs = request.data.get('notification_preferences')
        if notif_prefs is not None:
            user = request.user
            if not user.onboarding_status:
                user.onboarding_status = {}
            user.onboarding_status['notification_preferences'] = notif_prefs
            user.save(update_fields=['onboarding_status'])
        return super().update(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        # Update streak on every profile fetch (daily check-in + stale reset)
        request.user.daily_check_in()

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
        # Clean up other stale subscriptions for this user (keep max 5)
        old_subs = PushSubscription.objects.filter(user=request.user).order_by('-created_at')
        if old_subs.count() > 5:
            for stale in old_subs[5:]:
                stale.delete()
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



class ChangePasswordView(APIView):
    """POST /api/auth/change-password/ — change current user's password."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from django.contrib.auth.password_validation import validate_password
        current = request.data.get('current_password', '')
        new_password = request.data.get('new_password', '')

        if not current or not new_password:
            return Response({'error': 'Both current_password and new_password are required.'},
                            status=status.HTTP_400_BAD_REQUEST)

        if not request.user.check_password(current):
            return Response({'error': 'Current password is incorrect.'},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_password(new_password, user=request.user)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        request.user.set_password(new_password)
        request.user.save(update_fields=['password'])
        return Response({'detail': 'Password changed successfully.'})


class ExportDataView(APIView):
    """GET /api/auth/export-data/ — download all user data as JSON."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        import json
        from django.http import JsonResponse
        from library.models import Resource, ResourceProgress

        user = request.user
        resources = list(Resource.objects.filter(owner=user).values(
            'id', 'title', 'subject', 'resource_type', 'created_at',
        ))
        progress = list(ResourceProgress.objects.filter(user=user).values(
            'resource_id', 'section_index', 'score', 'completed', 'xp_earned', 'updated_at',
        ))

        data = {
            'profile': {
                'email': user.email,
                'username': user.username,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'bio': user.bio,
                'university': user.university,
                'education_level': user.education_level,
                'weekly_goal_hours': user.weekly_goal_hours,
                'study_streak': user.study_streak,
                'total_study_time': user.total_study_time,
                'is_premium': user.is_premium,
                'xp': user.onboarding_status.get('quiz_xp', 0) if user.onboarding_status else 0,
                'created_at': user.created_at.isoformat(),
            },
            'resources': resources,
            'progress': progress,
        }
        response = JsonResponse(data)
        response['Content-Disposition'] = f'attachment; filename="flowstate-data-{user.username}.json"'
        return response


class DeleteAccountView(APIView):
    """POST /api/auth/delete-account/ — delete current user and all data."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        password = request.data.get('password', '')
        if not password:
            return Response({'error': 'Password required to delete account.'},
                            status=status.HTTP_400_BAD_REQUEST)

        user = request.user

        # OAuth users (Google/GitHub) don't have a usable password — allow
        # deletion with any non-empty password string as confirmation.
        if user.has_usable_password():
            if not user.check_password(password):
                return Response({'error': 'Incorrect password.'},
                                status=status.HTTP_400_BAD_REQUEST)

        try:
            user_id = user.id
            user_email = user.email
            user.delete()
            logger.info(f'Deleted account for user {user_id} ({user_email})')
        except Exception as e:
            logger.error(f'Delete account failed for {user.id}: {e}')
            import traceback
            traceback.print_exc()
            return Response({'error': f'Failed to delete account: {str(e)}'},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({'detail': 'Account deleted.'})


class RankingsView(APIView):
    """
    GET /api/auth/rankings/
    Returns three leaderboards:
      - earned:  Ranked by XP earned purely through studying (fair board)
      - total:   Ranked by total XP including purchased packs (all-time)
      - streak:  Ranked by current study streak (days)
    Each board includes top-100 + the current user's row (if outside top 100),
    plus the current user's rank on that board.
    """
    permission_classes = [permissions.IsAuthenticated]

    def _build_board(self, scored_list, sort_key, me_id, top_n=100):
        """Sort a list of dicts by sort_key desc, assign ranks, return top_n + me."""
        scored_list.sort(key=lambda x: (-int(x[sort_key] or 0), x['name']))
        for i, entry in enumerate(scored_list):
            entry[f'rank_{sort_key}'] = i + 1
        me_entry = next((e for e in scored_list if e['is_me']), None)
        top = scored_list[:top_n]
        if me_entry and me_entry[f'rank_{sort_key}'] > top_n:
            top.append(me_entry)
        return top, me_entry

    def get(self, request):
        from django.db.models import Sum
        from library.models import ResourceProgress

        # ── Aggregate earned XP per user ──────────────────────────
        earned_qs = (
            ResourceProgress.objects
            .values('user_id')
            .annotate(earned=Sum('xp_earned'))
        )
        earned_map = {row['user_id']: int(row['earned'] or 0) for row in earned_qs}

        # ── Aggregate quiz XP per user ─────────────────────────────
        quiz_users = User.objects.exclude(onboarding_status={}).only('id', 'onboarding_status')
        quiz_xp_map = {}
        for u in quiz_users:
            qxp = int((u.onboarding_status or {}).get('quiz_xp', 0))
            if qxp > 0:
                quiz_xp_map[u.id] = qxp

        # ── Build per-user list ────────────────────────────────────
        all_users = User.objects.only('id', 'email', 'first_name', 'last_name', 'study_streak')
        base_list = []
        for u in all_users:
            earned = int(earned_map.get(u.id, 0)) + int(quiz_xp_map.get(u.id, 0))
            display_name = u.get_full_name().strip() or u.email.split('@')[0]
            base_list.append({
                'user_id':   u.id,
                'name':      display_name,
                'initials':  (display_name[:2]).upper(),
                'streak':    int(u.study_streak or 0),
                'earned_xp': earned,
                'total_xp':  earned,
                'bonus_xp':  0,
                'is_me':     (u.id == request.user.id),
            })

        import copy
        me_id = request.user.id

        # ── Board A — Earned XP ────────────────────────────────────
        earned_board, me_earned = self._build_board(
            copy.deepcopy(base_list), 'earned_xp', me_id
        )

        # ── Board B — Streak ───────────────────────────────────────
        streak_board, me_streak = self._build_board(
            copy.deepcopy(base_list), 'streak', me_id
        )

        total_users = len(base_list)

        return Response({
            'total_users': total_users,
            'earned': {
                'board':   earned_board,
                'my_rank': me_earned['rank_earned_xp'] if me_earned else None,
                'my_xp':   me_earned['earned_xp'] if me_earned else 0,
            },
            'total': {
                'board':   earned_board,  # same as earned
                'my_rank': me_earned['rank_earned_xp'] if me_earned else None,
                'my_xp':   me_earned['earned_xp'] if me_earned else 0,
            },
            'streak': {
                'board':     streak_board,
                'my_rank':   me_streak['rank_streak'] if me_streak else None,
                'my_streak': me_streak['streak'] if me_streak else 0,
            },
        })




class FeedbackView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        rating = request.data.get('rating')
        feedback_text = request.data.get('feedback_text') or request.data.get('feedback')
        is_testimonial = request.data.get('is_testimonial', False)
        display_name = (request.data.get('display_name') or '').strip()

        if not rating or not feedback_text:
            return Response({'error': 'Rating and feedback text are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from .models import Feedback
            feedback = Feedback.objects.create(
                user=request.user,
                rating=int(rating),
                feedback_text=feedback_text,
                is_testimonial=bool(is_testimonial),
                display_name=display_name
            )
            # Award XP for giving feedback (+50 XP)
            try:
                from library.models import ResourceProgress, Resource
                resource = Resource.objects.filter(owner=request.user).first()
                if resource:
                    progress, _ = ResourceProgress.objects.get_or_create(user=request.user, resource=resource)
                    progress.xp_earned += 50
                    progress.save(update_fields=['xp_earned', 'updated_at'])
            except Exception:
                pass

            return Response({
                'success': True,
                'message': 'Feedback submitted successfully! Thank you for helping FlowState improve.',
                'id': feedback.id
            }, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class TestimonialsView(APIView):
    """Public list of approved testimonials for the landing page."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []  # Must be public — landing page is unauthenticated

    def get(self, request):
        from .models import Feedback
        testimonials = Feedback.objects.filter(
            is_testimonial=True,
            is_approved=True,
            rating__gte=4,
        ).select_related('user')[:30]

        data = [{
            'id': t.id,
            'name': t.public_name,
            'rating': t.rating,
            'feedback_text': t.feedback_text,
            'created_at': t.created_at.strftime('%B %Y'),
        } for t in testimonials]

        return Response({'testimonials': data})
