from django.db import models
from django.conf import settings


class ChatSession(models.Model):
    CONTEXT_CHOICES = [
        ('global', 'Global'),
        ('resource', 'Resource'),
        ('group', 'Group'),
    ]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='chat_sessions')
    context_type = models.CharField(max_length=20, choices=CONTEXT_CHOICES, default='global')
    resource = models.ForeignKey('library.Resource', on_delete=models.SET_NULL, null=True, blank=True)
    group = models.ForeignKey('groups.StudyGroup', on_delete=models.SET_NULL, null=True, blank=True)
    title = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.user.username} - {self.context_type} session"


class ChatMessage(models.Model):
    ROLE_CHOICES = [('user', 'User'), ('assistant', 'Assistant')]
    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    content = models.TextField()
    image = models.TextField(null=True, blank=True)  # Stores base64 data URIs or absolute URLs
    diagram_code = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
