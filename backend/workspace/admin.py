from django.contrib import admin
from django.utils.html import format_html
from django.db.models import Count
from .models import Workspace, WorkspaceMember, WorkspaceMessage


class WorkspaceMemberInline(admin.TabularInline):
    model = WorkspaceMember
    extra = 0
    readonly_fields = ('user', 'role', 'joined_at', 'last_seen')
    can_delete = False


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'subject', 'owner_link', 'invite_code',
        'member_count', 'message_count', 'active_badge', 'created_at'
    )
    search_fields = ('name', 'subject', 'invite_code', 'owner__email')
    list_filter = ('is_active', 'created_at')
    readonly_fields = ('created_at', 'invite_code')
    inlines = [WorkspaceMemberInline]

    def owner_link(self, obj):
        return format_html(
            '<a href="/admin/users/user/{}/change/">{}</a>',
            obj.owner.id, obj.owner.email
        )
    owner_link.short_description = 'Owner'

    def member_count(self, obj):
        return obj.members.count()
    member_count.short_description = 'Members'

    def message_count(self, obj):
        return obj.messages.count()
    message_count.short_description = 'Messages'

    def active_badge(self, obj):
        if obj.is_active:
            return format_html('<span style="color:#10B981;font-weight:600;">● Active</span>')
        return format_html('<span style="color:#6B7280;">Inactive</span>')
    active_badge.short_description = 'Status'

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _member_count=Count('members', distinct=True),
            _message_count=Count('messages', distinct=True),
        )


@admin.register(WorkspaceMember)
class WorkspaceMemberAdmin(admin.ModelAdmin):
    list_display = ('workspace', 'user_link', 'role_badge', 'joined_at', 'last_seen')
    list_filter = ('role', 'joined_at')
    search_fields = ('workspace__name', 'user__username', 'user__email')

    def user_link(self, obj):
        return format_html(
            '<a href="/admin/users/user/{}/change/">{}</a>',
            obj.user.id, obj.user.email
        )
    user_link.short_description = 'User'

    def role_badge(self, obj):
        colors = {'owner': '#f97316', 'editor': '#0EA5E9', 'viewer': '#6B7280'}
        color = colors.get(obj.role, '#6B7280')
        return format_html(
            '<span style="color:{};font-weight:600;">{}</span>',
            color, obj.role.upper()
        )
    role_badge.short_description = 'Role'


@admin.register(WorkspaceMessage)
class WorkspaceMessageAdmin(admin.ModelAdmin):
    list_display = ('content_snippet', 'workspace_link', 'author_link', 'type_badge', 'has_audio', 'created_at')
    list_filter = ('is_ai', 'created_at', 'workspace')
    search_fields = ('content', 'author__username', 'workspace__name')
    readonly_fields = ('created_at',)
    date_hierarchy = 'created_at'

    def content_snippet(self, obj):
        text = obj.content[:60] + '…' if len(obj.content) > 60 else obj.content
        return text
    content_snippet.short_description = 'Message'

    def workspace_link(self, obj):
        return format_html(
            '<a href="/admin/workspace/workspace/{}/change/">{}</a>',
            obj.workspace.id, obj.workspace.name
        )
    workspace_link.short_description = 'Workspace'

    def author_link(self, obj):
        if obj.author:
            return format_html(
                '<a href="/admin/users/user/{}/change/">{}</a>',
                obj.author.id, obj.author.username
            )
        return '—'
    author_link.short_description = 'Author'

    def type_badge(self, obj):
        if obj.is_ai:
            return format_html(
                '<span style="background:#8B5CF6;color:white;padding:2px 8px;border-radius:12px;font-size:11px;">🤖 AI</span>'
            )
        return format_html('<span style="color:#9CA3AF;font-size:11px;">👤 User</span>')
    type_badge.short_description = 'Type'

    def has_audio(self, obj):
        if obj.audio_file or obj.audio_data:
            return format_html('<span style="color:#10B981;">🎙️ Yes</span>')
        return '—'
    has_audio.short_description = 'Audio'
