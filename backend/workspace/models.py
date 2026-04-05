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
    assignment = models.ForeignKey('assignments.Assignment', on_delete=models.SET_NULL, null=True, blank=True, related_name='workspaces')
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


class WorkspaceDocument(models.Model):
    workspace = models.OneToOneField(Workspace, on_delete=models.CASCADE, related_name='document')
    content = models.TextField(blank=True, default='')  # Markdown content
    version = models.IntegerField(default=1)
    last_edited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Doc: {self.workspace.name}'


class DocumentVersion(models.Model):
    """Snapshot of document at a point in time."""
    document = models.ForeignKey(WorkspaceDocument, on_delete=models.CASCADE, related_name='versions')
    content = models.TextField()
    saved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    version = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class WorkspaceMessage(models.Model):
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='messages')
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True)
    content = models.TextField()
    is_ai = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']


class WorkspaceTask(models.Model):
    STATUS_CHOICES = [('todo', 'To Do'), ('in_progress', 'In Progress'), ('done', 'Done')]
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='tasks')
    title = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='todo')
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='workspace_tasks')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='created_tasks')
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['status', 'order', 'created_at']


class WorkspaceFile(models.Model):
    """Files uploaded directly to a workspace (PDFs, docs, images)."""
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name='files')
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    file = models.FileField(upload_to='workspace_files/')
    name = models.CharField(max_length=300)
    file_size = models.BigIntegerField(default=0)
    extracted_text = models.TextField(blank=True)  # AI-readable text from PDF
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name
