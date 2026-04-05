from django.contrib import admin
from django.utils.html import format_html
from .models import StudySession, Deadline


@admin.register(StudySession)
class StudySessionAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'subject', 'start_time', 'duration_display', 'status_badge', 'is_ai_suggested')
    list_filter = ('status', 'is_ai_suggested', 'start_time')
    search_fields = ('title', 'subject', 'user__email')
    readonly_fields = ('created_at',)
    date_hierarchy = 'start_time'

    def status_badge(self, obj):
        colors = {'scheduled': '#0EA5E9', 'active': '#10B981', 'completed': '#6B7280', 'skipped': '#EF4444'}
        color = colors.get(obj.status, '#6B7280')
        return format_html(
            '<span style="background:{};color:white;padding:2px 8px;border-radius:12px;font-size:11px;">{}</span>',
            color, obj.status
        )
    status_badge.short_description = 'Status'

    def duration_display(self, obj):
        if obj.start_time and obj.end_time:
            mins = int((obj.end_time - obj.start_time).total_seconds() / 60)
            return f'{mins}m'
        return '—'
    duration_display.short_description = 'Duration'


@admin.register(Deadline)
class DeadlineAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'subject', 'due_date', 'days_until_display', 'is_completed_badge')
    list_filter = ('is_completed', 'due_date')
    search_fields = ('title', 'subject', 'user__email')
    readonly_fields = ('created_at',)

    def days_until_display(self, obj):
        from django.utils import timezone
        delta = obj.due_date - timezone.now()
        days = delta.days
        if days < 0:
            return format_html('<span style="color:#EF4444;font-weight:600;">Overdue</span>')
        elif days <= 2:
            return format_html('<span style="color:#EF4444;font-weight:600;">{} days</span>', days)
        elif days <= 7:
            return format_html('<span style="color:#F59E0B;font-weight:600;">{} days</span>', days)
        return f'{days} days'
    days_until_display.short_description = 'Due In'

    def is_completed_badge(self, obj):
        if obj.is_completed:
            return format_html('<span style="color:#10B981;font-weight:600;">✓ Done</span>')
        return format_html('<span style="color:#F59E0B;">Pending</span>')
    is_completed_badge.short_description = 'Status'
