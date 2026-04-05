"""Utility to create notifications from anywhere in the app."""
from django.contrib.auth import get_user_model


def create_notification(user, type: str, title: str, body: str, link: str = ''):
    """Create a notification for a user. Silently fails if something goes wrong."""
    try:
        from .models import Notification
        Notification.objects.create(user=user, type=type, title=title, body=body, link=link)
    except Exception:
        pass


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
