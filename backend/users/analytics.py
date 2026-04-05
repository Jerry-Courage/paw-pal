from django.db.models import Count, Sum, Avg
from django.utils import timezone
from datetime import timedelta


def get_user_analytics(user):
    """Compute study analytics for a user."""
    now = timezone.now()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    # Import here to avoid circular imports
    from planner.models import StudySession
    from library.models import Resource, Flashcard

    # Study sessions this week
    sessions_week = StudySession.objects.filter(
        user=user,
        status='completed',
        start_time__gte=week_ago
    )

    # Study time per day (last 7 days)
    daily_study = []
    for i in range(6, -1, -1):
        day = now - timedelta(days=i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        day_sessions = StudySession.objects.filter(
            user=user, status='completed',
            start_time__gte=day_start, start_time__lt=day_end
        )
        total_mins = sum(
            (s.end_time - s.start_time).total_seconds() / 60
            for s in day_sessions if s.end_time
        )
        daily_study.append({
            'day': day.strftime('%a'),
            'date': day.strftime('%m/%d'),
            'minutes': round(total_mins),
            'hours': round(total_mins / 60, 1),
        })

    # Subject breakdown
    subject_sessions = StudySession.objects.filter(
        user=user, status='completed', start_time__gte=month_ago
    ).exclude(subject='').values('subject').annotate(count=Count('id'))

    subject_data = [{'subject': s['subject'], 'sessions': s['count']} for s in subject_sessions[:6]]

    # Flashcard stats
    total_flashcards = Flashcard.objects.filter(owner=user).count()
    reviewed_flashcards = Flashcard.objects.filter(owner=user, repetitions__gt=0).count()
    due_flashcards = Flashcard.objects.filter(
        owner=user
    ).filter(
        next_review__isnull=True
    ).count() + Flashcard.objects.filter(
        owner=user, next_review__lte=now
    ).count()

    # Resource stats
    total_resources = Resource.objects.filter(owner=user).count()
    resources_with_summary = Resource.objects.filter(owner=user).exclude(ai_summary='').count()

    # Advanced AI Stats
    from ai_assistant.models import ChatMessage
    from library.models import PodcastSession, ResourceImage
    
    total_podcasts = PodcastSession.objects.filter(owner=user).count()
    total_chat_messages = ChatMessage.objects.filter(session__user=user, role='user').count()
    total_vision_images = ResourceImage.objects.filter(resource__owner=user).count()

    # Weekly goal progress
    week_minutes = sum(
        (s.end_time - s.start_time).total_seconds() / 60
        for s in sessions_week if s.end_time
    )
    week_hours = round(week_minutes / 60, 1)
    goal_progress = min(100, round((week_hours / max(user.weekly_goal_hours, 1)) * 100))

    # Best study day
    best_day = max(daily_study, key=lambda x: x['minutes'], default=None)

    return {
        'streak': user.study_streak,
        'total_study_hours': round(user.total_study_time, 1),
        'week_hours': week_hours,
        'goal_hours': user.weekly_goal_hours,
        'goal_progress': goal_progress,
        'daily_study': daily_study,
        'subject_breakdown': subject_data,
        'flashcards': {
            'total': total_flashcards,
            'reviewed': reviewed_flashcards,
            'due': due_flashcards,
        },
        'resources': {
            'total': total_resources,
            'with_ai_summary': resources_with_summary,
        },
        'ai_stats': {
            'podcasts': total_podcasts,
            'chats': total_chat_messages,
            'vision': total_vision_images,
            'mastered_flashcards': Flashcard.objects.filter(owner=user, repetitions__gte=3).count()
        },
        'best_day': best_day,
        'sessions_this_week': sessions_week.count(),
    }
