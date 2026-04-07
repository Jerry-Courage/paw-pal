from django.contrib import admin
from .models import Workspace, WorkspaceMember, WorkspaceBlock, WorkspaceMessage, WorkspaceTask, WorkspaceFile


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'subject', 'invite_code', 'created_at')
    search_fields = ('name', 'owner__email')
    readonly_fields = ('invite_code', 'created_at', 'updated_at')


@admin.register(WorkspaceBlock)
class WorkspaceBlockAdmin(admin.ModelAdmin):
    list_display = ('block_type', 'workspace', 'order', 'updated_at')
    list_filter = ('block_type', 'workspace')


@admin.register(WorkspaceTask)
class WorkspaceTaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'workspace', 'status', 'assigned_to', 'created_at')
    list_filter = ('status', 'workspace')


@admin.register(WorkspaceFile)
class WorkspaceFileAdmin(admin.ModelAdmin):
    list_display = ('name', 'workspace', 'uploaded_by', 'file_size', 'created_at')
    list_filter = ('workspace',)
