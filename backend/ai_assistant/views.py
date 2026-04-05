import json
import logging
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.http import StreamingHttpResponse

from .models import ChatSession, ChatMessage
from .serializers import ChatSessionSerializer, ChatMessageSerializer
from .services import AIService
from library.models import Resource
from core.throttling import AIRateThrottle

logger = logging.getLogger('flowstate')


def _get_history(session, exclude_last=True):
    """Get chat history as list, optionally excluding the last message."""
    msgs = list(session.messages.order_by('created_at'))
    if exclude_last and msgs:
        msgs = msgs[:-1]
    return [{'role': m.role, 'content': m.content} for m in msgs]


class ChatSessionListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ChatSessionSerializer

    def get_queryset(self):
        return ChatSession.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ChatSessionDetailView(generics.RetrieveDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ChatSessionSerializer

    def get_queryset(self):
        return ChatSession.objects.filter(user=self.request.user)


class SendMessageView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request, session_id):
        session = get_object_or_404(ChatSession, id=session_id, user=request.user)
        content = request.data.get('content', '').strip()
        if not content:
            return Response({'error': 'Message content required.'}, status=status.HTTP_400_BAD_REQUEST)

        ChatMessage.objects.create(session=session, role='user', content=content)
        history = _get_history(session, exclude_last=True)

        ai = AIService()
        try:
            if session.context_type == 'resource' and session.resource:
                reply = ai.ask_about_resource(session.resource, content, history)
            elif session.context_type == 'group' and session.group:
                reply = ai.group_chat_assist(session.group.name, '', content)
            else:
                reply = ai.chat(history + [{'role': 'user', 'content': content}])
        except Exception as e:
            logger.error(f'AI error in session {session_id}: {e}')
            return Response({'error': f"AI Assist failed: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        assistant_msg = ChatMessage.objects.create(session=session, role='assistant', content=reply)
        session.save()
        return Response(ChatMessageSerializer(assistant_msg).data)


class StreamMessageView(APIView):
    """Server-Sent Events streaming for real-time AI responses."""
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request, session_id):
        session = get_object_or_404(ChatSession, id=session_id, user=request.user)
        content = request.data.get('content', '').strip()
        if not content:
            return Response({'error': 'Message content required.'}, status=status.HTTP_400_BAD_REQUEST)

        ChatMessage.objects.create(session=session, role='user', content=content)
        history = _get_history(session, exclude_last=True)

        ai = AIService()
        full_reply = []

        def event_stream():
            if session.context_type == 'resource' and session.resource:
                messages = _build_resource_messages(ai, session.resource, content, history)
            elif session.context_type == 'group' and session.group:
                messages = [
                    {'role': 'system', 'content': f"You are FlowAI for group '{session.group.name}'."},
                    {'role': 'user', 'content': content}
                ]
            else:
                messages = history + [{'role': 'user', 'content': content}]

            for chunk in ai.chat_stream(messages):
                full_reply.append(chunk)
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"

            complete = ''.join(full_reply)
            ChatMessage.objects.create(session=session, role='assistant', content=complete)
            session.save()
            yield f"data: {json.dumps({'done': True})}\n\n"

        response = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response


def _build_resource_messages(ai, resource, content, history):
    context = ai._get_resource_context(resource)
    has_notes = bool(resource.ai_notes_json)
    system = (
        f"You are FlowAI, the AI Study Partner for '{resource.title}' (Subject: {resource.subject or 'General'}). "
        f"{'A FlowAI Study Kit has been generated — use it to give precise, targeted answers. ' if has_notes else ''}"
    )
    if context:
        system += f"\n\n{context}\n\nUse the above as your primary reference. When referencing notes, be specific about section names and vocabulary."
    messages = [{'role': 'system', 'content': system}]
    messages.extend(history[-10:])
    messages.append({'role': 'user', 'content': content})
    return messages


class QuickAskView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request):
        question = request.data.get('question', '').strip()
        resource_id = request.data.get('resource_id')
        if not question:
            return Response({'error': 'Question required.'}, status=status.HTTP_400_BAD_REQUEST)

        ai = AIService()
        try:
            if resource_id:
                resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
                answer = ai.ask_about_resource(resource, question)
            else:
                answer = ai.chat([{'role': 'user', 'content': question}])
        except Exception as e:
            logger.error(f'QuickAsk error: {e}')
            answer = "Error processing your question. Please try again."

        return Response({'answer': answer})


