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
from django.urls import reverse

from .models import Resource, Flashcard, Quiz, Deck, ResourceImage, SourceBookmark
from .serializers import (
    ResourceSerializer, ResourceListSerializer, ResourceUploadSerializer,
    FlashcardSerializer, QuizSerializer, DeckSerializer, SourceBookmarkSerializer
)
from .youtube import process_youtube_url
from .pdf_extractor import extract_pdf_text
from ai_assistant.services import AIService
from core.throttling import UploadRateThrottle, AIRateThrottle
from .sketchfab_service import get_model_uid, get_embed_url

logger = logging.getLogger('nitemind')


class SourceBookmarkListCreateView(generics.ListCreateAPIView):
    serializer_class = SourceBookmarkSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_resource(self):
        return get_object_or_404(Resource, Q(id=self.kwargs['resource_id']) & (Q(owner=self.request.user) | Q(is_public=True)))

    def get_queryset(self):
        return SourceBookmark.objects.filter(user=self.request.user, resource=self.get_resource())

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, resource=self.get_resource())


class SourceBookmarkDetailView(generics.DestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return SourceBookmark.objects.filter(user=self.request.user)

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

# Dynamic max size: R2 allows larger files, Cloudinary limited to 10MB
def _get_max_upload_size():
    from library.hybrid_storage import _r2_configured, CLOUDINARY_LIMIT
    if _r2_configured():
        return 200 * 1024 * 1024  # 200MB with R2 (R2 supports up to 5GB)
    return CLOUDINARY_LIMIT      # 10MB Cloudinary only


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
        return ResourceListSerializer

    def get_queryset(self):
        # Defer the two heaviest columns — ai_notes_json and ai_summary are
        # large blobs only needed on the detail page, not the library grid.
        qs = (
            Resource.objects
            .filter(owner=self.request.user)
            .select_related('owner')
            .defer('ai_notes_json', 'ai_summary')
        )
        resource_type = self.request.query_params.get('type')
        if resource_type:
            qs = qs.filter(resource_type=resource_type)
        return qs

    def create(self, request, *args, **kwargs):
        uploaded_file = request.FILES.get('file')
        if uploaded_file:
            # Reject macOS metadata files (._ prefix) — they're junk resource forks
            if uploaded_file.name.startswith('._'):
                return Response({'error': 'macOS metadata files (._) are not supported.'}, status=status.HTTP_400_BAD_REQUEST)
            ext = os.path.splitext(uploaded_file.name)[1].lower()
            if ext not in ALLOWED_EXTENSIONS:
                return Response({'error': f'File type {ext} not allowed.'}, status=status.HTTP_400_BAD_REQUEST)
            max_size = _get_max_upload_size()
            if uploaded_file.size > max_size:
                max_mb = max_size // (1024 * 1024)
                return Response({'error': f'File too large. Maximum {max_mb}MB.'}, status=status.HTTP_400_BAD_REQUEST)

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

        uploaded_file = self.request.FILES.get('file', None)
        file_size_bytes = uploaded_file.size if uploaded_file else 0
        ext = os.path.splitext(uploaded_file.name)[1].lower() if uploaded_file else ''

        # Route large files to R2 (bypass Cloudinary's 10MB limit)
        storage_backend = 'cloudinary'
        r2_key = ''
        if uploaded_file and file_size_bytes > 10 * 1024 * 1024:
            from library.hybrid_storage import _r2_configured, _upload_to_r2
            if _r2_configured():
                try:
                    storage_backend, r2_key, _ = _upload_to_r2(
                        uploaded_file, uploaded_file.name, uploaded_file.content_type
                    )
                    serializer.validated_data.pop('file', None)
                    resource = serializer.save(
                        owner=self.request.user,
                        file_size=file_size_bytes,
                        storage_backend=storage_backend,
                        r2_key=r2_key,
                    )
                except Exception as e:
                    logger.error(f'[R2 Upload] Failed: {e}')
                    resource = serializer.save(owner=self.request.user, file_size=file_size_bytes)
            else:
                resource = serializer.save(owner=self.request.user, file_size=file_size_bytes)
        elif uploaded_file and ext in ['.pptx', '.ppt', '.doc', '.docx', '.mp4']:
            # Convert PPTX/PPT to PDF via LibreOffice so it goes through the
            # same MediaCloudinaryStorage pipeline as PDFs (avoids raw upload issues)
            if ext in ['.pptx', '.ppt']:
                try:
                    import subprocess, tempfile
                    with tempfile.TemporaryDirectory() as tmpdir:
                        src_path = os.path.join(tmpdir, f'input{ext}')
                        with open(src_path, 'wb') as f:
                            f.write(uploaded_file.read())
                        uploaded_file.seek(0)
                        result = subprocess.run(
                            ['libreoffice', '--headless', '--norestore',
                             '--convert-to', 'pdf', '--outdir', tmpdir, src_path],
                            capture_output=True, timeout=120,
                        )
                        if result.returncode == 0:
                            pdf_path = os.path.join(tmpdir, 'input.pdf')
                            if os.path.exists(pdf_path):
                                from django.core.files.base import ContentFile
                                with open(pdf_path, 'rb') as f:
                                    pdf_bytes = f.read()
                                # Replace the uploaded file with the converted PDF
                                uploaded_file = ContentFile(pdf_bytes, name=uploaded_file.name.rsplit('.', 1)[0] + '.pdf')
                                ext = '.pdf'
                                file_size_bytes = len(pdf_bytes)
                                logger.info(f'[Upload] PPTX→PDF conversion succeeded for {uploaded_file.name}')
                except Exception as e:
                    logger.warning(f'[Upload] PPTX→PDF conversion failed, falling back to raw upload: {e}')

            if ext in ['.pptx', '.ppt', '.doc', '.docx', '.mp4']:
                # Try R2 first (handles large files better), fall back to Cloudinary raw
                from .hybrid_storage import _r2_configured, _upload_to_r2
                if _r2_configured() and file_size_bytes > 10 * 1024 * 1024:
                    try:
                        storage_backend, r2_key, _ = _upload_to_r2(uploaded_file, uploaded_file.name)
                        serializer.validated_data.pop('file', None)
                        resource = serializer.save(
                            owner=self.request.user,
                            file_size=file_size_bytes,
                            storage_backend=storage_backend,
                            r2_key=r2_key,
                        )
                        logger.info(f'[Upload] PPTX→R2 for {uploaded_file.name}: {r2_key}')
                    except Exception as e:
                        logger.error(f'[R2 Upload] Failed for {uploaded_file.name}: {e}')
                        resource = serializer.save(owner=self.request.user, file_size=file_size_bytes)
                else:
                    try:
                        import cloudinary.uploader
                        result = cloudinary.uploader.upload(
                            uploaded_file,
                            resource_type='raw',
                            folder='resources',
                        )
                        cloudinary_id = result.get('public_id', '')
                        _KNOWN_EXTENSIONS = {'.pdf', '.docx', '.doc', '.pptx', '.ppt', '.txt', '.md', '.csv',
                                             '.mp4', '.mp3', '.wav', '.webm', '.m4a', '.ogg',
                                             '.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.heif'}
                        _existing_ext = os.path.splitext(cloudinary_id)[1].lower() if cloudinary_id else ''
                        if cloudinary_id and _existing_ext not in _KNOWN_EXTENSIONS:
                            cloudinary_id = cloudinary_id + ext
                        serializer.validated_data.pop('file', None)
                        resource = serializer.save(
                            owner=self.request.user,
                            file_size=file_size_bytes,
                        )
                        resource.file.name = cloudinary_id
                        resource.save(update_fields=['file', 'file_size'])
                    except Exception as e:
                        logger.error(f'[Cloudinary Raw Upload] Failed for {uploaded_file.name}: {e}')
                        resource = serializer.save(owner=self.request.user, file_size=file_size_bytes)
            else:
                # Converted to PDF — fall through to default MediaCloudinaryStorage path
                resource = serializer.save(owner=self.request.user, file_size=file_size_bytes)
        else:
            resource = serializer.save(owner=self.request.user, file_size=file_size_bytes)

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

        # Auto-detect resource_type from URL when no file is present
        if not resource.file and resource.url:
            _url = resource.url.lower()
            if any(x in _url for x in ['youtube.com', 'youtu.be', 'youtube.com/shorts']):
                resource.resource_type = 'video'
                if not resource.title or resource.title == resource.url:
                    resource.title = 'YouTube Video'
            else:
                resource.resource_type = 'other'
                if not resource.title or resource.title == resource.url:
                    from urllib.parse import urlparse as _urlparse
                    try:
                        _netloc = _urlparse(resource.url).netloc
                        resource.title = _netloc or 'Web Article'
                    except Exception:
                        resource.title = 'Web Article'

        # Store selected features from the upload request
        raw_features = self.request.data.get('selected_features', '[]')
        try:
            features = json.loads(raw_features) if isinstance(raw_features, str) else raw_features
        except Exception:
            features = []
        resource.selected_features = features if isinstance(features, list) else []
        # Use update_fields to avoid the NOT NULL violation on file_size — the initial
        # serializer.save() inserts the row before file_size is set on the Python object.
        resource.save(update_fields=['title', 'file_size', 'status_text', 'resource_type', 'selected_features', 'storage_backend', 'r2_key'])

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


class ResourceReadingView(APIView):
    """Durable, compact reading payload independent of the uploaded binary."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, resource_id):
        resource = get_object_or_404(Resource.objects.filter(
            Q(owner=request.user) | Q(workspaces__members=request.user) | Q(is_public=True)
        ).distinct(), id=resource_id)
        notes = resource.ai_notes_json if isinstance(resource.ai_notes_json, dict) else {}
        has_original_reference = self._original_exists(resource)
        original_url = request.build_absolute_uri(
            reverse('resource-file', kwargs={'resource_id': resource.id})
        ) if has_original_reference else None
        return Response({
            'id': resource.id,
            'title': resource.title,
            'resource_type': resource.resource_type,
            'subject': resource.subject,
            'status': resource.status,
            'ai_summary': resource.ai_summary,
            'sections': notes.get('sections', []),
            'original_available': has_original_reference,
            'original_url': original_url,
            'processed_content_available': bool(resource.ai_summary or notes.get('sections')),
        })

    @staticmethod
    def _original_exists(resource):
        if resource.resource_type == 'video' and resource.url:
            return True
        if resource.storage_backend == 'r2' and resource.r2_key:
            try:
                from library.hybrid_storage import _get_r2_client
                _get_r2_client().head_object(Bucket=settings.R2_BUCKET_NAME, Key=resource.r2_key)
                return True
            except Exception as exc:
                logger.warning('[ResourceReadingView] R2 original unavailable for %s: %s', resource.id, exc)
                return False
        if not resource.file:
            return False
        try:
            return resource.file.storage.exists(resource.file.name)
        except Exception as exc:
            logger.warning('[ResourceReadingView] Original availability check failed for %s: %s', resource.id, exc)
            return False


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
        fmt = request.data.get('format', 'mcq')
        ai = AIService()
        questions = ai.generate_practice_questions(resource, difficulty, count, format=fmt)
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

def generate_fallback_pdf(resource) -> bytes:
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    import io

    title_str = str(resource.title[0] if isinstance(resource.title, list) else (resource.title or 'Document'))
    subject_str = str(resource.subject[0] if isinstance(resource.subject, list) else (resource.subject or ''))
    summary_str = str(resource.ai_summary[0] if isinstance(resource.ai_summary, list) else (resource.ai_summary or ''))

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=54, leftMargin=54, topMargin=54, bottomMargin=54)
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontSize=20,
        leading=24,
        textColor=colors.HexColor('#1e293b'),
        spaceAfter=6
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontSize=11,
        leading=14,
        textColor=colors.HexColor('#64748b'),
        spaceAfter=12
    )
    heading_style = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontSize=13,
        leading=16,
        textColor=colors.HexColor('#f97316'),
        spaceBefore=12,
        spaceAfter=4
    )
    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#334155'),
        spaceAfter=8
    )

    story = []
    story.append(Paragraph(title_str, title_style))
    if subject_str:
        story.append(Paragraph(f"Subject: {subject_str}", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e2e8f0'), spaceAfter=12))

    if summary_str:
        story.append(Paragraph("AI Summary", heading_style))
        story.append(Paragraph(summary_str, body_style))
        story.append(Spacer(1, 8))

    notes = resource.ai_notes_json
    if isinstance(notes, dict) and notes.get('sections'):
        story.append(Paragraph("Study Notes & Sections", heading_style))
        for idx, sec in enumerate(notes.get('sections', [])):
            sec_title = f"{idx + 1}. {str(sec.get('title', 'Section'))}"
            story.append(Paragraph(sec_title, ParagraphStyle('SecTitle', parent=heading_style, fontSize=11, leading=14, textColor=colors.HexColor('#0f172a'), spaceBefore=8, spaceAfter=2)))
            if sec.get('key_question'):
                story.append(Paragraph(f"<b>Key Question:</b> {str(sec.get('key_question'))}", body_style))
            if sec.get('plain_english'):
                story.append(Paragraph(str(sec.get('plain_english')), body_style))
            if sec.get('deep_dive'):
                story.append(Paragraph(str(sec.get('deep_dive')), body_style))
            story.append(Spacer(1, 4))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()


class ResourceFileView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, resource_id):
        resource = get_object_or_404(Resource, id=resource_id)

        if not resource.file:
            # If no file attached, fallback to generated study PDF
            try:
                file_data = generate_fallback_pdf(resource)
            except Exception:
                return Response({'error': 'No file attached to this resource.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            file_data = None

            # 1. Use hybrid storage (Cloudinary or R2)
            try:
                from library.hybrid_storage import get_file_bytes
                file_data = get_file_bytes(resource)
            except Exception as e:
                logger.warning(f"[ResourceFileView] Hybrid storage download failed for {resource.id}: {e}")

            # 2. Fallback: Django default_storage
            if not file_data:
                try:
                    from django.core.files.storage import default_storage
                    if default_storage.exists(resource.file.name):
                        with default_storage.open(resource.file.name, 'rb') as f:
                            file_data = f.read()
                except Exception as e:
                    logger.warning(f"[ResourceFileView] default_storage failed for {resource.file.name}: {e}")

            if not file_data:
                try:
                    # 3. Fallback: resource.file.url via requests
                    if hasattr(resource.file, 'url') and resource.file.url:
                        import requests
                        resp = requests.get(resource.file.url, timeout=20)
                        if resp.ok:
                            file_data = resp.content
                except Exception as e:
                    logger.warning(f"[ResourceFileView] requests.get failed for URL: {e}")

            # If cloud/local retrieval failed, fallback to generated study PDF so viewer never breaks
            if not file_data:
                try:
                    file_data = generate_fallback_pdf(resource)
                except Exception as e:
                    logger.error(f"[ResourceFileView] Fallback PDF generation failed: {e}")
                    return Response({'error': 'Original file not available.'}, status=status.HTTP_404_NOT_FOUND)

        if request.GET.get('raw') == '1':
            from django.http import HttpResponse
            title_str = str(resource.title[0] if isinstance(resource.title, list) else (resource.title or 'Document'))
            response = HttpResponse(file_data, content_type='application/pdf')
            response['Content-Disposition'] = f'inline; filename="{title_str.replace(" ", "_")}.pdf"'
            return response

        import base64
        base64_data = base64.b64encode(file_data).decode('utf-8')
        title_str = str(resource.title[0] if isinstance(resource.title, list) else (resource.title or 'Document'))
        return Response({
            'data': base64_data,
            'file_name': f"{title_str.replace(' ', '_')}.pdf",
            'size': len(file_data)
        })

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
        
        # Return cached layout unless ?refresh=1 is requested
        notes = resource.ai_notes_json or {}
        vr_layout = notes.get('vr_layout')
        if vr_layout and not request.query_params.get('refresh'):
            return Response(vr_layout)
            
        overview = notes.get('overview', {})
        sections = notes.get('sections', [])
        
        sections_summary = "\n".join([f"- {s.get('title')}: {s.get('content', '')[:150]}" for s in sections[:7]])
        subject = resource.subject or resource.title
        
        prompt = (
            f"You are a 3D visual design assistant for a WebVR educational app.\n"
            f"Analyze this study material and create a concept map of the most important concepts.\n\n"
            f"Topic: {subject}\n"
            f"Overview: {overview.get('summary', '')[:300]}\n"
            f"Key Sections:\n{sections_summary}\n\n"
            "IMPORTANT: Return ONLY valid JSON. No markdown, no code fences, no explanation.\n\n"
            "Each node MUST have a 'sketchfab_keyword' field.\n"
            "This is the EXACT search query to find a relevant 3D anatomy/science model on Sketchfab.\n"
            "RULES for sketchfab_keyword:\n"
            "  - Must be 2-4 words\n"
            "  - Must be a PHYSICAL OBJECT that exists as a 3D model\n"
            "  - For anatomy: use 'human [organ] anatomy' e.g. 'human liver anatomy', 'human stomach anatomy'\n"
            "  - For chemistry: use '[molecule] molecule 3d' e.g. 'water molecule 3d', 'dna helix 3d'\n"
            "  - For physics: use the object name e.g. 'pendulum physics', 'electric circuit'\n"
            "  - For history: use specific artifact e.g. 'pyramids giza', 'roman colosseum'\n"
            "  - For abstract concepts (digestion, absorption): use the ORGAN that performs it\n"
            "  - NEVER use abstract process words like 'digestion', 'absorption', 'regulation'\n"
            "  - NEVER use vague words like 'system', 'process', 'function', 'mechanism'\n\n"
            "GOOD examples: 'human liver anatomy', 'small intestine anatomy', 'dna helix 3d'\n"
            "BAD examples: 'digestion', 'mechanical digestion', 'nutrient absorption', 'mouth'\n\n"
            "Each node must have ONE of these exact type values:\n"
            "  'object' -> physical object, organ, structure, device\n"
            "  'concept' -> abstract idea, process, theory\n"
            "  'entity' -> organism, element, compound\n"
            "  'default' -> anything else\n\n"
            "Labels: max 4 words. Descriptions: exactly 1 factual sentence.\n"
            "Generate 5 to 7 nodes representing physical objects/organs (not processes).\n\n"
            "Return JSON in this exact format:\n"
            "{\n"
            '  "nodes": [\n'
            '    {"id": "n1", "type": "object", "color": "#ef4444", "label": "Liver", '
            '"description": "The liver filters blood and produces bile for digestion.", '
            '"sketchfab_keyword": "human liver anatomy"}\n'
            '  ],\n'
            '  "edges": [\n'
            '    {"from": "n1", "to": "n2", "color": "#ffffff", "label": "connects to"}\n'
            '  ]\n'
            "}"
        )
        
        try:
            ai = AIService()
            raw_result = ai.chat_sync([{'role': 'user', 'content': prompt}])
            result = ai._parse_json(raw_result, {})

            # Pre-fetch Sketchfab model UIDs for each node during layout generation
            # This stores the exact model UID so runtime display is instant and accurate
            from .sketchfab_service import get_model_uid, get_embed_url
            if result.get('nodes'):
                for node in result['nodes']:
                    keyword = node.get('sketchfab_keyword') or node.get('label', '')
                    if keyword:
                        uid = get_model_uid(keyword)
                        if uid:
                            node['model_uid'] = uid
                            node['embed_url'] = get_embed_url(uid)

            # Cache layout in notes
            notes['vr_layout'] = result
            resource.ai_notes_json = notes
            resource.save(update_fields=['ai_notes_json'])
            
            return Response(result)
        except Exception as e:
            logger.error(f"Failed to generate VR layout: {e}")
            return Response({"error": f"Failed to generate layout: {str(e)}"}, status=500)


class SketchfabModelView(APIView):
    """Searches Sketchfab for the best free 3D model matching an educational keyword."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        keyword = request.query_params.get('q', '').strip()
        if not keyword:
            return Response({'error': 'Query parameter ?q= is required'}, status=400)

        uid = get_model_uid(keyword)
        if not uid:
            return Response({'found': False, 'keyword': keyword})

        return Response({
            'found': True,
            'keyword': keyword,
            'uid': uid,
            'embed_url': get_embed_url(uid),
            'viewer_url': f'https://sketchfab.com/models/{uid}',
        })


class SectionQuizView(APIView):
    """
    POST /api/library/resources/<id>/section-quiz/
    Body: { "section_title": "...", "section_content": "..." }
    Returns 3 quick MCQ questions generated from that specific section.
    Used by Study Mode to quiz the user before advancing to the next section.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, resource_id):
        section_title = request.data.get('section_title', '').strip()
        section_content = request.data.get('section_content', '').strip()

        if not section_title or not section_content:
            return Response({'error': 'section_title and section_content are required'}, status=400)

        prompt = (
            f"Generate exactly 3 multiple-choice questions to test understanding of this study section.\n\n"
            f"SECTION: {section_title}\n"
            f"CONTENT: {section_content[:1500]}\n\n"
            "RULES:\n"
            "- Each question tests ONE specific fact from this section\n"
            "- 4 options each (A, B, C, D)\n"
            "- Only ONE correct answer per question\n"
            "- Wrong options should be plausible, not obviously silly\n"
            "- Questions should be answerable from the content above\n"
            "- Keep questions concise — max 20 words each\n\n"
            "Return ONLY valid JSON:\n"
            '{"questions": ['
            '{"question": "...", "options": ["A. ...", "B. ...", "C. ...", "D. ..."], '
            '"correct": "A. ...", "explanation": "Brief 1-sentence explanation"}'
            ']}'
        )

        try:
            from ai_assistant.services import AIService
            ai = AIService()
            raw = ai.chat_sync([{'role': 'user', 'content': prompt}])
            result = ai._parse_json(raw, {})
            questions = result.get('questions', [])
            if not questions:
                return Response({'error': 'Could not generate questions'}, status=500)
            return Response({'questions': questions[:3]})
        except Exception as e:
            logger.error(f'[SectionQuiz] Failed for resource {resource_id}: {e}')
            return Response({'error': str(e)}, status=500)


class ResourceSceneView(APIView):
    """
    POST /api/library/resources/<id>/scene/
    Generate or retrieve a SceneSpec for VR learning.

    POST body: { "refresh": true } to force regeneration.
    GET: return cached scene if available.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        resource = get_object_or_404(
            Resource, Q(id=pk) & (Q(owner=request.user) | Q(is_public=True))
        )
        notes = resource.ai_notes_json or {}
        scene = notes.get('vr_scene')
        if scene:
            return Response(scene)
        return Response({'error': 'No scene generated yet'}, status=404)

    def post(self, request, pk):
        resource = get_object_or_404(
            Resource, Q(id=pk) & (Q(owner=request.user) | Q(is_public=True))
        )
        refresh = request.data.get('refresh', False)

        from .scene_planner import generate_scene_spec, generate_deterministic_scene

        # Try AI scene planner first
        scene = generate_scene_spec(resource, refresh=refresh)

        # Fall back to deterministic generator
        if not scene:
            scene = generate_deterministic_scene(resource)

        # Persist into ai_notes_json
        if scene:
            notes = resource.ai_notes_json or {}
            notes['vr_scene'] = scene
            resource.ai_notes_json = notes
            resource.save(update_fields=['ai_notes_json'])

        return Response(scene or {'error': 'Failed to generate scene'}, status=200 if scene else 500)
