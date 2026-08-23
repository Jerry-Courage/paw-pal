from django.urls import path
from .views import (
    GroupListCreateView, GroupDetailView, JoinLeaveGroupView,
    GroupSessionListCreateView, GroupTaskView, GroupTaskDetailView,
    GroupMessageView, GroupDocumentView, GroupDocumentDetailView,
    QuizRoomCreateView, QuizRoomJoinView, QuizRoomDetailView, QuizQuestionsView,
    QuizGenerateView, QuizRoomSnapshotView, BattleHistoryView,
)

urlpatterns = [
    path('', GroupListCreateView.as_view()),
    path('<int:pk>/', GroupDetailView.as_view()),
    path('<int:pk>/join/', JoinLeaveGroupView.as_view()),
    path('<int:group_id>/sessions/', GroupSessionListCreateView.as_view()),
    path('<int:group_id>/tasks/', GroupTaskView.as_view()),
    path('<int:group_id>/tasks/<int:pk>/', GroupTaskDetailView.as_view()),
    path('<int:group_id>/messages/', GroupMessageView.as_view()),
    path('<int:group_id>/documents/', GroupDocumentView.as_view()),
    path('<int:group_id>/documents/<int:pk>/', GroupDocumentDetailView.as_view()),
    # Quiz battle
    path('quiz/', QuizRoomCreateView.as_view()),
    path('quiz/generate/', QuizGenerateView.as_view()),
    path('quiz/join/', QuizRoomJoinView.as_view()),
    path('quiz/<str:pin>/', QuizRoomDetailView.as_view()),
    path('quiz/<str:pin>/snapshot/', QuizRoomSnapshotView.as_view()),
    path('quiz/<str:pin>/questions/', QuizQuestionsView.as_view()),
    # Battle history
    path('battle-history/', BattleHistoryView.as_view()),
]
