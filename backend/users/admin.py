from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.html import format_html
from unfold.admin import ModelAdmin
from .models import User, Notification, PushSubscription, GlobalConfig


@admin.register(GlobalConfig)
class GlobalConfigAdmin(ModelAdmin):
    list_display = ('app_name', 'is_tutorial_enabled', 'maintenance_mode', 'updated_at')
    
    fieldsets = (
        ('App Branding', {
            'fields': (('app_name', 'is_tutorial_enabled'), 'maintenance_mode'),
        }),
        ('Onboarding Walkthrough', {
            'description': 'Choose either an embed URL (YouTube/Vimeo) OR upload an MP4 file directly.',
            'fields': ('tutorial_video_url', 'tutorial_video_file'),
        }),
        ('System Metadata', {
            'fields': ('updated_at',),
            'classes': ('collapse',),
        }),
    )
    readonly_fields = ('updated_at',)

    def has_add_permission(self, request):
        return not GlobalConfig.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(PushSubscription)
class PushSubscriptionAdmin(ModelAdmin):
    list_display = ('user', 'endpoint_short', 'created_at')
    search_fields = ('user__email', 'endpoint')
    
    def endpoint_short(self, obj):
        return obj.endpoint[:50] + '...'
    endpoint_short.short_description = 'Endpoint'


@admin.register(User)
class UserAdmin(BaseUserAdmin, ModelAdmin):
    list_display = ('avatar_preview', 'email', 'username', 'full_name', 'university', 'study_streak', 'total_study_time', 'is_active', 'date_joined')
    list_display_links = ('email', 'username')
    list_filter = ('is_active', 'is_staff', 'date_joined', 'university')
    search_fields = ('email', 'username', 'first_name', 'last_name', 'university')
    ordering = ('-date_joined',)
    readonly_fields = ('date_joined', 'last_login', 'study_streak', 'total_study_time')

    fieldsets = (
        ('Account', {'fields': ('email', 'username', 'password')}),
        ('Personal Info', {'fields': ('first_name', 'last_name', 'avatar', 'bio', 'university')}),
        ('Study Stats', {'fields': ('study_streak', 'total_study_time', 'weekly_goal_hours')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions'), 'classes': ('collapse',)}),
        ('Dates', {'fields': ('date_joined', 'last_login'), 'classes': ('collapse',)}),
    )

    def avatar_preview(self, obj):
        if obj.avatar:
            return format_html('<img src="{}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" />', obj.avatar.url)
        initials = (obj.first_name[:1] + obj.last_name[:1]).upper() or obj.username[:2].upper()
        return format_html(
            '<div style="width:32px;height:32px;border-radius:50%;background:#0EA5E9;color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;">{}</div>',
            initials
        )
    avatar_preview.short_description = ''

    def full_name(self, obj):
        return obj.get_full_name() or '—'
    full_name.short_description = 'Name'


@admin.register(Notification)
class NotificationAdmin(ModelAdmin):
    list_display = ('user', 'type', 'title', 'is_read', 'created_at')
    list_filter = ('type', 'is_read', 'created_at')
    search_fields = ('user__email', 'title', 'body')
    ordering = ('-created_at',)
    readonly_fields = ('created_at',)
    actions = ['mark_read', 'mark_unread']

    def mark_read(self, request, queryset):
        queryset.update(is_read=True)
    mark_read.short_description = 'Mark selected as read'

    def mark_unread(self, request, queryset):
        queryset.update(is_read=False)
    mark_unread.short_description = 'Mark selected as unread'
