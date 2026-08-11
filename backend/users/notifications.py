"""Utility to create notifications from anywhere in the app."""

# Map notification types to the user's notification_preferences key
NOTIFICATION_PREF_MAP = {
    'streak': 'streak_alerts',
    'flashcard': 'flashcard_due',
    'group': 'group_activity',
    'ai_nudge': 'ai_nudges',
    'deadline': 'study_reminders',
    'resource': 'study_reminders',
    # 'system' has no toggle — always sent
}


def _is_enabled(user, notif_type: str) -> bool:
    """Return True if this notification type is enabled for the user."""
    pref_key = NOTIFICATION_PREF_MAP.get(notif_type)
    if not pref_key:
        return True  # unknown type → allow (safety net)
    prefs = (getattr(user, 'onboarding_status', None) or {}).get('notification_preferences', {})
    # Default to True if key missing (opt-out model)
    return prefs.get(pref_key, True)


def create_notification(user, type: str, title: str, body: str, link: str = ''):
    """Create a notification and trigger a Push notification if possible."""
    if not _is_enabled(user, type):
        return  # user has this type disabled

    try:
        from .models import Notification
        from .push_service import PushService
        import threading
        
        # 1. Save to Database
        notif = Notification.objects.create(user=user, type=type, title=title, body=body, link=link)
        
        # 2. Trigger WS Push (Real-time)
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"user_notifications_{user.id}",
            {
                "type": "send_notification",
                "notification": {
                    "id": notif.id,
                    "type": notif.type,
                    "title": notif.title,
                    "body": notif.body,
                    "link": notif.link,
                    "is_read": notif.is_read,
                    "created_at": notif.created_at.isoformat(),
                }
            }
        )

        # 3. Trigger Push (Async to avoid blocking)
        def send_push():
            PushService.send_notification(user, title, body, link)
            
        thread = threading.Thread(target=send_push)
        thread.daemon = True
        thread.start()
        
    except Exception as e:
        import logging
        logger = logging.getLogger('nitemind')
        logger.error(f"Failed to create notification for {user.email}: {e}")


def notify_streak_at_risk(user):
    """Warn user their streak is at risk (call from a scheduled task or login)."""
    from django.utils import timezone
    from datetime import timedelta
    if user.last_study_date and user.last_study_date < timezone.now().date() - timedelta(days=1):
        create_notification(
            user, 'streak',
            'Streak at Risk!',
            f'You have a {user.study_streak}-day streak. Study today to keep it going!',
            '/planner',
        )


def notify_resource_ready(user, resource_title: str, resource_id: int):
    create_notification(
        user, 'resource',
        'Resource Ready',
        f'"{resource_title}" has been processed and is study-ready.',
        f'/library/{resource_id}',
    )


def notify_deadline_approaching(user, deadline_title: str, days_left: int):
    create_notification(
        user, 'deadline',
        'Deadline Approaching',
        f'"{deadline_title}" is due in {days_left} day{"s" if days_left != 1 else ""}.',
        '/planner',
    )
