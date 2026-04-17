from django.urls import path
from .views import (
    PostListCreateView, PostDetailView, LikePostView,
    CommentListCreateView, LikeCommentView, AIAnswerView,
    StudyRoomListCreateView, StudyRoomJoinLeaveView,
    StudyEventListCreateView, RegisterEventView,
    LeaderboardView, StoryListCreateView
)

urlpatterns = [
    path('posts/', PostListCreateView.as_view()),
    path('posts/<int:pk>/', PostDetailView.as_view()),
    path('posts/<int:pk>/like/', LikePostView.as_view()),
    path('posts/<int:post_id>/comments/', CommentListCreateView.as_view()),
    path('comments/<int:pk>/like/', LikeCommentView.as_view()),
    path('posts/<int:pk>/ai-answer/', AIAnswerView.as_view()),
    path('rooms/', StudyRoomListCreateView.as_view()),
    path('rooms/<int:pk>/join/', StudyRoomJoinLeaveView.as_view()),
    path('events/', StudyEventListCreateView.as_view()),
    path('events/<int:pk>/register/', RegisterEventView.as_view()),
    path('leaderboard/', LeaderboardView.as_view()),
    path('stories/', StoryListCreateView.as_view()),
]
