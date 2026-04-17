from django.db import models
from django.conf import settings
import uuid


class Workspace(models.Model):
    name = models.CharField(max_length=300)
    subject = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='owned_workspaces')
    members = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='workspaces', through='WorkspaceMember')
    invite_code = models.CharField(max_length=12, unique=True, blank=True)
    resources = models.ManyToManyField('library.Resource', blank=True, related_name='workspaces')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.invite_code:
            self.invite_code = uuid.uuid4().hex[:8].upper()
        super().save(*args, **kwargs)


class WorkspaceMember(models.Model):
    ROLE_CHOICES = [('owner', 'Owner'), ('editor', 'Editor'), ('viewer', 'Viewer')]
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='editor')
    joined_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('workspace', 'user')


class WorkspaceMessage(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='messages')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True)
    content = models.TextField()
    is_ai = models.BooleanField(default=False)
    # New: Link to a resource if it's a "Shared Note" card
    pinned_resource = models.ForeignKey('library.Resource', on_delete=models.SET_NULL, null=True, blank=True, related_name='workspace_mentions')
    shared_assignment = models.ForeignKey('assignments.Assignment', on_delete=models.SET_NULL, null=True, blank=True, related_name='workspace_shares')
    audio_file = models.FileField(upload_to='workspace_audio/', null=True, blank=True)
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='replies')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
