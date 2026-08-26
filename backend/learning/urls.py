from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LearningPathViewSet, ConceptNodeViewSet

router = DefaultRouter()
router.register(r'paths', LearningPathViewSet, basename='learningpath')
router.register(r'concepts', ConceptNodeViewSet, basename='conceptnode')

urlpatterns = [
    # Keep collection actions ahead of the router's ``paths/<pk>/`` route.
    # This also makes the public preview contract explicit and prevents a stale
    # or partially-deployed router table from treating "generate-preview" as pk.
    path(
        'paths/generate-preview/',
        LearningPathViewSet.as_view({'post': 'generate_preview'}),
        name='learningpath-generate-preview-explicit',
    ),
    path('', include(router.urls)),
]
