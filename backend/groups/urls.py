from django.urls import path
from .views import (
    GroupListCreateView, GroupDetailView, JoinLeaveGroupView,
    GroupSessionListCreateView, WorkspaceDocumentView,
    WorkspaceDocumentDetailView, GroupTaskView, GroupTaskDetailView,
    GroupMessageView,
)

urlpatterns = [
    path('', GroupListCreateView.as_view()),
    path('<int:pk>/', GroupDetailView.as_view()),
    path('<int:pk>/join/', JoinLeaveGroupView.as_view()),
    path('<int:group_id>/sessions/', GroupSessionListCreateView.as_view()),
    path('<int:group_id>/documents/', WorkspaceDocumentView.as_view()),
    path('<int:group_id>/documents/<int:pk>/', WorkspaceDocumentDetailView.as_view()),
    path('<int:group_id>/tasks/', GroupTaskView.as_view()),
    path('<int:group_id>/tasks/<int:pk>/', GroupTaskDetailView.as_view()),
    path('<int:group_id>/messages/', GroupMessageView.as_view()),
]
