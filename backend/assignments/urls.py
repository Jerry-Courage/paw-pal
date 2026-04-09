from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AssignmentViewSet

# Using DefaultRouter to automatically generate all assignment-related URL patterns,
# including detail sub-actions like /export/, /solve/, and /refine/.
router = DefaultRouter()
router.register(r'', AssignmentViewSet, basename='assignment')

urlpatterns = [
    # Manually defining the export path to ensure it is correctly resolved by the dispatcher,
    # bypassing any potential prefix/trailing-slash issues with the DefaultRouter.
    path('<int:pk>/export/', AssignmentViewSet.as_view({'get': 'export'}), name='assignment-manual-export'),
    path('', include(router.urls)),
]
