from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from django.db.models import Count, Q
from .models import Resource, Flashcard, Quiz, Deck, PodcastSession


@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = (
        'cover_preview', 'title', 'owner_link', 'resource_type_badge',
        'subject', 'status_badge', 'has_kit_badge', 'file_size_display', 'created_at'
    )
    list_filter = ('resource_type', 'status', 'has_study_kit', 'is_public', 'created_at')
    search_fields = ('title', 'subject', 'owner__email', 'owner__username')
    readonly_fields = ('created_at', 'updated_at', 'file_size', 'ai_summary', 'processing_progress')
    ordering = ('-created_at',)
    date_hierarchy = 'created_at'
    actions = ['mark_public', 'mark_private', 'reset_processing']

    fieldsets = (
        ('Resource Info', {'fields': ('title', 'resource_type', 'subject', 'owner', 'is_public')}),
        ('Content', {'fields': ('file', 'url', 'cover_image')}),
        ('AI Processing', {
            'fields': ('status', 'processing_progress', 'status_text', 'has_study_kit', 'ai_summary'),
        }),
        ('Metadata', {
            'fields': ('file_size', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def cover_preview(self, obj):
        if obj.cover_image:
            return format_html(
                '<img src="{}" style="width:36px;height:36px;border-radius:6px;object-fit:cover;" />',
                obj.cover_image.url
            )
        colors = {'pdf': '#EF4444', 'video': '#F59E0B', 'code': '#10B981', 'slides': '#8B5CF6'}
        icons = {'pdf': '📄', 'video': '🎬', 'code': '💻', 'slides': '📊'}
        color = colors.get(obj.resource_type, '#6B7280')
        icon = icons.get(obj.resource_type, '📁')
        return format_html(
            '<div style="width:36px;height:36px;border-radius:6px;background:{};display:flex;'
            'align-items:center;justify-content:center;font-size:16px;">{}</div>',
            color + '22', icon
        )
    cover_preview.short_description = ''

    def owner_link(self, obj):
        return format_html(
            '<a href="/admin/users/user/{}/change/">{}</a>',
            obj.owner.id, obj.owner.email
        )
    owner_link.short_description = 'Owner'

    def resource_type_badge(self, obj):
        colors = {'pdf': '#EF4444', 'video': '#F59E0B', 'code': '#10B981', 'slides': '#8B5CF6', 'other': '#6B7280'}
        color = colors.get(obj.resource_type, '#6B7280')
        return format_html(
            '<span style="background:{};color:white;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">{}</span>',
            color, obj.resource_type.upper()
        )
    resource_type_badge.short_description = 'Type'

    def status_badge(self, obj):
        colors = {'ready': '#10B981', 'processing': '#F59E0B', 'generating': '#0EA5E9',
                  'vectorizing': '#8B5CF6', 'failed': '#EF4444'}
        color = colors.get(obj.status, '#6B7280')
        label = obj.status
        if obj.status == 'processing' and obj.processing_progress:
            label = f'{obj.status} {obj.processing_progress}%'
        return format_html(
            '<span style="background:{};color:white;padding:2px 8px;border-radius:12px;font-size:11px;">{}</span>',
            color, label
        )
    status_badge.short_description = 'Status'

    def has_kit_badge(self, obj):
        if obj.has_study_kit:
            return format_html('<span style="color:#10B981;font-weight:600;">✓ Ready</span>')
        return format_html('<span style="color:#6B7280;">—</span>')
    has_kit_badge.short_description = 'Kit'

    def file_size_display(self, obj):
        if not obj.file_size:
            return '—'
        size = obj.file_size
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size < 1024:
                return f'{size:.1f} {unit}'
            size /= 1024
        return f'{size:.1f} GB'
    file_size_display.short_description = 'Size'

    def mark_public(self, request, queryset):
        queryset.update(is_public=True)
    mark_public.short_description = '🌐 Make public (curated)'

    def mark_private(self, request, queryset):
        queryset.update(is_public=False)
    mark_private.short_description = '🔒 Make private'

    def reset_processing(self, request, queryset):
        queryset.update(status='processing', processing_progress=0, has_study_kit=False)
    reset_processing.short_description = '🔄 Reset to processing'

    def changelist_view(self, request, extra_context=None):
        extra_context = extra_context or {}
        qs = self.get_queryset(request)
        extra_context['resource_stats'] = {
            'total': qs.count(),
            'ready': qs.filter(status='ready').count(),
            'processing': qs.filter(status__in=['processing', 'generating', 'vectorizing']).count(),
            'failed': qs.filter(status='failed').count(),
            'with_kit': qs.filter(has_study_kit=True).count(),
            'public': qs.filter(is_public=True).count(),
        }
        return super().changelist_view(request, extra_context=extra_context)


@admin.register(Flashcard)
class FlashcardAdmin(admin.ModelAdmin):
    list_display = ('question_preview', 'owner', 'subject', 'difficulty_badge', 'repetitions', 'created_at')
    list_filter = ('difficulty', 'subject', 'created_at')
    search_fields = ('question', 'answer', 'owner__email')
    ordering = ('-created_at',)
    readonly_fields = ('created_at',)

    def question_preview(self, obj):
        return obj.question[:80] + '…' if len(obj.question) > 80 else obj.question
    question_preview.short_description = 'Question'

    def difficulty_badge(self, obj):
        colors = {'easy': '#10B981', 'medium': '#F59E0B', 'hard': '#EF4444'}
        color = colors.get(obj.difficulty, '#6B7280')
        return format_html(
            '<span style="background:{};color:white;padding:2px 8px;border-radius:12px;font-size:11px;">{}</span>',
            color, obj.difficulty
        )
    difficulty_badge.short_description = 'Difficulty'


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = ('title', 'owner', 'format_badge', 'academic_level', 'question_count', 'created_at')
    list_filter = ('format', 'academic_level', 'created_at')
    search_fields = ('title', 'owner__email')
    readonly_fields = ('created_at',)

    def format_badge(self, obj):
        colors = {'flashcard': '#0EA5E9', 'mcq': '#8B5CF6', 'short': '#10B981', 'mixed': '#F59E0B'}
        color = colors.get(obj.format, '#6B7280')
        return format_html(
            '<span style="background:{};color:white;padding:2px 8px;border-radius:12px;font-size:11px;">{}</span>',
            color, obj.format.upper()
        )
    format_badge.short_description = 'Format'

    def question_count(self, obj):
        return len(obj.questions) if obj.questions else 0
    question_count.short_description = 'Questions'


@admin.register(Deck)
class DeckAdmin(admin.ModelAdmin):
    list_display = ('title', 'owner', 'subject', 'card_count', 'created_at')
    search_fields = ('title', 'subject', 'owner__email')
    readonly_fields = ('created_at',)

    def card_count(self, obj):
        return obj.cards.count()
    card_count.short_description = 'Cards'


@admin.register(PodcastSession)
class PodcastSessionAdmin(admin.ModelAdmin):
    list_display = ('resource_title', 'owner', 'status_badge', 'voice_a', 'voice_b', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('resource__title', 'owner__email')
    readonly_fields = ('created_at',)

    def resource_title(self, obj):
        return obj.resource.title if obj.resource else '—'
    resource_title.short_description = 'Resource'

    def status_badge(self, obj):
        colors = {'ready': '#10B981', 'generating': '#F59E0B', 'failed': '#EF4444'}
        color = colors.get(obj.status, '#6B7280')
        return format_html(
            '<span style="background:{};color:white;padding:2px 8px;border-radius:12px;font-size:11px;">{}</span>',
            color, obj.status
        )
    status_badge.short_description = 'Status'
