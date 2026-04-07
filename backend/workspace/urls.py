from django.urls import path, re_path
from .views import (
    WorkspaceListCreateView, WorkspaceDetailView, JoinWorkspaceView,
    WorkspaceMembersView, WorkspaceBlocksView, DocumentVersionsView,
    MessagesView, TasksView, TaskDetailView, AIAssistView, ExportView,
    FilesView,
)

urlpatterns = [
    # Top level actions
    path('', WorkspaceListCreateView.as_view(), name='workspace-list'),
    path('join/', JoinWorkspaceView.as_view(), name='workspace-join'),
    
    # Specific Sub-resources (Regex handles these better for nested IDs)
    re_path(r'^(?P<workspace_id>\d+)/members/$', WorkspaceMembersView.as_view(), name='workspace-members'),
    re_path(r'^(?P<workspace_id>\d+)/blocks/$', WorkspaceBlocksView.as_view(), name='workspace-blocks'),
    re_path(r'^(?P<workspace_id>\d+)/versions/$', DocumentVersionsView.as_view(), name='workspace-versions'),
    re_path(r'^(?P<workspace_id>\d+)/messages/$', MessagesView.as_view(), name='workspace-messages'),
    re_path(r'^(?P<workspace_id>\d+)/tasks/$', TasksView.as_view(), name='workspace-tasks'),
    re_path(r'^(?P<workspace_id>\d+)/tasks/(?P<task_id>\d+)/$', TaskDetailView.as_view(), name='workspace-task-detail'),
    re_path(r'^(?P<workspace_id>\d+)/files/$', FilesView.as_view(), name='workspace-files'),
    re_path(r'^(?P<workspace_id>\d+)/ai/$', AIAssistView.as_view(), name='workspace-ai'),
    re_path(r'^(?P<workspace_id>\d+)/export/$', ExportView.as_view(), name='workspace-export'),
    
    # The Generic detail view MUST be last or it will eat other paths
    re_path(r'^(?P<pk>\d+)/$', WorkspaceDetailView.as_view(), name='workspace-detail'),
]
