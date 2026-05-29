from django.contrib import admin
from django.utils.html import format_html
from django.db.models import Count
from .models import ChatSession, ChatMessage


class ChatMessageInline(admin.TabularInline):
    model = ChatMessage
    extra = 0
    fields = ('role_badge_display', 'content_preview', 'created_at')
    readonly_fields = ('role_badge_display', 'content_preview', 'created_at')
    can_delete = False
    max_num = 20

    def role_badge_display(self, obj):
        if obj.role == 'assistant':
            return format_html('<span style="color:#8B5CF6;font-weight:600;">🤖 AI</span>')
        return format_html('<span style="color:#0EA5E9;font-weight:600;">👤 User</span>')
    role_badge_display.short_description = 'Role'

    def content_preview(self, obj):
        return obj.content[:120] + '…' if len(obj.content) > 120 else obj.content
    content_preview.short_description = 'Content'


@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = (
        'title_display', 'user_link', 'context_type_badge',
        'message_count', 'resource_link', 'updated_at'
    )
    list_filter = ('context_type', 'updated_at')
    search_fields = ('title', 'user__email', 'user__username')
    readonly_fields = ('created_at', 'updated_at')
    inlines = [ChatMessageInline]
    date_hierarchy = 'updated_at'

    def title_display(self, obj):
        return obj.title or format_html('<em style="color:#6B7280;">Untitled Chat</em>')
    title_display.short_description = 'Title'

    def user_link(self, obj):
        return format_html(
            '<a href="/admin/users/user/{}/change/">{}</a>',
            obj.user.id, obj.user.email
        )
    user_link.short_description = 'User'

    def context_type_badge(self, obj):
        colors = {'global': '#6B7280', 'resource': '#0EA5E9', 'group': '#10B981'}
        icons = {'global': '🌐', 'resource': '📄', 'group': '👥'}
        color = colors.get(obj.context_type, '#6B7280')
        return format_html(
            '<span style="color:{};">{} {}</span>',
            color, icons.get(obj.context_type, ''), obj.context_type
        )
    context_type_badge.short_description = 'Context'

    def message_count(self, obj):
        count = obj.messages.count()
        user_msgs = obj.messages.filter(role='user').count()
        return format_html(
            '<span title="{} user messages">{} msgs</span>',
            user_msgs, count
        )
    message_count.short_description = 'Messages'

    def resource_link(self, obj):
        if obj.resource:
            return format_html(
                '<a href="/admin/library/resource/{}/change/">{}</a>',
                obj.resource.id, obj.resource.title[:30]
            )
        return '—'
    resource_link.short_description = 'Resource'

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        qs = self.get_queryset(request)
        extra_context['ai_stats'] = {
            'total_sessions': qs.count(),
            'total_messages': ChatMessage.objects.count(),
            'user_messages': ChatMessage.objects.filter(role='user').count(),
            'ai_messages': ChatMessage.objects.filter(role='assistant').count(),
        }
        return super().changelist_view(request, extra_context=extra_context)


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ('role_badge', 'content_preview', 'session_link', 'created_at')
    list_filter = ('role', 'created_at')
    search_fields = ('content', 'session__user__email')
    readonly_fields = ('created_at',)
    date_hierarchy = 'created_at'

    def role_badge(self, obj):
        if obj.role == 'assistant':
            return format_html('<span style="color:#8B5CF6;font-weight:600;">🤖 AI</span>')
        return format_html('<span style="color:#0EA5E9;font-weight:600;">👤 User</span>')
    role_badge.short_description = 'Role'

    def content_preview(self, obj):
        return obj.content[:100] + '…' if len(obj.content) > 100 else obj.content
    content_preview.short_description = 'Content'

    def session_link(self, obj):
        return format_html(
            '<a href="/admin/ai_assistant/chatsession/{}/change/">{}</a>',
            obj.session.id, obj.session.title or f'Session #{obj.session.id}'
        )
    session_link.short_description = 'Session'
