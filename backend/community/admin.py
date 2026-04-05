from django.contrib import admin
from django.utils.html import format_html
from .models import Post, Comment, StudyEvent, StudyRoom


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ('content_preview', 'author', 'post_type', 'like_count', 'comment_count', 'created_at')
    list_filter = ('post_type', 'is_answered', 'created_at')
    search_fields = ('content', 'author__email', 'author__username')
    readonly_fields = ('created_at',)

    def content_preview(self, obj):
        return obj.content[:80] + '...' if len(obj.content) > 80 else obj.content
    content_preview.short_description = 'Content'

    def like_count(self, obj):
        return format_html('<span style="color:#EF4444;">♥ {}</span>', obj.likes.count())
    like_count.short_description = 'Likes'

    def comment_count(self, obj):
        return obj.comments.count()
    comment_count.short_description = 'Comments'


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ('author', 'post', 'is_ai_answer', 'created_at')
    list_filter = ('is_ai_answer',)


@admin.register(StudyRoom)
class StudyRoomAdmin(admin.ModelAdmin):
    list_display = ('title', 'host', 'subject', 'participant_count', 'is_active', 'created_at')
    list_filter = ('is_active',)

    def participant_count(self, obj):
        return obj.participants.count()


@admin.register(StudyEvent)
class StudyEventAdmin(admin.ModelAdmin):
    list_display = ('title', 'host', 'event_type', 'scheduled_at', 'registration_count', 'max_participants')
    list_filter = ('event_type', 'scheduled_at')
    search_fields = ('title', 'host__email')
    readonly_fields = ('created_at',)

    def registration_count(self, obj):
        return f'{obj.registrations.count()} / {obj.max_participants}'
    registration_count.short_description = 'Registrations'
