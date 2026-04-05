from django.contrib import admin
from django.utils.html import format_html
from .models import ChatSession, ChatMessage


class ChatMessageInline(admin.TabularInline):
    model = ChatMessage
    extra = 0
    fields = ('role', 'content_preview', 'created_at')
    readonly_fields = ('role', 'content_preview', 'created_at')
    can_delete = False
    max_num = 20

    def content_preview(self, obj):
        return obj.content[:100] + '...' if len(obj.content) > 100 else obj.content
    content_preview.short_description = 'Content'


@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ('title_display', 'user', 'context_type_badge', 'message_count', 'updated_at')
    list_filter = ('context_type', 'updated_at')
    search_fields = ('title', 'user__email')
    readonly_fields = ('created_at', 'updated_at')
    inlines = [ChatMessageInline]

    def title_display(self, obj):
        return obj.title or 'Untitled Chat'
    title_display.short_description = 'Title'

    def context_type_badge(self, obj):
        colors = {'global': '#6B7280', 'resource': '#0EA5E9', 'group': '#10B981'}
        color = colors.get(obj.context_type, '#6B7280')
        icons = {'global': '🌐', 'resource': '📄', 'group': '👥'}
        return format_html(
            '<span style="color:{};">{} {}</span>',
            color, icons.get(obj.context_type, ''), obj.context_type
        )
    context_type_badge.short_description = 'Context'

    def message_count(self, obj):
        return obj.messages.count()
    message_count.short_description = 'Messages'
