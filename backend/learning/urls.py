from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LearningPathViewSet, ConceptNodeViewSet

router = DefaultRouter()
router.register(r'paths', LearningPathViewSet, basename='learningpath')
router.register(r'concepts', ConceptNodeViewSet, basename='conceptnode')

urlpatterns = [
    path('', include(router.urls)),
]
