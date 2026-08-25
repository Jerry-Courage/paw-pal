from django.contrib import admin
from django.utils.html import format_html
from unfold.admin import ModelAdmin
from .models import (
    ProgressionProfile,
    XPTransaction,
    FlowCoinWallet,
    FlowCoinTransaction,
    StreakActivity,
)


@admin.register(ProgressionProfile)
class ProgressionProfileAdmin(ModelAdmin):
    list_display = ('user_email', 'lifetime_xp', 'level_badge', 'current_streak', 'longest_streak', 'streak_shields', 'migrated')
    list_filter = ('migrated',)
    search_fields = ('user__email', 'user__username')
    readonly_fields = ('created_at', 'updated_at')
    ordering = ('-lifetime_xp',)

    def user_email(self, obj):
        return obj.user.email
    user_email.short_description = 'User'

    def level_badge(self, obj):
        colors = {1: '#94a3b8', 2: '#22c55e', 3: '#8b5cf6', 4: '#f97316', 5: '#eab308'}
        color = colors.get(obj.level_num, '#94a3b8')
        return format_html(
            '<span style="background:{};color:white;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;">Lvl {} {}</span>',
            color, obj.level_num, obj.level_name,
        )
    level_badge.short_description = 'Level'


@admin.register(XPTransaction)
class XPTransactionAdmin(ModelAdmin):
    list_display = ('user_email', 'amount_badge', 'source_type', 'source_id', 'reason', 'created_at')
    list_filter = ('source_type', 'created_at')
    search_fields = ('user__email', 'reason')
    readonly_fields = ('id', 'idempotency_key', 'created_at')
    ordering = ('-created_at',)
    date_hierarchy = 'created_at'

    def user_email(self, obj):
        return obj.user.email
    user_email.short_description = 'User'

    def amount_badge(self, obj):
        color = '#22c55e' if obj.amount >= 0 else '#ef4444'
        sign = '+' if obj.amount >= 0 else ''
        return format_html(
            '<span style="color:{};font-weight:700;">{}{} XP</span>',
            color, sign, obj.amount,
        )
    amount_badge.short_description = 'XP'


@admin.register(FlowCoinWallet)
class FlowCoinWalletAdmin(ModelAdmin):
    list_display = ('user_email', 'balance', 'created_at', 'updated_at')
    search_fields = ('user__email', 'user__username')
    readonly_fields = ('created_at', 'updated_at')

    def user_email(self, obj):
        return obj.user.email
    user_email.short_description = 'User'


@admin.register(FlowCoinTransaction)
class FlowCoinTransactionAdmin(ModelAdmin):
    list_display = ('user_email', 'amount_badge', 'transaction_type', 'source_type', 'balance_after', 'created_at')
    list_filter = ('transaction_type', 'source_type', 'created_at')
    search_fields = ('wallet__user__email', 'description')
    readonly_fields = ('id', 'idempotency_key', 'created_at')
    ordering = ('-created_at',)
    date_hierarchy = 'created_at'

    def user_email(self, obj):
        return obj.wallet.user.email
    user_email.short_description = 'User'

    def amount_badge(self, obj):
        color = '#22c55e' if obj.amount >= 0 else '#ef4444'
        sign = '+' if obj.amount >= 0 else ''
        return format_html(
            '<span style="color:{};font-weight:700;">{}{} FC</span>',
            color, sign, obj.amount,
        )
    amount_badge.short_description = 'FlowCoins'


@admin.register(StreakActivity)
class StreakActivityAdmin(ModelAdmin):
    list_display = ('user_email', 'date', 'activity_type', 'source_id', 'created_at')
    list_filter = ('activity_type', 'date')
    search_fields = ('user__email',)
    readonly_fields = ('created_at',)
    ordering = ('-date',)
    date_hierarchy = 'date'

    def user_email(self, obj):
        return obj.user.email
    user_email.short_description = 'User'
