from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
from datetime import timedelta


class User(AbstractUser):
    email = models.EmailField(unique=True)
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    bio = models.TextField(blank=True)
    university = models.CharField(max_length=200, blank=True)
    EDUCATION_LEVEL_CHOICES = [
        ('tertiary', 'Tertiary / University'),
        ('secondary', 'Secondary / Senior High School (Ghana)'),
    ]
    education_level = models.CharField(max_length=20, choices=EDUCATION_LEVEL_CHOICES, default='tertiary')
    study_streak = models.IntegerField(default=0)
    total_study_time = models.FloatField(default=0)  # hours
    weekly_goal_hours = models.FloatField(default=10)
    last_study_date = models.DateField(null=True, blank=True)
    onboarding_status = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # ── Notification Preferences ─────────────────────────────
    notification_preferences = models.JSONField(default=dict, blank=True, help_text='Stores per-type notification toggle preferences. Keys: study_reminders, streak_alerts, flashcard_due, group_activity, ai_nudges.')

    # ── Subscription / Freemium ──────────────────────────────
    is_premium = models.BooleanField(default=False, db_index=True)
    subscription_expires_at = models.DateTimeField(null=True, blank=True)
    paystack_customer_code = models.CharField(max_length=100, blank=True)
    total_resources_created = models.PositiveIntegerField(
        default=0,
        help_text='Lifetime count of resources created. Never decremented on delete — used for free tier gating.'
    )
    total_assignments_created = models.PositiveIntegerField(
        default=0,
        help_text='Lifetime count of assignments created. Used for free tier gating (3 free trials).'
    )
    # ── Gamification ─────────────────────────────────────────
    # xp field intentionally removed — tracked via ResourceProgress.xp_earned sum
    # to avoid requiring a new DB migration on existing deployments

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def __str__(self):
        return self.email

    @property
    def has_active_subscription(self) -> bool:
        """True if user is premium and subscription hasn't expired."""
        if not self.is_premium:
            return False
        if self.subscription_expires_at and self.subscription_expires_at < timezone.now():
            # Expired — auto-downgrade
            self.is_premium = False
            self.save(update_fields=['is_premium'])
            return False
        return True

    @property
    def notes_used(self) -> int:
        """Lifetime count of resources created. Never decrements on delete."""
        return self.total_resources_created

    FREE_NOTES_LIMIT = 5
    FREE_ASSIGNMENTS_LIMIT = 3

    def validate_streak(self):
        """Reset streak if last study date is too old. Called on user login/fetch."""
        today = timezone.now().date()
        if self.last_study_date and self.last_study_date < today - timedelta(days=1):
            if self.study_streak > 0:
                self.study_streak = 0
                self.save(update_fields=['study_streak'])
        return self.study_streak

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


class PushSubscription(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='push_subscriptions')
    endpoint = models.URLField(max_length=500, unique=True)
    p256dh = models.CharField(max_length=200)
    auth = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Push for {self.user.username} ({self.created_at})"


class GlobalConfig(models.Model):
    """Singleton model for global app settings."""
    app_name = models.CharField(max_length=100, default='Flow State')
    tutorial_video_url = models.URLField(
        blank=True, 
        help_text="YouTube/Vimeo embed URL (e.g. https://www.youtube.com/embed/XXXX)"
    )
    tutorial_video_file = models.FileField(
        upload_to='system/videos/', 
        blank=True, 
        null=True,
        help_text="Upload a local MP4 video file"
    )
    is_tutorial_enabled = models.BooleanField(default=True)
    maintenance_mode = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Global Configuration"
        verbose_name_plural = "Global Configuration"

    def __str__(self):
        return "System Settings"

    def save(self, *args, **kwargs):
        # Ensure only one instance exists
        if not self.pk and GlobalConfig.objects.exists():
            return
        super().save(*args, **kwargs)

    @classmethod
    def get_config(cls):
        obj, created = cls.objects.get_or_create(pk=1)
        return obj
