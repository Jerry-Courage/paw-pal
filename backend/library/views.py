import os
import logging
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from django.conf import settings
from django.db.models import Count, Q
from django.utils import timezone

from .models import Resource, Flashcard, Quiz, Deck
from .serializers import (
    ResourceSerializer, ResourceUploadSerializer,
    FlashcardSerializer, QuizSerializer, DeckSerializer
)
from .youtube import process_youtube_url
from .pdf_extractor import extract_pdf_text
from ai_assistant.services import AIService
from core.throttling import UploadRateThrottle, AIRateThrottle

logger = logging.getLogger('flowstate')

ALLOWED_EXTENSIONS = {
    '.pdf', '.doc', '.docx', '.pptx', '.ppt', '.txt', '.md',
    '.py', '.js', '.ts', '.rs', '.java', '.cpp', '.jpg', '.jpeg', '.png', '.mp4'
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


class ResourceListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_throttles(self):
        # Only apply upload throttle to POST requests
        if self.request.method == 'POST':
            return [UploadRateThrottle()]
        return super().get_throttles()

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ResourceUploadSerializer
        return ResourceSerializer

    def get_queryset(self):
        qs = Resource.objects.filter(owner=self.request.user).select_related('owner').prefetch_related('extracted_images')
        resource_type = self.request.query_params.get('type')
        if resource_type:
            qs = qs.filter(resource_type=resource_type)
        return qs

    def create(self, request, *args, **kwargs):
        uploaded_file = request.FILES.get('file')
        if uploaded_file:
            ext = os.path.splitext(uploaded_file.name)[1].lower()
            if ext not in ALLOWED_EXTENSIONS:
                return Response({'error': f'File type {ext} not allowed.'}, status=status.HTTP_400_BAD_REQUEST)
            if uploaded_file.size > MAX_FILE_SIZE:
                return Response({'error': 'File too large. Maximum 50MB.'}, status=status.HTTP_400_BAD_REQUEST)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        from django_q.tasks import async_task

        resource = serializer.save(owner=self.request.user)
        resource.file_size = resource.file.size if resource.file else 0
        resource.save()

        # Delegate heavy extraction to the asynchronous Q2 broker
        async_task('library.tasks.process_resource_task', resource.id)
        
        logger.info(f'Resource {resource.id} async task dispatched for user {self.request.user.id}')

    def get_serializer_context(self):
        return {'request': self.request}


class ResourceDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ResourceSerializer

    def get_queryset(self):
        return Resource.objects.filter(owner=self.request.user)

    def get_serializer_context(self):
        return {'request': self.request}


class GenerateFlashcardsView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request, resource_id):
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        count = int(request.data.get('count', 10))
        level = request.data.get('level', 'undergrad')

        # Use extracted text if available
        context = ''
        if resource.ai_concepts:
            for c in resource.ai_concepts:
                context = c.get('extracted_text', '') or c.get('transcript', '')
                if context:
                    break

        ai = AIService()
        flashcards_data = ai.generate_flashcards(resource, count, level, context=context)

        return Response({"preview_cards": flashcards_data})

class DeckListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DeckSerializer

    def get_queryset(self):
        now = timezone.now()
        due_q = Q(cards__next_review__isnull=True) | Q(cards__next_review__lte=now)
        return Deck.objects.filter(owner=self.request.user).annotate(
            total_cards=Count('cards', distinct=True),
            due_count=Count('cards', filter=due_q, distinct=True)
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

class DeckDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = DeckSerializer

    def get_queryset(self):
        now = timezone.now()
        due_q = Q(cards__next_review__isnull=True) | Q(cards__next_review__lte=now)
        return Deck.objects.filter(owner=self.request.user).annotate(
            total_cards=Count('cards', distinct=True),
            due_count=Count('cards', filter=due_q, distinct=True)
        )

class SaveFlashcardsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, deck_id):
        deck = get_object_or_404(Deck, id=deck_id, owner=request.user)
        resource_id = request.data.get('resource_id')
        cards_data = request.data.get('flashcards', [])

        resource = None
        if resource_id:
            resource = get_object_or_404(Resource, id=resource_id, owner=request.user)

        saved_cards = []
        for item in cards_data:
            fc = Flashcard.objects.create(
                deck=deck,
                resource=resource,
                owner=request.user,
                question=item.get('question', ''),
                answer=item.get('answer', ''),
                subject=deck.subject or deck.title,
                difficulty=item.get('difficulty', 'medium'),
            )
            saved_cards.append(fc)

        return Response(FlashcardSerializer(saved_cards, many=True).data)


