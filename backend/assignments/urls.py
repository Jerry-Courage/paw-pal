from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AssignmentViewSet, export_assignment

router = DefaultRouter()
router.register(r'', AssignmentViewSet, basename='assignment')

urlpatterns = [
    # Standalone function view — guaranteed URL resolution, no ViewSet routing quirks
    path('<int:pk>/download_intelligence/', export_assignment, name='assignment-download'),
    path('', include(router.urls)),
]
