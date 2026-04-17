from django.urls import path, include
from rest_framework.routers import SimpleRouter
from .views import AssignmentViewSet
# Standard Router
router = SimpleRouter()
router.register(r'', AssignmentViewSet, basename='assignment')

urlpatterns = [
    # Manual Failsafe for detail actions to bypass router regex collisions
    path('<int:pk>/download_intelligence/', AssignmentViewSet.as_view({'get': 'download_intelligence'}), name='assignment-download-intelligence'),
    path('<int:pk>/share/', AssignmentViewSet.as_view({'post': 'share'}), name='assignment-share-manual'),
    path('', include(router.urls)),
]
