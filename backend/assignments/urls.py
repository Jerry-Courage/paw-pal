from django.urls import path
from .views import AssignmentListCreateView, AssignmentDetailView, SolveAssignmentView, ExportAssignmentView, ScheduleSessionView

urlpatterns = [
    path('', AssignmentListCreateView.as_view()),
    path('<int:pk>/', AssignmentDetailView.as_view()),
    path('<int:pk>/solve/', SolveAssignmentView.as_view()),
    path('<int:pk>/export/', ExportAssignmentView.as_view()),
    path('<int:pk>/schedule/', ScheduleSessionView.as_view()),
]
