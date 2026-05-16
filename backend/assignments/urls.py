from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AssignmentViewSet

router = DefaultRouter()
router.register(r'', AssignmentViewSet, basename='assignment')

urlpatterns = [
    # Explicit path to guarantee download endpoint resolves (router can miss underscore actions)
    path('<int:pk>/download_intelligence/', AssignmentViewSet.as_view({'get': 'download_intelligence'}), name='assignment-download'),
    path('', include(router.urls)),
]
