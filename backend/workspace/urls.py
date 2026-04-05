from django.urls import path
from .views import (
    WorkspaceListCreateView, WorkspaceDetailView, JoinWorkspaceView,
    WorkspaceMembersView, DocumentView, DocumentVersionsView,
    MessagesView, TasksView, TaskDetailView, AIAssistView, ExportView,
    FilesView,
)

urlpatterns = [
    path('', WorkspaceListCreateView.as_view()),
    path('join/', JoinWorkspaceView.as_view()),
    path('<int:pk>/', WorkspaceDetailView.as_view()),
    path('<int:pk>/members/', WorkspaceMembersView.as_view()),
    path('<int:pk>/document/', DocumentView.as_view()),
    path('<int:pk>/document/versions/', DocumentVersionsView.as_view()),
    path('<int:pk>/messages/', MessagesView.as_view()),
    path('<int:pk>/tasks/', TasksView.as_view()),
    path('<int:pk>/tasks/<int:task_id>/', TaskDetailView.as_view()),
    path('<int:pk>/files/', FilesView.as_view()),
    path('<int:pk>/ai/', AIAssistView.as_view()),
    path('<int:pk>/export/', ExportView.as_view()),
]
