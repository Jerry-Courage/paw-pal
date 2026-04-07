from django.contrib import admin
from django.utils.html import format_html
from .models import StudyGroup, GroupMembership, GroupSession, GroupTask, GroupMessage


class GroupMembershipInline(admin.TabularInline):
    model = GroupMembership
    extra = 0
    fields = ('user', 'role', 'joined_at')
    readonly_fields = ('joined_at',)


@admin.register(StudyGroup)
class StudyGroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'subject', 'member_count_display', 'is_public_badge', 'is_verified_badge', 'created_at')
    list_filter = ('is_public', 'is_verified', 'created_at')
    search_fields = ('name', 'description', 'subject', 'owner__email')
    readonly_fields = ('created_at',)
    inlines = [GroupMembershipInline]
    actions = ['verify_groups']

    def member_count_display(self, obj):
        count = obj.memberships.count()
        return format_html('<span style="font-weight:600;color:#0EA5E9;">{}</span>', count)
    member_count_display.short_description = 'Members'

    def is_public_badge(self, obj):
        if obj.is_public:
            return format_html('<span style="color:#10B981;font-weight:600;">🌐 Public</span>')
        return format_html('<span style="color:#6B7280;">🔒 Private</span>')
    is_public_badge.short_description = 'Visibility'

    def is_verified_badge(self, obj):
        if obj.is_verified:
            return format_html('<span style="color:#0EA5E9;font-weight:600;">✓ Verified</span>')
        return '—'
    is_verified_badge.short_description = 'Verified'

    def verify_groups(self, request, queryset):
        queryset.update(is_verified=True)
        self.message_user(request, f'{queryset.count()} groups verified.')
    verify_groups.short_description = 'Mark selected groups as verified'


@admin.register(GroupSession)
class GroupSessionAdmin(admin.ModelAdmin):
    list_display = ('title', 'group', 'scheduled_at', 'duration_minutes', 'is_active_badge', 'attendee_count')
    list_filter = ('is_active', 'scheduled_at')
    search_fields = ('title', 'group__name')

    def is_active_badge(self, obj):
        if obj.is_active:
            return format_html('<span style="color:#10B981;font-weight:600;">● Live</span>')
        return format_html('<span style="color:#6B7280;">○ Scheduled</span>')
    is_active_badge.short_description = 'Status'

    def attendee_count(self, obj):
        return obj.attendees.count()
    attendee_count.short_description = 'Attendees'


@admin.register(GroupTask)
class GroupTaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'group', 'assigned_to', 'is_completed')
    list_filter = ('is_completed', 'group')


@admin.register(GroupMessage)
class GroupMessageAdmin(admin.ModelAdmin):
    list_display = ('content_preview', 'group', 'sender', 'is_ai_badge', 'created_at')
    list_filter = ('is_ai', 'created_at')
    search_fields = ('content', 'group__name', 'sender__email')
    readonly_fields = ('created_at',)

    def content_preview(self, obj):
        return obj.content[:60] + '...' if len(obj.content) > 60 else obj.content
    content_preview.short_description = 'Message'

    def is_ai_badge(self, obj):
        if obj.is_ai:
            return format_html('<span style="color:#0EA5E9;font-weight:600;">✦ AI</span>')
        return '—'
    is_ai_badge.short_description = 'AI'