class SummarizeResourceView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request, resource_id):
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        ai = AIService()
        try:
            summary = ai.summarize_resource(resource)
            resource.ai_summary = summary
            resource.save()
        except Exception as e:
            logger.error(f'Summarize error for resource {resource_id}: {e}')
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response({'summary': summary})


class StudyNudgeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        recent = list(
            request.user.resources.values_list('subject', flat=True)
            .exclude(subject='').distinct()[:5]
        )
        ai = AIService()
        try:
            nudge = ai.generate_study_nudge(request.user, recent)
        except Exception:
            nudge = "Keep up the great work! Consistency is key to mastering any subject."
        return Response({'nudge': nudge})


class ExplainTextView(APIView):
    """Explain a highlighted piece of text."""
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request):
        text = request.data.get('text', '').strip()
        context = request.data.get('context', '')
        if not text:
            return Response({'error': 'Text required.'}, status=status.HTTP_400_BAD_REQUEST)
        ai = AIService()
        explanation = ai.explain_text(text, context)
        return Response({'explanation': explanation})


class KeyConceptsView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def get(self, request, resource_id):
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        cached = next((c.get('concepts') for c in (resource.ai_concepts or []) if 'concepts' in c), None)
        return Response({'concepts': cached, 'cached': cached is not None})

    def post(self, request, resource_id):
        """Generate only — does NOT save."""
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        ai = AIService()
        concepts = ai.extract_key_concepts(resource)
        return Response({'concepts': concepts})


class StudyNotesView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def get(self, request, resource_id):
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        cached = next((c.get('study_notes') for c in (resource.ai_concepts or []) if 'study_notes' in c), None)
        return Response({'notes': cached, 'cached': cached is not None})

    def post(self, request, resource_id):
        """Generate only — does NOT save."""
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        ai = AIService()
        notes = ai.generate_study_notes(resource)
        return Response({'notes': notes})


class MindMapView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def get(self, request, resource_id):
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        cached = next((c.get('mind_map') for c in (resource.ai_concepts or []) if 'mind_map' in c), None)
        return Response({'mind_map': cached, 'cached': cached is not None})

    def post(self, request, resource_id):
        """Generate only — does NOT save."""
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        ai = AIService()
        mind_map = ai.generate_mind_map(resource)
        return Response({'mind_map': mind_map})


class PracticeQuestionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def get(self, request, resource_id):
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        cached = next((c.get('practice_questions') for c in (resource.ai_concepts or []) if 'practice_questions' in c), None)
        return Response({'questions': cached, 'cached': cached is not None})

    def post(self, request, resource_id):
        """Generate only — does NOT save."""
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        difficulty = request.data.get('difficulty', 'medium')
        count = min(int(request.data.get('count', 5)), 20)  # cap at 20
        ai = AIService()
        questions = ai.generate_practice_questions(resource, difficulty, count)
        return Response({'questions': questions})


class GradeAnswerView(APIView):
    """Grade a student's answer to a practice question."""
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request, resource_id):
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        question = request.data.get('question', '').strip()
        user_answer = request.data.get('user_answer', '').strip()
        model_answer = request.data.get('model_answer', '').strip()

        if not question or not user_answer:
            return Response({'error': 'Question and answer are required.'}, status=status.HTTP_400_BAD_REQUEST)

        ai = AIService()
        context = ai._get_resource_context(resource)
        result = ai.grade_answer(question, user_answer, model_answer, context)
        return Response(result)


