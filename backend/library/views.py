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

from .models import Resource, Flashcard, Quiz, Deck, ResourceImage
from .serializers import (
    ResourceSerializer, ResourceUploadSerializer,
    FlashcardSerializer, QuizSerializer, DeckSerializer
)
from .youtube import process_youtube_url
from .pdf_extractor import extract_pdf_text
from ai_assistant.services import AIService
from core.throttling import UploadRateThrottle, AIRateThrottle

logger = logging.getLogger('flowstate')

def trigger_github_synthesis(resource_id):
    """
    Sends a repository_dispatch event to GitHub Actions to trigger zero-cost synthesis.
    """
    import requests
    import json
    
    token = os.getenv('GITHUB_ENGINE_TOKEN')
    repo_owner = os.getenv('GITHUB_REPO_OWNER', 'Jerry-Courage')
    repo_name = os.getenv('GITHUB_REPO_NAME', 'paw-pal')
    
    if not token:
        logger.error("[GitHub Engine] Missing GITHUB_ENGINE_TOKEN. Skipping remote trigger.")
        return False
        
    url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/dispatches"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28"
    }
    payload = {
        "event_type": "trigger-synthesis",
        "client_payload": {
            "resource_id": resource_id
        }
    }
    
    try:
        response = requests.post(url, headers=headers, data=json.dumps(payload))
        if response.status_code == 204:
            logger.info(f"[GitHub Engine] Successfully ignited synthesis for Resource {resource_id}")
            return True
        else:
            logger.error(f"[GitHub Engine] Trigger failed ({response.status_code}): {response.text}")
            return False
    except Exception as e:
        logger.error(f"[GitHub Engine] Critical connection error: {str(e)}")
        return False


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

        # ─── IMPERIAL TRIGGER ────────────────────────────────────────────────────────
        # Try triggering GitHub Actions first for zero-cost high-fidelity synthesis
        triggered = trigger_github_synthesis(resource.id)
        
        if not triggered:
            # Fallback to local async task (useful for local dev or if GitHub is down)
            async_task('library.tasks.process_resource_task', resource.id)
            logger.info(f'Resource {resource.id} fallback to django-q for user {self.request.user.id}')
        else:
            logger.info(f'Resource {resource.id} successfully dispatched to GitHub Engine.')

    def get_serializer_context(self):
        return {'request': self.request}


