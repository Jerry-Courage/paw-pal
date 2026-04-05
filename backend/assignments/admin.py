from django.contrib import admin
from .models import Assignment


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'subject', 'status', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('title', 'user__email', 'subject')
    readonly_fields = ('created_at', 'updated_at', 'ai_response', 'ai_overview', 'ai_outline')