class SaveContentView(APIView):
    """Explicitly save generated AI content to a resource."""
    permission_classes = [permissions.IsAuthenticated]

    ALLOWED_TYPES = {'concepts', 'study_notes', 'mind_map', 'practice_questions', 'chapters'}

    def post(self, request, resource_id):
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        content_type = request.data.get('type')
        data = request.data.get('data')

        if content_type not in self.ALLOWED_TYPES:
            return Response({'error': f'Invalid type. Must be one of: {", ".join(self.ALLOWED_TYPES)}'}, status=status.HTTP_400_BAD_REQUEST)

        if not data:
            return Response({'error': 'No data to save.'}, status=status.HTTP_400_BAD_REQUEST)

        # Remove existing entry of this type and add new one
        existing = [c for c in (resource.ai_concepts or []) if content_type not in c]
        resource.ai_concepts = existing + [{content_type: data}]
        resource.save()

        return Response({'saved': True, 'type': content_type})



class ChapterSummariesView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def get(self, request, resource_id):
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        cached = next((c.get('chapters') for c in (resource.ai_concepts or []) if 'chapters' in c), None)
        return Response({'chapters': cached, 'cached': cached is not None})

    def post(self, request, resource_id):
        """Generate only — does NOT save."""
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        if resource.resource_type != 'video':
            return Response({'error': 'Only available for video resources.'}, status=status.HTTP_400_BAD_REQUEST)
        transcript = ''
        if resource.ai_concepts:
            for c in resource.ai_concepts:
                transcript = c.get('transcript', '')
                if transcript:
                    break
        if not transcript:
            return Response({'error': 'No transcript available for this video.'}, status=status.HTTP_400_BAD_REQUEST)
        ai = AIService()
        chapters = ai.generate_chapter_summaries(transcript, resource.title)
        return Response({'chapters': chapters})



