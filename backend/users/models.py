from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
from datetime import timedelta


class User(AbstractUser):
    email = models.EmailField(unique=True)
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    bio = models.TextField(blank=True)
    university = models.CharField(max_length=200, blank=True)
    study_streak = models.IntegerField(default=0)
    total_study_time = models.FloatField(default=0)  # hours
    weekly_goal_hours = models.FloatField(default=10)
    last_study_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return self.email

    def log_study_time(self, minutes: float):
        """Call this when a study session completes."""
        today = timezone.now().date()
        hours = minutes / 60

        self.total_study_time += hours

        # Robust streak logic
        if not self.last_study_date:
            self.study_streak = 1
        elif self.last_study_date == today:
            pass # Already studied today, no change
        elif self.last_study_date == today - timedelta(days=1):
            self.study_streak += 1  # Consecutive day
        elif self.last_study_date < today - timedelta(days=1):
            self.study_streak = 1  # Streak broken
        
        self.last_study_date = today
        self.save(update_fields=['total_study_time', 'study_streak', 'last_study_date'])


NOTIFICATION_TYPES = [
    ('ai_nudge', 'AI Nudge'),
    ('streak', 'Streak Alert'),
    ('deadline', 'Deadline'),
    ('flashcard', 'Flashcard Due'),
    ('group', 'Group Activity'),
    ('resource', 'Resource Ready'),
    ('system', 'System'),
]


class Notification(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    type = models.CharField(max_length=30, choices=NOTIFICATION_TYPES, default='system')
    title = models.CharField(max_length=200)
    body = models.TextField()
    link = models.CharField(max_length=300, blank=True)  # optional deep link
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user.email} — {self.title}'
