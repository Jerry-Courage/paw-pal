from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import RegisterView, MeView, LogoutView, AnalyticsView, LogStudyView, SetWeeklyGoalView, NotificationsView, NotificationDetailView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', TokenObtainPairView.as_view(), name='login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('me/', MeView.as_view(), name='me'),
    path('analytics/', AnalyticsView.as_view(), name='analytics'),
    path('log-study/', LogStudyView.as_view(), name='log-study'),
    path('set-goal/', SetWeeklyGoalView.as_view(), name='set-goal'),
    path('notifications/', NotificationsView.as_view(), name='notifications'),
    path('notifications/<int:pk>/', NotificationDetailView.as_view(), name='notification-detail'),
]
