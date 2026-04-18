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
    list_display = ('content_snippet', 'workspace', 'author', 'ai_badge', 'created_at')
    list_filter = ('is_ai', 'created_at', 'workspace')
    search_fields = ('content', 'author__username')
    readonly_fields = ('created_at',)

    def content_snippet(self, obj):
        return obj.content[:50] + '...' if len(obj.content) > 50 else obj.content
    content_snippet.short_description = 'Message'

    def ai_badge(self, obj):
        from django.utils.html import format_html
        if obj.is_ai:
            return format_html('<span style="background:#8B5CF6;color:white;padding:2px 8px;border-radius:12px;font-size:11px;">AI</span>')
        return "User"
    ai_badge.short_description = 'Type'