class CuratedLibraryView(generics.ListAPIView):
    """View to fetch public/curated resources available to everyone."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ResourceSerializer

    def get_queryset(self):
        qs = Resource.objects.filter(is_public=True).select_related('owner').prefetch_related('extracted_images')
        resource_type = self.request.query_params.get('type')
        if resource_type:
            qs = qs.filter(resource_type=resource_type)
        return qs

    def get_serializer_context(self):
        return {'request': self.request}


class ResourceDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ResourceSerializer

    def get_queryset(self):
        # Allow owner OR workspace member OR public access
        return Resource.objects.filter(
            Q(owner=self.request.user) | 
            Q(workspaces__members=self.request.user) |
            Q(is_public=True)
        ).distinct()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.owner != request.user:
            return Response(
                {"error": "Only the original owner can delete this resource from the library."}, 
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)

    def get_serializer_context(self):
        return {'request': self.request}


class GenerateFlashcardsView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request, resource_id):
        # Allow public resources
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
        
        # [PREMIUM UPGRADE] Instant Curated Flashcards
        # Check if we have public flashcards pre-seeded for this resource
        public_cards = Flashcard.objects.filter(resource=resource, is_public=True) if hasattr(Flashcard, 'is_public') else None
        # Fallback: check if they are owned by a curator
        if not public_cards:
            public_cards = Flashcard.objects.filter(resource=resource, owner__username='flowstate_curator')
            
        if public_cards.exists():
            from .serializers import FlashcardSerializer
            return Response({"preview_cards": FlashcardSerializer(public_cards, many=True).data})

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
            # Fix: Allow public resources for saving tools (ownership is checked for the DECK instead)
            resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))

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
        # Allow public resources
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
        fmt = request.data.get('format', 'mcq')
        level = request.data.get('level', 'undergrad')
        count = int(request.data.get('count', 10))

        # [PREMIUM UPGRADE] Instant Curated Quiz
        # If public quiz exists for this resource, return it
        curated_quiz = Quiz.objects.filter(resource=resource, owner__username='flowstate_curator', format=fmt).first()
        if curated_quiz:
            return Response(QuizSerializer(curated_quiz).data)

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
        # Allow public resources
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
        
        # [PREMIUM UPGRADE] Instant Curated Mind Map
        curated_mm = resource.ai_notes_json.get('mind_map')
        if curated_mm:
            return Response(curated_mm)

        ai = AIService()
        mind_map = ai.generate_mind_map(resource)
        return Response(mind_map)


class GeneratePracticeQuestionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request, resource_id):
        # Allow public resources
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
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
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
        if resource.resource_type != 'video' or not resource.url:
            return Response({'error': 'Not a video resource.'}, status=status.HTTP_400_BAD_REQUEST)

        yt_data = process_youtube_url(resource.url)
        if not yt_data['success']:
            return Response({'error': 'Could not process video URL.'}, status=status.HTTP_400_BAD_REQUEST)

        if yt_data['has_transcript']:
            # Reset study kit state to force regeneration with new authentic transcript
            resource.has_study_kit = False
            resource.ai_notes_json = {}
            resource.status = 'processing'
            
            existing = [c for c in (resource.ai_concepts or []) if 'transcript' not in c]
            resource.ai_concepts = existing + [{'transcript': yt_data['transcript'][:80000]}]
            
            # Use background worker to regenerate the kit (avoids timeout)
            from django_q.tasks import async_task
            async_task('library.tasks.process_resource_task', resource.id)
            
            resource.save()
            return Response({'success': True, 'has_transcript': True, 'message': 'New authentic transcript secured! Regenerating Study Kit...'})
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
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
        problem = request.data.get('problem')
        if not problem:
            return Response({'error': 'No problem provided.'}, status=status.HTTP_400_BAD_REQUEST)
        
        ai = AIService()
        solution = ai.solve_math_problem(problem, context=ai._get_resource_context(resource))
        return Response(solution)

class CloneResourceView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, resource_id):
        # We allow cloning if they have access to view it (owner or workspace member)
        source = get_object_or_404(Resource, id=resource_id)
        
        # Access check
        if source.owner != request.user:
            from workspace.models import Workspace
            has_access = Workspace.objects.filter(resources=source, members=request.user).exists()
            if not has_access:
                return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        # Clone basic fields
        cloned = Resource.objects.create(
            owner=request.user,
            title=f"Saved: {source.title}",
            resource_type=source.resource_type,
            file=source.file,
            url=source.url,
            subject=source.subject,
            status=source.status,
            file_size=source.file_size,
            ai_summary=source.ai_summary,
            ai_notes_json=source.ai_notes_json,
            ai_concepts=source.ai_concepts,
            has_study_kit=source.has_study_kit,
        )

        # Clone extracted images
        for img in source.extracted_images.all():
            ResourceImage.objects.create(
                resource=cloned,
                image=img.image,
                page_number=img.page_number,
                description=img.description
            )

        return Response(ResourceSerializer(cloned, context={'request': request}).data)

class ResourceFileView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, resource_id):
        # The "Nuclear Option": Encode PDF to Base64 and return as JSON text
        # This makes it impossible for IDM to recognize it as a file to intercept.
        resource = get_object_or_404(Resource, id=resource_id)
        
        if not resource.file:
            return Response({'error': 'No file attached to this resource.'}, status=status.HTTP_404_NOT_FOUND)
            
        import base64
        file_data = resource.file.read()
        base64_data = base64.b64encode(file_data).decode('utf-8')
        
        return Response({
            'data': base64_data,
            'file_name': resource.file.name,
            'size': len(file_data)
        })