class VisionMessageView(APIView):
    """Send a message with an attached image or file that the AI reads."""
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request, session_id):
        session = get_object_or_404(ChatSession, id=session_id, user=request.user)
        content = request.data.get('content', '').strip()
        uploaded_file = request.FILES.get('file')

        if not content and not uploaded_file:
            return Response({'error': 'Message or file required.'}, status=status.HTTP_400_BAD_REQUEST)

        ai = AIService()
        messages_to_send = []
        display_content = content
        is_vision = False
        ext = ''

        # Get chat history for context
        history = list(session.messages.order_by('created_at'))
        history_msgs = [{'role': m.role, 'content': m.content} for m in history[-10:]]

        if uploaded_file:
            import os
            ext = os.path.splitext(uploaded_file.name)[1].lower()

            if ext in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
                import base64
                img_data = base64.b64encode(uploaded_file.read()).decode('utf-8')
                mime = 'image/jpeg' if ext in ['.jpg', '.jpeg'] else f'image/{ext[1:]}'
                is_vision = True

                # Build multimodal message — include history as text, then the image message
                messages_to_send = history_msgs + [{
                    'role': 'user',
                    'content': [
                        {
                            'type': 'text',
                            'text': content if content else 'Please analyze this image in detail. Describe what you see, identify any educational content, diagrams, text, or concepts, and explain them clearly.'
                        },
                        {
                            'type': 'image_url',
                            'image_url': {
                                'url': f'data:{mime};base64,{img_data}',
                                'detail': 'high'
                            }
                        }
                    ]
                }]
                display_content = f"[Image: {uploaded_file.name}]{chr(10)}{content}" if content else f"[Image: {uploaded_file.name}]"

            elif ext == '.pdf':
                from library.pdf_extractor import extract_pdf_text
                try:
                    import tempfile
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as tmp:
                        for chunk in uploaded_file.chunks():
                            tmp.write(chunk)
                        tmp_path = tmp.name
                    text = extract_pdf_text(tmp_path)
                    os.unlink(tmp_path)
                    file_content = text[:8000] if text and text.strip() else '[No readable text found in this PDF. It might be an image-based scan or encrypted.]'
                except Exception as e:
                    logger.warning(f'PDF extraction failed: {e}')
                    file_content = '[Could not read this PDF due to a processing error.]'
                
                prompt = (
                    f"The user uploaded a PDF named '{uploaded_file.name}'.\n\n"
                    f"PDF Content Snippet:\n{file_content}\n\n"
                    f"User's request: {content or 'Please summarize this document and highlight the key points.'}"
                )
                messages_to_send = history_msgs + [{'role': 'user', 'content': prompt}]
                display_content = f"[PDF: {uploaded_file.name}]{chr(10)}{content}" if content else f"[PDF: {uploaded_file.name}]"

            elif ext in ['.txt', '.md', '.doc', '.docx']:
                try:
                    text = uploaded_file.read().decode('utf-8', errors='ignore')[:6000]
                except Exception:
                    text = 'Could not read this file.'
                prompt = (
                    f"The user uploaded '{uploaded_file.name}':\n\n{text}\n\n"
                    f"User: {content or 'Please analyze this file.'}"
                )
                messages_to_send = history_msgs + [{'role': 'user', 'content': prompt}]
                display_content = f"[File: {uploaded_file.name}]{chr(10)}{content}" if content else f"[File: {uploaded_file.name}]"
            else:
                return Response({'error': 'Unsupported file type. Use images (PNG/JPG/GIF), PDF, or text files.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            messages_to_send = history_msgs + [{'role': 'user', 'content': content}]

        # Save user message
        ChatMessage.objects.create(session=session, role='user', content=display_content)

        try:
            if is_vision:
                reply = ai._call_vision(messages_to_send)
            else:
                reply = ai.chat(messages_to_send)
        except Exception as e:
            logger.error(f'Vision message error: {e}')
            reply = "I had trouble processing that file. Please try again."

        assistant_msg = ChatMessage.objects.create(session=session, role='assistant', content=reply)
        session.save()
        return Response(ChatMessageSerializer(assistant_msg).data)


class GenerateDiagramView(APIView):
    """Generate a Mermaid.js diagram from a text description — AI picks the best type."""
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request):
        description = request.data.get('description', '').strip()
        diagram_type = request.data.get('type', 'auto')  # 'auto' = AI decides

        if not description:
            return Response({'error': 'Description required.'}, status=status.HTTP_400_BAD_REQUEST)

        ai = AIService()

        if diagram_type == 'auto':
            # Let AI pick the best diagram type based on the description
            prompt = (
                f"You are an expert at creating Mermaid.js diagrams for educational purposes.\n\n"
                f"The user wants a diagram for: {description}\n\n"
                f"Choose the MOST appropriate Mermaid.js diagram type and generate it.\n\n"
                f"Available types and when to use them:\n"
                f"- flowchart TD: processes, algorithms, decision trees, workflows\n"
                f"- sequenceDiagram: interactions between systems/people over time\n"
                f"- classDiagram: OOP class relationships, system design\n"
                f"- erDiagram: database entity relationships\n"
                f"- stateDiagram-v2: state machines, system states\n"
                f"- mindmap: concepts, brainstorming, topic overviews\n"
                f"- timeline: historical events, project timelines\n"
                f"- gantt: project schedules, task timelines\n"
                f"- pie: proportions, distributions\n"
                f"- graph LR: general graphs, networks\n\n"
                f"Rules:\n"
                f"- Return ONLY the raw Mermaid code\n"
                f"- Do NOT wrap in ```mermaid``` or any code blocks\n"
                f"- Do NOT add any explanation before or after\n"
                f"- Make it detailed and educational\n"
                f"- Use proper Mermaid syntax\n"
                f"- For system analysis/design topics, use classDiagram, erDiagram, or sequenceDiagram as appropriate"
            )
        else:
            TYPE_STARTERS = {
                'flowchart': 'flowchart TD',
                'mindmap': 'mindmap',
                'sequence': 'sequenceDiagram',
                'er': 'erDiagram',
                'timeline': 'timeline',
                'pie': 'pie',
                'class': 'classDiagram',
                'state': 'stateDiagram-v2',
                'gantt': 'gantt',
            }
            starter = TYPE_STARTERS.get(diagram_type, 'flowchart TD')
            prompt = (
                f"Generate a Mermaid.js {diagram_type} diagram for: {description}\n\n"
                f"Rules:\n"
                f"- Start with: {starter}\n"
                f"- Use valid Mermaid.js syntax only\n"
                f"- Make it detailed and educational\n"
                f"- Return ONLY the raw Mermaid code, no markdown blocks, no explanation"
            )

        try:
            mermaid_code = ai.chat([{'role': 'user', 'content': prompt}])
            # Strip any accidental markdown wrapping
            mermaid_code = mermaid_code.strip()
            for prefix in ['```mermaid', '```']:
                if mermaid_code.startswith(prefix):
                    mermaid_code = mermaid_code[len(prefix):]
            if mermaid_code.endswith('```'):
                mermaid_code = mermaid_code[:-3]
            mermaid_code = mermaid_code.strip()
            return Response({'mermaid': mermaid_code, 'type': diagram_type})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GenerateImageView(APIView):
    """
    Generate an image from a text prompt using OpenAI DALL-E.
    Requires OPENAI_API_KEY to be in the environment.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        prompt = request.data.get('prompt', '').strip()
        if not prompt:
            return Response({'error': 'Prompt required.'}, status=status.HTTP_400_BAD_REQUEST)

        enhance = request.data.get('enhance', True)
        final_prompt = prompt
        
        # Check for API Key first to prevent wasting credits on enhancement if it will fail anyway
        import os
        from django.conf import settings
        hf_token = os.environ.get('HF_API_TOKEN', getattr(settings, 'HF_API_TOKEN', None))
        
        if not hf_token:
            return Response(
                {'error': 'Missing HF_API_TOKEN in the backend environment. Please configure your Hugging Face API key.'}, 
                status=status.HTTP_401_UNAUTHORIZED
            )

        if enhance:
            try:
                ai = AIService()
                enhanced = ai.chat([{
                    'role': 'user',
                    'content': (
                        f"Rewrite this image generation prompt to be more detailed and visually descriptive "
                        f"for an educational context. Keep it under 500 characters. "
                        f"Original: {prompt}\n\nReturn ONLY the improved prompt, nothing else."
                    )
                }])
                final_prompt = enhanced.strip() if enhanced else prompt
            except Exception as e:
                logger.warning(f"Failed to enhance image prompt: {e}")
                final_prompt = prompt

        import requests
        import base64
        try:
            logger.info(f"Generating image via Hugging Face FLUX with prompt: {final_prompt[:50]}...")
            
            # Using the new Hugging Face Inference Router (Legacy api-inference was deprecated with 410)
            API_URL = "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell"
            
            res = requests.post(
                API_URL,
                headers={"Authorization": f"Bearer {hf_token}"},
                json={"inputs": final_prompt},
                timeout=120
            )
            
            if res.status_code == 200:
                # Hugging Face returns the raw image bytes.
                img_encoded = base64.b64encode(res.content).decode('utf-8')
                content_type = res.headers.get('Content-Type', 'image/jpeg')
                
                # Convert to a data URI for the frontend image tag
                image_data_uri = f"data:{content_type};base64,{img_encoded}"
                
                return Response({
                    'url': image_data_uri,
                    'prompt': final_prompt,
                    'original_prompt': prompt,
                })
            else:
                logger.error(f"HF Image Gen Error {res.status_code}: {res.text}")
                error_msg = 'Failed to generate image via Hugging Face. The model might be loading or the token is invalid.'
                try:
                    error_body = res.json()
                    error_msg = error_body.get('error', error_msg)
                except Exception:
                    pass
                
                return Response(
                    {'error': f"Hugging Face Error: {error_msg}"}, 
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

        except requests.exceptions.Timeout:
            return Response({'error': 'Image generation timed out. Please try again later.'}, status=status.HTTP_504_GATEWAY_TIMEOUT)
        except Exception as e:
            logger.error(f"Generate Image exception: {e}")
            return Response({'error': f'Failed to generate image: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
