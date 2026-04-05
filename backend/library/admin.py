from django.contrib import admin
from django.utils.html import format_html
from .models import Resource, Flashcard, Quiz


@admin.register(Resource)
class ResourceAdmin(admin.ModelAdmin):
    list_display = ('title', 'owner_link', 'resource_type_badge', 'subject', 'status_badge', 'file_size_display', 'created_at')
    list_filter = ('resource_type', 'status', 'created_at')
    search_fields = ('title', 'subject', 'owner__email', 'owner__username')
    readonly_fields = ('created_at', 'updated_at', 'file_size', 'ai_summary', 'ai_concepts')
    ordering = ('-created_at',)
    date_hierarchy = 'created_at'

    fieldsets = (
        ('Resource Info', {'fields': ('title', 'resource_type', 'subject', 'owner')}),
        ('Content', {'fields': ('file', 'url')}),
        ('AI Processing', {'fields': ('status', 'ai_summary', 'ai_concepts')}),
        ('Metadata', {'fields': ('file_size', 'created_at', 'updated_at'), 'classes': ('collapse',)}),
    )

    def owner_link(self, obj):
        return format_html('<a href="/admin/users/user/{}/change/">{}</a>', obj.owner.id, obj.owner.email)
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
        colors = {'ready': '#10B981', 'processing': '#F59E0B', 'error': '#EF4444'}
        color = colors.get(obj.status, '#6B7280')
        return format_html(
            '<span style="background:{};color:white;padding:2px 8px;border-radius:12px;font-size:11px;">{}</span>',
            color, obj.status
        )
    status_badge.short_description = 'Status'

    def file_size_display(self, obj):
        if obj.file_size == 0:
            return '—'
        for unit in ['B', 'KB', 'MB', 'GB']:
            if obj.file_size < 1024:
                return f'{obj.file_size:.1f} {unit}'
            obj.file_size /= 1024
        return f'{obj.file_size:.1f} GB'
    file_size_display.short_description = 'Size'


@admin.register(Flashcard)
class FlashcardAdmin(admin.ModelAdmin):
    list_display = ('question_preview', 'owner', 'subject', 'difficulty_badge', 'created_at')
    list_filter = ('difficulty', 'subject', 'created_at')
    search_fields = ('question', 'answer', 'owner__email')
    ordering = ('-created_at',)

    def question_preview(self, obj):
        return obj.question[:80] + '...' if len(obj.question) > 80 else obj.question
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
