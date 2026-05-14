from django.db import models
from django.conf import settings


class Assignment(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('error', 'Error'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='assignments')
    title = models.CharField(max_length=300)
    subject = models.CharField(max_length=200, blank=True)
    instructions = models.TextField()  # The assignment question/instructions
    
    # Primary file (usually PDF) - kept for backward compatibility
    file = models.FileField(upload_to='assignments/', null=True, blank=True)
    
    resources = models.ManyToManyField('library.Resource', blank=True, related_name='assignments')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')

    # AI generated output
    ai_response = models.TextField(blank=True)
    ai_overview = models.TextField(blank=True)
    ai_outline = models.JSONField(default=list)
    chat_history = models.JSONField(default=list)

    due_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class AssignmentSource(models.Model):
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name='sources')
    file = models.FileField(upload_to='assignment_sources/')
    file_type = models.CharField(max_length=50) # 'pdf', 'image', etc.
    created_at = models.DateTimeField(auto_now_add=True)
