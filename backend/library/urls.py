from django.urls import path
from .views import (
    ResourceListCreateView, ResourceDetailView,
    GenerateFlashcardsView, GenerateQuizView,
    GenerateMindMapView, GeneratePracticeQuestionsView,
    FlashcardListView, QuizListView, AnkiExportView,
    RefetchTranscriptView, MathSolverView,
)
from .spaced_repetition import DueFlashcardsView, ReviewFlashcardView
from .sse import ResourceStatusSSEView

urlpatterns = [
    path('resources/status-stream/', ResourceStatusSSEView.as_view(), name='resource-status-stream'),
    path('resources/', ResourceListCreateView.as_view(), name='resource-list'),
    path('resources/<int:pk>/', ResourceDetailView.as_view(), name='resource-detail'),
    path('resources/<int:resource_id>/flashcards/generate/', GenerateFlashcardsView.as_view()),
    path('resources/<int:resource_id>/quiz/generate/', GenerateQuizView.as_view()),
    path('resources/<int:resource_id>/mindmap/generate/', GenerateMindMapView.as_view()),
    path('resources/<int:resource_id>/practice/generate/', GeneratePracticeQuestionsView.as_view()),
    path('resources/<int:resource_id>/export/anki/', AnkiExportView.as_view()),
    path('resources/<int:resource_id>/math/solve/', MathSolverView.as_view()),
    path('resources/<int:resource_id>/refetch-transcript/', RefetchTranscriptView.as_view()),
    path('flashcards/', FlashcardListView.as_view(), name='flashcard-list'),
    path('flashcards/due/', DueFlashcardsView.as_view()),
    path('flashcards/<int:flashcard_id>/review/', ReviewFlashcardView.as_view()),
    path('flashcards/export/anki/', AnkiExportView.as_view()),
    path('quizzes/', QuizListView.as_view(), name='quiz-list'),
]