class GenerateQuizView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request, resource_id):
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        fmt = request.data.get('format', 'mcq')
        level = request.data.get('level', 'undergrad')
        count = int(request.data.get('count', 10))

        ai = AIService()
        questions = ai.generate_quiz(resource, fmt, level, count)

        quiz = Quiz.objects.create(
            resource=resource,
            owner=request.user,
            title=f"{resource.title} - Quiz",
            format=fmt,
            questions=questions,
            academic_level=level,
        )
        return Response(QuizSerializer(quiz).data)


class GenerateMindMapView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request, resource_id):
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        ai = AIService()
        mind_map = ai.generate_mind_map(resource)
        return Response(mind_map)


class GeneratePracticeQuestionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request, resource_id):
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        difficulty = request.data.get('difficulty', 'medium')
        count = int(request.data.get('count', 5))
        ai = AIService()
        questions = ai.generate_practice_questions(resource, difficulty, count)
        return Response(questions)


class FlashcardListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = FlashcardSerializer

    def get_queryset(self):
        return Flashcard.objects.filter(owner=self.request.user)


class QuizListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = QuizSerializer

    def get_queryset(self):
        return Quiz.objects.filter(owner=self.request.user)


class RefetchTranscriptView(APIView):
    """Retry fetching transcript for a video resource."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, resource_id):
        from library.youtube import process_youtube_url
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        if resource.resource_type != 'video' or not resource.url:
            return Response({'error': 'Not a video resource.'}, status=status.HTTP_400_BAD_REQUEST)

        yt_data = process_youtube_url(resource.url)
        if not yt_data['success']:
            return Response({'error': 'Could not process video URL.'}, status=status.HTTP_400_BAD_REQUEST)

        if yt_data['has_transcript']:
            existing = [c for c in (resource.ai_concepts or []) if 'transcript' not in c]
            resource.ai_concepts = existing + [{'transcript': yt_data['transcript'][:5000]}]
            # Auto-summarize
            ai = AIService()
            try:
                summary = ai.chat([{'role': 'user', 'content': f"Summarize this video in key points:\n\n{yt_data['transcript'][:3000]}"}])
                resource.ai_summary = summary
            except Exception:
                pass
            resource.save()
            return Response({'success': True, 'has_transcript': True, 'message': 'Transcript fetched successfully!'})
        else:
            return Response({'success': True, 'has_transcript': False, 'message': 'This video does not have captions available. AI will use general knowledge about the topic.'})


class AnkiExportView(APIView):
    """Export flashcards as Anki-compatible CSV."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, resource_id=None):
        import csv
        from django.http import HttpResponse

        if resource_id:
            flashcards = Flashcard.objects.filter(owner=request.user, resource_id=resource_id)
        else:
            flashcards = Flashcard.objects.filter(owner=request.user)

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="flowstate_flashcards.csv"'

        writer = csv.writer(response)
        # Anki format: Front, Back, Tags
        for fc in flashcards:
            tags = f"flowstate {fc.subject} {fc.difficulty}".strip()
            writer.writerow([fc.question, fc.answer, tags])

        return response

class MathSolverView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, resource_id):
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        problem = request.data.get('problem')
        if not problem:
            return Response({'error': 'No problem provided.'}, status=status.HTTP_400_BAD_REQUEST)
        
        ai = AIService()
        solution = ai.solve_math_problem(problem, context=ai._get_resource_context(resource))
        return Response(solution)
