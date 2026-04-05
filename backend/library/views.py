import os
import logging
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from django.conf import settings

from .models import Resource, Flashcard, Quiz
from .serializers import (
    ResourceSerializer, ResourceUploadSerializer,
    FlashcardSerializer, QuizSerializer
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
        import threading
        from .models import ResourceImage
        from .pdf_extractor import extract_pdf_content
        from django.core.files.base import ContentFile

        resource = serializer.save(owner=self.request.user)
        resource.file_size = resource.file.size if resource.file else 0
        resource.save()

        def process_resource_async(res_id):
            try:
                from .models import Resource
                res = Resource.objects.get(id=res_id)
                
                if res.resource_type == 'pdf' and res.file:
                    try:
                        pdf_data = extract_pdf_content(res.file.path)
                        text = pdf_data['text']
                        images = pdf_data.get('images', [])
                        page_count = pdf_data.get('page_count', 0)
                        logger.info(f'Resource {res.id}: {page_count} pages, {len(images)} images extracted')

                        # 1. Save extracted images to DB & build page → URL map
                        from django.conf import settings as django_settings
                        page_image_map = {}  # {page_number: absolute_media_url}

                        for img_data in images:
                            res_img = ResourceImage(
                                resource=res,
                                page_number=img_data['page']
                            )
                            image_name = f"res_{res.id}_p{img_data['page']}_{img_data.get('width',0)}x{img_data.get('height',0)}.{img_data['ext']}"
                            res_img.image.save(image_name, ContentFile(img_data['data']), save=False)
                            res_img.save()
                            # Build URL — stored as media path, frontend will prepend API_BASE
                            page_image_map[img_data['page']] = res_img.image.url

                        # 2. Store raw text for AI chat context
                        if text:
                            existing_concepts = [c for c in (res.ai_concepts or []) if 'extracted_text' not in c]
                            res.ai_concepts = existing_concepts + [{'extracted_text': text[:80000]}]

                        # 3. Generate Study Kit (AI Matrix Transformation)
                        # We pass context (text) and vision_data (page images) for OCR fallback.
                        ai = AIService()
                        try:
                            kit = ai.generate_study_kit(
                                res,
                                context=text or '',
                                page_image_map=page_image_map if page_image_map else None,
                                vision_data=pdf_data.get('page_images', [])
                            )
                            res.ai_notes_json = kit
                            res.has_study_kit = True
                            if not res.ai_summary:
                                res.ai_summary = kit.get('overview', {}).get('summary', '')[:1000]
                        except Exception as e:
                            logger.error(f'AI Study kit failed for {res.id}: {e}')
                    except Exception as e:
                        logger.error(f'PDF extract failed for {res.id}: {e}')

                elif res.resource_type == 'video' and res.url:
                    try:
                        yt_data = process_youtube_url(res.url)
                        if not yt_data.get('success'):
                            logger.error(f"YouTube processing returned not success for {res.id}: {yt_data.get('error', 'Unknown Error')}")
                            res.status = 'failed'
                            res.save()
                            return
                            
                        if not res.title or res.title == 'YouTube Video':
                            res.title = yt_data.get('title', 'YouTube Video')
                        
                        # Always generate a study kit to prevent infinite UI loader.
                        # If no transcript, AI handles it via _generate_basic_kit fallback.
                        ai = AIService()
                        kit = ai.generate_study_kit(res, context=yt_data.get('transcript') or '')
                        res.ai_notes_json = kit
                        res.has_study_kit = True
                        
                    except Exception as e:
                        logger.error(f'YouTube processing failed for {res.id}: {e}')
                        res.status = 'failed'
                        res.save()
                        return

                res.status = 'ready'
                res.save()
                
                # Notification
                try:
                    from users.notifications import notify_resource_ready
                    notify_resource_ready(res.owner, res.title, res.id)
                except Exception:
                    pass

            except Exception as e:
                logger.error(f'Background process failed for {res_id}: {e}')

        # Start background thread
        threading.Thread(target=process_resource_async, args=(resource.id,)).start()
        logger.info(f'Resource {resource.id} created by user {self.request.user.id}')
        # Notify user
        try:
            from users.notifications import notify_resource_ready
            notify_resource_ready(self.request.user, resource.title, resource.id)
        except Exception:
            pass

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

        flashcards = []
        for item in flashcards_data:
            fc = Flashcard.objects.create(
                resource=resource,
                owner=request.user,
                question=item.get('question', ''),
                answer=item.get('answer', ''),
                subject=resource.subject,
                difficulty=item.get('difficulty', 'medium'),
            )
            flashcards.append(fc)

        return Response(FlashcardSerializer(flashcards, many=True).data)


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
