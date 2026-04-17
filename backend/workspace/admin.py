from django.contrib import admin
from .models import Workspace, WorkspaceMember, WorkspaceMessage

@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ('name', 'subject', 'owner', 'invite_code', 'is_active', 'created_at')
    search_fields = ('name', 'subject', 'invite_code')
    list_filter = ('is_active', 'created_at')

@admin.register(WorkspaceMember)
class WorkspaceMemberAdmin(admin.ModelAdmin):
    list_display = ('workspace', 'user', 'role', 'joined_at', 'last_seen')
    list_filter = ('role', 'joined_at')
    search_fields = ('workspace__name', 'user__username')

@admin.register(WorkspaceMessage)
class WorkspaceMessageAdmin(admin.ModelAdmin):
    list_display = ('workspace', 'author', 'is_ai', 'created_at')
    list_filter = ('is_ai', 'created_at')
    search_fields = ('content',)
