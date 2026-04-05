from django.contrib import admin
from .models import Workspace, WorkspaceMember, WorkspaceDocument, WorkspaceMessage, WorkspaceTask


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'subject', 'member_count', 'invite_code', 'created_at')
    search_fields = ('name', 'owner__email')
    readonly_fields = ('invite_code', 'created_at', 'updated_at')

    def member_count(self, obj):
        return obj.memberships.count()


@admin.register(WorkspaceTask)
class WorkspaceTaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'workspace', 'status', 'assigned_to', 'created_at')
    list_filter = ('status',)
