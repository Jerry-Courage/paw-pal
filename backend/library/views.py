import os
import logging
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from django.conf import settings
from django.db.models import Count, Q, F
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

logger = logging.getLogger('nitemind')

def trigger_github_synthesis(resource_id):
    """
    Triggers the high-speed GitHub Action Engine via Repository Dispatch.
    This bypasses Vercel serverless timeouts and Render build limits.
    """
    import requests
    github_token = os.getenv('GITHUB_TOKEN')
    repo = os.getenv('GITHUB_REPO', 'Jerry-Courage/paw-pal')
    
    if not github_token:
        logger.warning("[GitHub Engine] No GITHUB_TOKEN found. Synthesis will not trigger automatically.")
        return False

    url = f"https://api.github.com/repos/{repo}/dispatches"
    headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }
    payload = {
        "event_type": "synthesis_triggered",
        "client_payload": {"resource_id": str(resource_id)}
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=5)
        if response.status_code == 204:
            logger.info(f"[GitHub Engine] Signal Sent: Successfully triggered synthesis for Resource {resource_id}")
            return True
        else:
            logger.error(f"[GitHub Engine] Connection Failed: {response.status_code} {response.text}")
    except Exception as e:
        logger.error(f"[GitHub Engine] Dispatch error: {str(e)}")
    
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

        # ── Freemium gate ────────────────────────────────────────
        user = request.user
        if not user.has_active_subscription:
            notes_used = user.total_resources_created
            if notes_used >= user.FREE_NOTES_LIMIT:
                return Response({
                    'error': 'free_limit_reached',
                    'message': f'You have used all {user.FREE_NOTES_LIMIT} free study kits. Upgrade to Premium for unlimited access.',
                    'notes_used': notes_used,
                    'notes_limit': user.FREE_NOTES_LIMIT,
                }, status=status.HTTP_402_PAYMENT_REQUIRED)

        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        import threading
        import json

        resource = serializer.save(owner=self.request.user)
        resource.file_size = resource.file.size if resource.file else 0
        resource.status_text = "🧬 Synthesis Engine Initializing..."

        # Increment lifetime counter — never decremented on delete
        user = self.request.user
        user.__class__.objects.filter(pk=user.pk).update(
            total_resources_created=F('total_resources_created') + 1
        )

        # Auto-detect resource_type for PPTX files
        if resource.file:
            import os as _os
            _ext = _os.path.splitext(resource.file.name)[1].lower()
            if _ext in ['.pptx', '.ppt']:
                resource.resource_type = 'slides'

        # Store selected features from the upload request
        raw_features = self.request.data.get('selected_features', '[]')
        try:
            features = json.loads(raw_features) if isinstance(raw_features, str) else raw_features
        except Exception:
            features = []
        resource.selected_features = features if isinstance(features, list) else []
        resource.save()

        # Run synthesis in a background thread on the same process (shares filesystem)
        def run():
            try:
                from library.tasks import process_resource_task
                process_resource_task(resource.id)
            except Exception as e:
                logger.error(f'[Synthesis Thread] Failed for resource {resource.id}: {e}')
            finally:
                from django.db import connection
                connection.close()

        t = threading.Thread(target=run, daemon=True)
        t.start()
        logger.info(f'[Synthesis Thread] Started for Resource {resource.id}')

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
        try:
            instance = self.get_object()
            if instance.owner_id != request.user.id:
                return Response(
                    {"error": f"Only the original owner can delete this resource. Owner ID: {instance.owner_id}, User ID: {request.user.id}"}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            return super().destroy(request, *args, **kwargs)
        except Exception as e:
            import traceback
            logger.error(f"[Delete Resource Error] {e}\n{traceback.format_exc()}")
            return Response(
                {"error": f"Deletion failed on server: {str(e)}"}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

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
            public_cards = Flashcard.objects.filter(resource=resource, owner__username='nitemind_curator')
            
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
        curated_quiz = Quiz.objects.filter(resource=resource, owner__username='nitemind_curator', format=fmt).first()
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
        qs = Flashcard.objects.filter(owner=self.request.user)
        resource_id = self.request.query_params.get('resource')
        if resource_id:
            qs = qs.filter(resource_id=resource_id)
        return qs


class QuizListView(generics.ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = QuizSerializer

    def get_queryset(self):
        qs = Quiz.objects.filter(owner=self.request.user)
        resource_id = self.request.query_params.get('resource')
        if resource_id:
            qs = qs.filter(resource_id=resource_id)
        return qs


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
        response['Content-Disposition'] = 'attachment; filename="nitemind_flashcards.csv"'

        writer = csv.writer(response)
        # Anki format: Front, Back, Tags
        for fc in flashcards:
            tags = f"nitemind {fc.subject} {fc.difficulty}".strip()
            writer.writerow([fc.question, fc.answer, tags])

        return response

class MathSolverView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    # Support both JSON (base64) and Multipart (direct file upload) requests
    from rest_framework.parsers import JSONParser
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, resource_id):
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
        problem = request.data.get('problem', '')
        image_data = request.data.get('image', '')
        
        # Check if a file was uploaded directly
        image_file = request.FILES.get('image_file')
        if image_file:
            import base64
            file_bytes = image_file.read()
            b64 = base64.b64encode(file_bytes).decode('utf-8')
            mime = image_file.content_type or 'image/png'
            image_data = f"data:{mime};base64,{b64}"
            
        if not problem and not image_data:
            return Response({'error': 'No problem statement or image provided.'}, status=status.HTTP_400_BAD_REQUEST)
        
        ai = AIService()
        solution = ai.solve_math_problem(problem, context=ai._get_resource_context(resource), image_data=image_data)
        return Response(solution)

class CloneResourceView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, resource_id):
        # We allow cloning if they have access to view it (owner or workspace member)
        source = get_object_or_404(Resource, id=resource_id)
        
        # Access check
        if source.owner_id != request.user.id:
            from workspace.models import Workspace
            has_access = Workspace.objects.filter(resources=source, members=request.user).exists()
            if not has_access:
                return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        # ── Freemium gate (cloning creates a new resource) ───────
        user = request.user
        if not user.has_active_subscription:
            notes_used = user.total_resources_created
            if notes_used >= user.FREE_NOTES_LIMIT:
                return Response({
                    'error': 'free_limit_reached',
                    'message': f'You have used all {user.FREE_NOTES_LIMIT} free study kits. Upgrade to Premium for unlimited access.',
                    'notes_used': notes_used,
                    'notes_limit': user.FREE_NOTES_LIMIT,
                }, status=status.HTTP_402_PAYMENT_REQUIRED)

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

        # Increment lifetime counter for the cloning user
        request.user.__class__.objects.filter(pk=request.user.pk).update(
            total_resources_created=F('total_resources_created') + 1
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
        resource = get_object_or_404(Resource, id=resource_id)
        
        if not resource.file:
            return Response({'error': 'No file attached to this resource.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            import base64, os
            # Check file exists before trying to read
            if not os.path.exists(resource.file.path):
                return Response({'error': 'File no longer available. Please re-upload.'}, status=status.HTTP_404_NOT_FOUND)
            file_data = resource.file.read()
            base64_data = base64.b64encode(file_data).decode('utf-8')
            return Response({
                'data': base64_data,
                'file_name': resource.file.name,
                'size': len(file_data)
            })
        except FileNotFoundError:
            return Response({'error': 'File no longer available. Please re-upload.'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"[ResourceFileView] Error reading file for resource {resource_id}: {e}")
            return Response({'error': 'Failed to read file.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class ReprocessResourceView(APIView):
    """
    Force a manual local synthesis triggered by the user.
    Useful as a failover if the GitHub Engine meets a 'Wall'.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, resource_id):
        from django_q.tasks import async_task
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        
        # Reset study kit state
        resource.has_study_kit = False
        resource.ai_notes_json = {}
        resource.status = 'processing'
        resource.status_text = "🧬 Force-Sync: Local Imperial Engine Engaged..."
        resource.save()
        
        # Trigger local background task
        async_task('library.tasks.process_resource_task', resource.id)
        
        logger.info(f'[Manual Failover] User {request.user.id} forced local synthesis for Resource {resource.id}')
        return Response({'success': True, 'message': 'Imperial Forge ignited locally. Check status in a few minutes.'})


class DBStatusView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        from django.db import connection
        try:
            cursor = connection.cursor()
            cursor.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """)
            tables = [r[0] for r in cursor.fetchall()]
            
            cursor.execute("SELECT app, name, applied FROM django_migrations")
            migrations = [
                {"app": r[0], "name": r[1], "applied": str(r[2])}
                for r in cursor.fetchall()
            ]
            
            return Response({
                "tables": tables,
                "migrations": migrations,
                "database_engine": connection.vendor
            })
        except Exception as e:
            return Response({"error": str(e)}, status=500)


class DebugResourceView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        resource = get_object_or_404(Resource, id=pk)
        return Response({
            'id': resource.id,
            'title': resource.title,
            'status': resource.status,
            'has_study_kit': resource.has_study_kit,
            'processing_progress': resource.processing_progress,
            'status_text': resource.status_text,
            'error_message': resource.status_text if resource.status == 'error' else '',
            'ai_notes_json_keys': list(resource.ai_notes_json.keys()) if isinstance(resource.ai_notes_json, dict) else type(resource.ai_notes_json).__name__,
            'ai_notes_json_len': len(resource.ai_notes_json) if resource.ai_notes_json else 0,
        })


class ResourceVRLayoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        resource = get_object_or_404(Resource, Q(id=pk) & (Q(owner=request.user) | Q(is_public=True)))
        
        # Check if already cached
        notes = resource.ai_notes_json or {}
        vr_layout = notes.get('vr_layout')
        if vr_layout:
            return Response(vr_layout)
            
        overview = notes.get('overview', {})
        sections = notes.get('sections', [])
        
        sections_summary = "\n".join([f"- {s.get('title')}: {s.get('content', '')[:150]}" for s in sections[:5]])
        subject = resource.subject or resource.title
        
        prompt = (
            f"You are a 3D spatial design assistant for a WebVR learning app.\n"
            f"Analyze this study material and design a 3D schematic/concept topology map representing the main ideas, architecture, or biological structure described.\n\n"
            f"Topic: {subject}\n"
            f"Overview: {overview.get('summary', '')[:300]}\n"
            f"Key Sections:\n{sections_summary}\n\n"
            "Return a structured JSON object containing a list of 'nodes' (each with an id, type, position, color, and label) and 'edges' (connections between node ids).\n"
            "Keep the scene clean and spacing comfortable for VR (coordinates x, y, z in meters, centering around y=1.2 to y=1.8, and z=-1.5 to z=-3.5).\n\n"
            "For each node, map its visual meaning to one of these allowed 3D model types: 'server' (infrastructure rack), 'database' (cylinder stack), 'client_device' (laptop/phone), 'organelle' (mitochondria), 'nucleus' (cell center), 'cell_membrane', 'atom', 'molecule', or 'state_node' (generic sphere).\n\n"
            "Format the response exactly as this JSON:\n"
            "{\n"
            '  "nodes": [\n'
            '    {"id": "node1", "type": "server"|"database"|"client_device"|"organelle"|"nucleus"|"cell_membrane"|"atom"|"molecule"|"state_node", "position": "x y z", "color": "#hex", "label": "Short label", "description": "1-sentence fact about this component"}\n'
            '  ],\n'
            '  "edges": [\n'
            '    {"from": "node1", "to": "node2", "color": "#hex", "label": "Relation text"}\n'
            '  ]\n'
            "}"
        )
        
        try:
            ai = AIService()
            raw_result = ai.chat_sync([{'role': 'user', 'content': prompt}])
            result = ai._parse_json(raw_result, {})
            
            # Cache layout in notes
            notes['vr_layout'] = result
            resource.ai_notes_json = notes
            resource.save(update_fields=['ai_notes_json'])
            
            return Response(result)
        except Exception as e:
            logger.error(f"Failed to generate VR layout: {e}")
            return Response({"error": f"Failed to generate layout: {str(e)}"}, status=500)
