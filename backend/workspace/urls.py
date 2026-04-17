from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import WorkspaceViewSet, WorkspaceMessageView

router = DefaultRouter()
router.register(r'workspaces', WorkspaceViewSet, basename='workspace')

urlpatterns = [
    path('', include(router.urls)),
    path('workspaces/<int:workspace_id>/messages/', WorkspaceMessageView.as_view(), name='workspace-messages'),
]
