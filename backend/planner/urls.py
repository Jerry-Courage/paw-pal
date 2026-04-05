from django.urls import path
from .views import (
    StudySessionListCreateView, StudySessionDetailView,
    DeadlineListCreateView, DeadlineDetailView,
    SmartScheduleView, CompleteSessionView,
)

urlpatterns = [
    path('sessions/', StudySessionListCreateView.as_view()),
    path('sessions/<int:pk>/', StudySessionDetailView.as_view()),
    path('sessions/<int:pk>/complete/', CompleteSessionView.as_view()),
    path('deadlines/', DeadlineListCreateView.as_view()),
    path('deadlines/<int:pk>/', DeadlineDetailView.as_view()),
    path('smart-schedule/', SmartScheduleView.as_view()),
]
