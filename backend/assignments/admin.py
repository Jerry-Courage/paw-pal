from django.contrib import admin
from .models import Assignment


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'subject', 'status_badge', 'created_at')
    list_filter = ('status', 'created_at', 'subject')
    search_fields = ('title', 'user__email', 'subject')
    readonly_fields = ('created_at', 'updated_at', 'ai_response', 'ai_overview', 'ai_outline')
    ordering = ('-created_at',)

    def status_badge(self, obj):
        from django.utils.html import format_html
        colors = {
            'pending': '#F59E0B',   # Amber
            'solving': '#0EA5E9',   # Sky
            'completed': '#10B981', # Emerald
            'failed': '#EF4444',    # Red
        }
        color = colors.get(obj.status, '#6B7280')
        return format_html(
            '<span style="background:{};color:white;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:600;text-transform:uppercase;">{}</span>',
            color, obj.status
        )
    status_badge.short_description = 'Status'
