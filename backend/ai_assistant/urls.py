from django.urls import path
from .views import (
    ChatSessionListCreateView, ChatSessionDetailView,
    SendMessageView, StreamMessageView, QuickAskView,
    SummarizeResourceView, StudyNudgeView,
    ExplainTextView, KeyConceptsView, StudyNotesView,
    MindMapView, PracticeQuestionsView, ChapterSummariesView,
    SaveContentView, GradeAnswerView,
    VisionMessageView, GenerateDiagramView, GenerateImageView,
)

from .views_podcast import (
    PodcastInitView, PodcastStatusView, PodcastChunkAudioView, PodcastInterruptView
)

urlpatterns = [
    path('sessions/', ChatSessionListCreateView.as_view()),
    path('sessions/<int:pk>/', ChatSessionDetailView.as_view()),
    path('sessions/<int:session_id>/message/', SendMessageView.as_view()),
    path('sessions/<int:session_id>/message/vision/', VisionMessageView.as_view()),
    path('sessions/<int:session_id>/stream/', StreamMessageView.as_view()),
    path('ask/', QuickAskView.as_view()),
    path('summarize/<int:resource_id>/', SummarizeResourceView.as_view()),
    path('nudge/', StudyNudgeView.as_view()),
    path('resources/<int:resource_id>/podcast/', PodcastInitView.as_view()),
    path('podcast/<int:session_id>/status/', PodcastStatusView.as_view()),
    path('podcast/<int:session_id>/chunk/<int:chunk_index>/', PodcastChunkAudioView.as_view()),
    path('podcast/<int:session_id>/interrupt/', PodcastInterruptView.as_view()),
    path('explain/', ExplainTextView.as_view()),
    path('diagram/', GenerateDiagramView.as_view()),
    path('generate-image/', GenerateImageView.as_view()),
    path('resources/<int:resource_id>/concepts/', KeyConceptsView.as_view()),
    path('resources/<int:resource_id>/notes/', StudyNotesView.as_view()),
    path('resources/<int:resource_id>/mindmap/', MindMapView.as_view()),
    path('resources/<int:resource_id>/practice/', PracticeQuestionsView.as_view()),
    path('resources/<int:resource_id>/chapters/', ChapterSummariesView.as_view()),
    path('resources/<int:resource_id>/save/', SaveContentView.as_view()),
    path('resources/<int:resource_id>/grade/', GradeAnswerView.as_view()),
]
