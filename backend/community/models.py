from django.db import models
from django.conf import settings


class Post(models.Model):
    POST_TYPES = [
        ('general', 'General'),
        ('question', 'Question'),
        ('resource', 'Resource Share'),
        ('achievement', 'Achievement'),
        ('tip', 'Study Tip'),
    ]

    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='posts')
    post_type = models.CharField(max_length=20, choices=POST_TYPES, default='general')
    content = models.TextField()
    resource = models.ForeignKey('library.Resource', on_delete=models.SET_NULL, null=True, blank=True)
    tags = models.JSONField(default=list)
    likes = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='liked_posts')
    is_answered = models.BooleanField(default=False)  # for questions
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.author.username}: {self.content[:50]}"


class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    content = models.TextField()
    is_ai_answer = models.BooleanField(default=False)
    likes = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='liked_comments')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']


class StudyRoom(models.Model):
    """Live study rooms — users join to study together."""
    host = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='hosted_rooms')
    title = models.CharField(max_length=200)
    subject = models.CharField(max_length=100, blank=True)
    resource = models.ForeignKey('library.Resource', on_delete=models.SET_NULL, null=True, blank=True)
    participants = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='study_rooms')
    max_participants = models.IntegerField(default=20)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class StudyEvent(models.Model):
    TYPE_CHOICES = [
        ('workshop', 'Workshop'),
        ('exam_prep', 'Exam Prep'),
        ('session', 'Study Session'),
        ('challenge', 'Challenge'),
        ('ama', 'Ask Me Anything'),
    ]
    title = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    event_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='session')
    host = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    group = models.ForeignKey('groups.StudyGroup', on_delete=models.SET_NULL, null=True, blank=True)
    scheduled_at = models.DateTimeField()
    max_participants = models.IntegerField(default=50)
    registrations = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='registered_events')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['scheduled_at']
