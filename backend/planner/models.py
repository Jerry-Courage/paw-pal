from django.db import models
from django.conf import settings


class StudySession(models.Model):
    STATUS_CHOICES = [('scheduled', 'Scheduled'), ('active', 'Active'), ('completed', 'Completed'), ('skipped', 'Skipped')]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='study_sessions')
    title = models.CharField(max_length=300)
    subject = models.CharField(max_length=200, blank=True)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    duration_minutes = models.IntegerField(default=60)
    location = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    is_ai_suggested = models.BooleanField(default=False)
    resource = models.ForeignKey('library.Resource', on_delete=models.SET_NULL, null=True, blank=True, related_name='study_sessions')
    assignment = models.ForeignKey('assignments.Assignment', on_delete=models.SET_NULL, null=True, blank=True, related_name='sessions')
    group = models.ForeignKey('groups.StudyGroup', on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['start_time']

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if self.start_time and self.end_time:
            try:
                start = self.start_time
                end = self.end_time
                # Handle string values (from API requests before full_clean)
                if isinstance(start, str):
                    from django.utils.dateparse import parse_datetime
                    start = parse_datetime(start)
                if isinstance(end, str):
                    from django.utils.dateparse import parse_datetime
                    end = parse_datetime(end)
                if start and end and end > start:
                    delta = end - start
                    self.duration_minutes = max(1, int(delta.total_seconds() / 60))
            except Exception:
                pass
        super().save(*args, **kwargs)


class Deadline(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='deadlines')
    title = models.CharField(max_length=300)
    subject = models.CharField(max_length=200, blank=True)
    due_date = models.DateTimeField()
    is_completed = models.BooleanField(default=False)
    assignment = models.OneToOneField('assignments.Assignment', on_delete=models.SET_NULL, null=True, blank=True, related_name='deadline')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['due_date']

    def __str__(self):
        return self.title
