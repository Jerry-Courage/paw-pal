from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from django.db.models import Sum, Count, Q
from django.contrib import messages
from .models import PaymentTransaction, PromoCode, PromoRedemption
from .views import _activate_premium


# ── Inline: show redemptions inside PromoCode ──────────────────────
class PromoRedemptionInline(admin.TabularInline):
    model = PromoRedemption
    extra = 0
    readonly_fields = ('user', 'redeemed_at')
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(PaymentTransaction)
class PaymentTransactionAdmin(admin.ModelAdmin):
    list_display = (
        'reference_short', 'user_link', 'email', 'amount_display',
        'status_badge', 'plan', 'created_at'
    )
    list_filter = ('status', 'plan', 'currency', 'created_at')
    search_fields = ('reference', 'email', 'user__email', 'user__username')
    readonly_fields = ('reference', 'email', 'amount', 'currency', 'plan',
                       'paystack_data', 'created_at', 'updated_at')
    ordering = ('-created_at',)
    date_hierarchy = 'created_at'
    actions = ['mark_success_and_activate']

    def reference_short(self, obj):
        return obj.reference[:20] + '…' if len(obj.reference) > 20 else obj.reference
    reference_short.short_description = 'Reference'

    def user_link(self, obj):
        if obj.user:
            return format_html(
                '<a href="/admin/users/user/{}/change/">{}</a>',
                obj.user.id, obj.user.username
            )
        return '—'
    user_link.short_description = 'User'

    def amount_display(self, obj):
        return format_html('<strong>${}</strong>', obj.amount)
    amount_display.short_description = 'Amount'

    def status_badge(self, obj):
        colors = {
            'success':   '#10B981',
            'pending':   '#F59E0B',
            'failed':    '#EF4444',
            'abandoned': '#6B7280',
        }
        color = colors.get(obj.status, '#6B7280')
        return format_html(
            '<span style="background:{};color:white;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;">{}</span>',
            color, obj.status.upper()
        )
    status_badge.short_description = 'Status'

    def mark_success_and_activate(self, request, queryset):
        count = 0
        for txn in queryset.filter(user__isnull=False):
            txn.status = 'success'
            txn.save(update_fields=['status'])
            _activate_premium(txn.user)
            count += 1
        self.message_user(request, f'{count} transaction(s) marked successful and premium activated.', messages.SUCCESS)
    mark_success_and_activate.short_description = '✅ Mark as success & activate premium'

    def changelist_view(self, request, extra_context=None):
        """Add revenue summary to the top of the transaction list."""
        extra_context = extra_context or {}
        qs = self.get_queryset(request)
        total_revenue = qs.filter(status='success').aggregate(total=Sum('amount'))['total'] or 0
        total_success = qs.filter(status='success').count()
        total_pending = qs.filter(status='pending').count()
        extra_context['summary'] = {
            'total_revenue': f'${total_revenue:.2f}',
            'total_success': total_success,
            'total_pending': total_pending,
        }
        return super().changelist_view(request, extra_context=extra_context)


@admin.register(PromoCode)
class PromoCodeAdmin(admin.ModelAdmin):
    list_display = (
        'code', 'description', 'discount_type_badge', 'discount_value',
        'usage_display', 'validity_badge', 'expires_at', 'created_at'
    )
    list_filter = ('discount_type', 'is_active', 'created_at')
    search_fields = ('code', 'description')
    readonly_fields = ('times_used', 'created_at')
    inlines = [PromoRedemptionInline]
    actions = ['deactivate_codes', 'activate_codes']

    fieldsets = (
        ('Code Details', {
            'fields': ('code', 'description', 'is_active')
        }),
        ('Discount', {
            'fields': ('discount_type', 'discount_value'),
            'description': 'For free_days: value = number of premium days. For percent_off: value = % discount.'
        }),
        ('Limits', {
            'fields': ('max_uses', 'times_used', 'expires_at'),
            'description': 'Set max_uses to 0 for unlimited redemptions.'
        }),
        ('Metadata', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )

    def discount_type_badge(self, obj):
        colors = {'free_days': '#10B981', 'percent_off': '#0EA5E9'}
        color = colors.get(obj.discount_type, '#6B7280')
        labels = {'free_days': '🎁 Free Days', 'percent_off': '% Off'}
        return format_html(
            '<span style="color:{};">{}</span>',
            color, labels.get(obj.discount_type, obj.discount_type)
        )
    discount_type_badge.short_description = 'Type'

    def usage_display(self, obj):
        if obj.max_uses == 0:
            return format_html(
                '<span style="color:#10B981;">{} / ∞</span>', obj.times_used
            )
        pct = (obj.times_used / obj.max_uses) * 100
        color = '#EF4444' if pct >= 90 else '#F59E0B' if pct >= 60 else '#10B981'
        return format_html(
            '<span style="color:{};">{} / {}</span>',
            color, obj.times_used, obj.max_uses
        )
    usage_display.short_description = 'Uses'

    def validity_badge(self, obj):
        if not obj.is_active:
            return format_html('<span style="color:#EF4444;font-weight:600;">Inactive</span>')
        if obj.expires_at and obj.expires_at < timezone.now():
            return format_html('<span style="color:#EF4444;font-weight:600;">Expired</span>')
        if obj.max_uses > 0 and obj.times_used >= obj.max_uses:
            return format_html('<span style="color:#F59E0B;font-weight:600;">Exhausted</span>')
        return format_html('<span style="color:#10B981;font-weight:600;">✓ Valid</span>')
    validity_badge.short_description = 'Status'

    def deactivate_codes(self, request, queryset):
        queryset.update(is_active=False)
        self.message_user(request, f'{queryset.count()} code(s) deactivated.', messages.WARNING)
    deactivate_codes.short_description = '🚫 Deactivate selected codes'

    def activate_codes(self, request, queryset):
        queryset.update(is_active=True)
        self.message_user(request, f'{queryset.count()} code(s) activated.', messages.SUCCESS)
    activate_codes.short_description = '✅ Activate selected codes'


@admin.register(PromoRedemption)
class PromoRedemptionAdmin(admin.ModelAdmin):
    list_display = ('user', 'promo_code', 'discount_summary', 'redeemed_at')
    list_filter = ('redeemed_at', 'promo__discount_type')
    search_fields = ('user__email', 'promo__code')
    readonly_fields = ('user', 'promo', 'redeemed_at')

    def promo_code(self, obj):
        return obj.promo.code
    promo_code.short_description = 'Code'

    def discount_summary(self, obj):
        if obj.promo.discount_type == 'free_days':
            return f'{obj.promo.discount_value} free days'
        return f'{obj.promo.discount_value}% off'
    discount_summary.short_description = 'Discount'
