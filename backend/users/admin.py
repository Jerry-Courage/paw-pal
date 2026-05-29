from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.html import format_html
from django.utils import timezone
from django.db.models import Count, Q
from django.contrib import messages
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
    list_display = (
        'avatar_preview', 'email', 'username', 'full_name',
        'university', 'subscription_badge', 'expires_display',
        'notes_count', 'study_streak', 'is_active', 'date_joined'
    )
    list_display_links = ('email', 'username')
    list_filter = (
        'is_active', 'is_staff', 'is_premium',
        'date_joined', 'university'
    )
    search_fields = ('email', 'username', 'first_name', 'last_name', 'university')
    ordering = ('-date_joined',)
    readonly_fields = (
        'date_joined', 'last_login', 'study_streak',
        'total_study_time', 'notes_count_display', 'subscription_status_display'
    )
    actions = ['grant_premium_30', 'grant_premium_365', 'revoke_premium']

    fieldsets = (
        ('Account', {'fields': ('email', 'username', 'password')}),
        ('Personal Info', {'fields': ('first_name', 'last_name', 'avatar', 'bio', 'university')}),
        ('Study Stats', {'fields': ('study_streak', 'total_study_time', 'weekly_goal_hours', 'notes_count_display')}),
        ('Subscription', {
            'fields': ('is_premium', 'subscription_expires_at', 'paystack_customer_code', 'subscription_status_display'),
            'description': 'Manage premium access. Use admin actions to grant/revoke in bulk.'
        }),
        ('Permissions', {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions'),
            'classes': ('collapse',)
        }),
        ('Dates', {'fields': ('date_joined', 'last_login'), 'classes': ('collapse',)}),
    )

    # ── Display helpers ──────────────────────────────────────

    def avatar_preview(self, obj):
        if obj.avatar:
            return format_html(
                '<img src="{}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" />',
                obj.avatar.url
            )
        initials = (obj.first_name[:1] + obj.last_name[:1]).upper() or obj.username[:2].upper()
        return format_html(
            '<div style="width:32px;height:32px;border-radius:50%;background:#f97316;color:white;'
            'display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;">{}</div>',
            initials
        )
    avatar_preview.short_description = ''

    def full_name(self, obj):
        return obj.get_full_name() or '—'
    full_name.short_description = 'Name'

    def subscription_badge(self, obj):
        if obj.has_active_subscription:
            return format_html(
                '<span style="background:#f97316;color:white;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;">⭐ PREMIUM</span>'
            )
        return format_html(
            '<span style="background:#374151;color:#9CA3AF;padding:2px 10px;border-radius:12px;font-size:11px;">Free</span>'
        )
    subscription_badge.short_description = 'Plan'

    def expires_display(self, obj):
        if not obj.subscription_expires_at:
            return '—'
        now = timezone.now()
        delta = obj.subscription_expires_at - now
        if delta.days < 0:
            return format_html('<span style="color:#EF4444;">Expired</span>')
        if delta.days <= 3:
            return format_html('<span style="color:#F59E0B;">{}d left</span>', delta.days)
        return format_html('<span style="color:#10B981;">{}d left</span>', delta.days)
    expires_display.short_description = 'Expires'

    def notes_count(self, obj):
        count = obj.resources.count()
        limit = obj.FREE_NOTES_LIMIT
        if obj.has_active_subscription:
            return format_html('<span style="color:#10B981;">{} (unlimited)</span>', count)
        color = '#EF4444' if count >= limit else '#F59E0B' if count >= limit - 1 else '#9CA3AF'
        return format_html('<span style="color:{};">{}/{}</span>', color, count, limit)
    notes_count.short_description = 'Notes'

    def notes_count_display(self, obj):
        return obj.resources.count()
    notes_count_display.short_description = 'Total resources created'

    def subscription_status_display(self, obj):
        if obj.has_active_subscription:
            return format_html(
                '✅ Active — expires <strong>{}</strong>',
                obj.subscription_expires_at.strftime('%B %d, %Y at %H:%M UTC')
                if obj.subscription_expires_at else 'never'
            )
        return '❌ Not subscribed (free tier)'
    subscription_status_display.short_description = 'Subscription status'

    # ── Bulk actions ─────────────────────────────────────────

    def grant_premium_30(self, request, queryset):
        from payments.views import _activate_premium
        for user in queryset:
            _activate_premium(user, days=30)
        self.message_user(request, f'30-day premium granted to {queryset.count()} user(s).', messages.SUCCESS)
    grant_premium_30.short_description = '⭐ Grant 30-day Premium'

    def grant_premium_365(self, request, queryset):
        from payments.views import _activate_premium
        for user in queryset:
            _activate_premium(user, days=365)
        self.message_user(request, f'1-year premium granted to {queryset.count()} user(s).', messages.SUCCESS)
    grant_premium_365.short_description = '⭐ Grant 1-year Premium'

    def revoke_premium(self, request, queryset):
        queryset.update(is_premium=False, subscription_expires_at=None)
        self.message_user(request, f'Premium revoked from {queryset.count()} user(s).', messages.WARNING)
    revoke_premium.short_description = '🚫 Revoke Premium'

    def changelist_view(self, request, extra_context=None):
        """Inject site-wide stats into the user list page."""
        extra_context = extra_context or {}
        now = timezone.now()
        total = User.objects.count()
        premium = User.objects.filter(is_premium=True, subscription_expires_at__gt=now).count()
        free = total - premium
        new_today = User.objects.filter(date_joined__date=now.date()).count()
        new_week = User.objects.filter(date_joined__gte=now - __import__('datetime').timedelta(days=7)).count()

        extra_context['site_stats'] = {
            'total_users': total,
            'premium_users': premium,
            'free_users': free,
            'new_today': new_today,
            'new_this_week': new_week,
            'conversion_rate': f'{(premium/total*100):.1f}%' if total else '0%',
        }
        return super().changelist_view(request, extra_context=extra_context)


@admin.register(Notification)
class NotificationAdmin(ModelAdmin):
    list_display = ('user', 'type_badge', 'title', 'is_read_badge', 'created_at')
    list_filter = ('type', 'is_read', 'created_at')
    search_fields = ('user__email', 'title', 'body')
    ordering = ('-created_at',)
    readonly_fields = ('created_at',)
    actions = ['mark_read', 'mark_unread']

    def type_badge(self, obj):
        colors = {
            'ai_nudge': '#8B5CF6', 'streak': '#F59E0B', 'deadline': '#EF4444',
            'flashcard': '#0EA5E9', 'group': '#10B981', 'resource': '#f97316', 'system': '#6B7280'
        }
        color = colors.get(obj.type, '#6B7280')
        return format_html(
            '<span style="color:{};">● {}</span>', color, obj.type
        )
    type_badge.short_description = 'Type'

    def is_read_badge(self, obj):
        if obj.is_read:
            return format_html('<span style="color:#6B7280;">Read</span>')
        return format_html('<span style="color:#F59E0B;font-weight:600;">Unread</span>')
    is_read_badge.short_description = 'Status'

    def mark_read(self, request, queryset):
        queryset.update(is_read=True)
    mark_read.short_description = 'Mark selected as read'

    def mark_unread(self, request, queryset):
        queryset.update(is_read=False)
    mark_unread.short_description = 'Mark selected as unread'
