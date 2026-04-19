import json
import logging
import asyncio
import os
import hashlib
import re
import uuid
import threading
import time
from django.conf import settings
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.http import StreamingHttpResponse
from asgiref.sync import async_to_sync

from .models import ChatSession, ChatMessage
from .serializers import ChatSessionSerializer, ChatMessageSerializer
from .services import AIService, VoiceSanitizer
from library.models import Resource
from .agent import FlowAgent
from .podcast import generate_tts_file, SUPPORTED_VOICES
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
        return ChatSession.objects.filter(user=self.request.user).prefetch_related('messages')

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
                # Universal Library Intelligence
                library_context = ai.perform_global_search(content, request.user)
                reply = ai.chat(history + [
                    {'role': 'system', 'content': library_context},
                    {'role': 'user', 'content': content}
                ])
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
            # High-Pressure Silent Pulse (2KB) to force Render proxy flush
            yield f": {' ' * 2048}\n\n"
            
            if session.context_type == 'resource' and session.resource:
                messages = _build_resource_messages(ai, session.resource, content, history)
            elif session.context_type == 'group' and session.group:
                messages = [
                    {'role': 'system', 'content': f"You are FlowAI for group '{session.group.name}'."},
                    {'role': 'user', 'content': content}
                ]
            else:
                # Universal Library Intelligence
                library_context = ai.perform_global_search(content, request.user)
                messages = history + [
                    {'role': 'system', 'content': library_context},
                    {'role': 'user', 'content': content}
                ]

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
    context = ai._get_resource_context(resource, query=content)
    has_notes = bool(resource.ai_notes_json)
    system = (
        f"You are FlowAI, the AI Study Partner for '{resource.title}' (Subject: {resource.subject or 'General'}). "
        f"{'A FlowAI Study Kit has been generated — use it to give precise, targeted answers. ' if has_notes else ''}"
    )
    if context:
        system += f"\n\n{context}\n\nUse the above as your primary reference. When referencing notes, be specific about section names and vocabulary."
    
    # Add cross-document context from the rest of the library
    global_context = ai.perform_global_search(content, resource.owner)
    if global_context:
        system += f"\n\n{global_context}\n\nYou can use the above supplementary library knowledge to provide broader context or compare documents if relevant."

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
                resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
                answer = ai.ask_about_resource(resource, question)
            else:
                # Universal Library Intelligence
                library_context = ai.perform_global_search(question, request.user)
                answer = ai.chat([
                    {'role': 'system', 'content': library_context},
                    {'role': 'user', 'content': question}
                ])
        except Exception as e:
            logger.error(f'QuickAsk error: {e}')
            answer = "Error processing your question. Please try again."

        return Response({'answer': answer})


class SummarizeResourceView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request, resource_id):
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
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
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
        cached = next((c.get('concepts') for c in (resource.ai_concepts or []) if 'concepts' in c), None)
        return Response({'concepts': cached, 'cached': cached is not None})

    def post(self, request, resource_id):
        """Generate only — does NOT save."""
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
        ai = AIService()
        concepts = ai.extract_key_concepts(resource)
        return Response({'concepts': concepts})


class StudyNotesView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def get(self, request, resource_id):
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
        cached = next((c.get('study_notes') for c in (resource.ai_concepts or []) if 'study_notes' in c), None)
        return Response({'notes': cached, 'cached': cached is not None})

    def post(self, request, resource_id):
        """Generate only — does NOT save."""
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
        if resource.status == 'processing':
            return Response(
                {'error': 'Resource is still being processed. Please wait a few seconds.'},
                status=status.HTTP_202_ACCEPTED
            )
        ai = AIService()
        notes = ai.generate_study_notes(resource)
        return Response({'notes': notes})


class MindMapView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def get(self, request, resource_id):
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
        
        # [PREMIUM UPGRADE] Check curated data first
        curated_mm = resource.ai_notes_json.get('mind_map')
        if curated_mm:
            return Response(curated_mm)
            
        cached = next((c.get('mind_map') for c in (resource.ai_concepts or []) if 'mind_map' in c), None)
        return Response(cached if cached else {})

    def post(self, request, resource_id):
        """Generate only — does NOT save."""
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
        
        # Check curated data
        curated_mm = resource.ai_notes_json.get('mind_map')
        if curated_mm:
            return Response(curated_mm)
            
        ai = AIService()
        mind_map = ai.generate_mind_map(resource)
        return Response(mind_map)


class PracticeQuestionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def get(self, request, resource_id):
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
        
        # [PREMIUM UPGRADE] Check curated data
        curated_questions = resource.ai_notes_json.get('curated_practice_questions')
        if curated_questions:
            return Response({'questions': curated_questions, 'cached': True, 'curated': True})
            
        cached = next((c.get('practice_questions') for c in (resource.ai_concepts or []) if 'practice_questions' in c), None)
        return Response({'questions': cached, 'cached': cached is not None})

    def post(self, request, resource_id):
        """Generate only — does NOT save."""
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
        
        # Check curated data
        curated_questions = resource.ai_notes_json.get('curated_practice_questions')
        if curated_questions:
            return Response({'questions': curated_questions})
            
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
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
        question = request.data.get('question', '').strip()
        user_answer = request.data.get('user_answer', '').strip()
        model_answer = request.data.get('model_answer', '').strip()

        if not question or not user_answer:
            return Response({'error': 'Question and answer are required.'}, status=status.HTTP_400_BAD_REQUEST)

        ai = AIService()
        context = ai._get_resource_context(resource, query=question)
        result = ai.grade_answer(question, user_answer, model_answer, context)
        return Response(result)


class SaveContentView(APIView):
    """Explicitly save generated AI content to a resource."""
    permission_classes = [permissions.IsAuthenticated]

    ALLOWED_TYPES = {'concepts', 'study_notes', 'mind_map', 'practice_questions', 'chapters'}

    def post(self, request, resource_id):
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
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
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
        cached = next((c.get('chapters') for c in (resource.ai_concepts or []) if 'chapters' in c), None)
        return Response({'chapters': cached, 'cached': cached is not None})

    def post(self, request, resource_id):
        """Generate only — does NOT save."""
        resource = get_object_or_404(Resource, Q(id=resource_id) & (Q(owner=request.user) | Q(is_public=True)))
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
        file_url = None

        # Get chat history for context
        history = list(session.messages.order_by('created_at'))
        history_msgs = [{'role': m.role, 'content': m.content} for m in history[-10:]]

        if uploaded_file:
            import os
            import uuid
            from django.conf import settings
            from django.core.files.storage import default_storage
            from django.core.files.base import ContentFile
            
            ext = os.path.splitext(uploaded_file.name)[1].lower()
            
            # 1. Save file to storage for persistence
            file_name = f"chat_uploads/{uuid.uuid4()}{ext}"
            path = default_storage.save(file_name, ContentFile(uploaded_file.read()))
            uploaded_file.seek(0) # Reset pointer for potential reread
            file_url = f"{settings.MEDIA_URL}{path}"

            if ext in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
                import base64
                img_data = base64.b64encode(uploaded_file.read()).decode('utf-8')
                mime = 'image/jpeg' if ext in ['.jpg', '.jpeg'] else f'image/{ext[1:]}'
                is_vision = True

                # Build multimodal message
                messages_to_send = history_msgs + [{
                    'role': 'user',
                    'content': [
                        { 'type': 'text', 'text': content if content else 'Please analyze this image.' },
                        { 'type': 'image_url', 'image_url': { 'url': f'data:{mime};base64,{img_data}' } }
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
                    file_content = text[:8000] if text and text.strip() else '[No readable text found in this PDF.]'
                except Exception as e:
                    logger.warning(f'PDF extraction failed: {e}')
                    file_content = '[Could not read this PDF.]'
                
                messages_to_send = history_msgs + [{'role': 'user', 'content': f"Context from {uploaded_file.name}:\n{file_content}\n\nUser Question: {content}"}]
                display_content = f"[File: {uploaded_file.name}]\n{content}"

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
                return Response({'error': 'Unsupported file type.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            messages_to_send = history_msgs + [{'role': 'user', 'content': content}]

        # Save user message
        ChatMessage.objects.create(
            session=session, 
            role='user', 
            content=display_content,
            image=file_url # This preserves the uploaded image!
        )

        try:
            if is_vision:
                reply = async_to_sync(ai.chat)(messages_to_send)
            else:
                reply = async_to_sync(ai.chat)(messages_to_send)
            
            # Extract diagram/actions if any to save them
            diagram_code = None
            if "ACTION:" in reply:
                action_match = re.search(r"ACTION:\s*({.*})", reply, re.DOTALL)
                if action_match:
                    try:
                        action_data = json.loads(action_match.group(1))
                        if action_data.get('tool') == 'generate_diagram':
                            # We can't actually 'execute' a prompt here, 
                            # but we can at least flag that this message HAS an action.
                            # For now, we'll let the frontend handle the tool execution
                            # just like the stream.
                            pass
                    except: pass
        except Exception as e:
            logger.error(f'Vision message error: {e}')
            reply = "I had trouble processing that. Please try again."

        assistant_msg = ChatMessage.objects.create(session=session, role='assistant', content=reply)
        session.save()
        
        # Include context in serializer for absolute URLs
        serializer = ChatMessageSerializer(assistant_msg, context={'request': request})
        return Response(serializer.data)


def sanitize_mermaid(code: str) -> str:
    """Aggressively fix common AI-generated Mermaid syntax errors and clean up reasoning leakage."""
    import re
    
    # 0. CLEANUP REASONING LEAKAGE (Heuristic)
    # If the response starts with "Okay," or "The user wants" - common planning prefixes
    # only strip if it looks like a planning block (e.g. multiple lines of planning)
    planning_patterns = [
        r"^Okay, the user asked for.*?\.",
        r"^First, I need to.*?\.",
        r"^Then, I will.*?\.",
        r"^After that, I'll.*?\.",
    ]
    for pattern in planning_patterns:
        code = re.sub(pattern, "", code, flags=re.IGNORECASE | re.MULTILINE)
    
    # Strip smart quotes
    code = code.replace('\u201c', '"').replace('\u201d', '"').replace('\u2018', "'").replace('\u2019', "'")
    
    # Fix |text|> arrows (invalid) -> |text| arrows  
    code = re.sub(r'\|([^|]+)\|>', r'|\1|', code)
    
    # Quote ALL bracket labels that aren't already quoted
    # Handles chemical formulas well: A[Acetyl-CoA] -> A["Acetyl-CoA"]
    # We expand the allowed characters to catch + and -> inside labels
    def quote_label(m):
        prefix = m.group(1)
        bracket_type = m.group(2)
        label = m.group(3)
        end_bracket = m.group(4)
        
        # Don't double quote
        if label.startswith('"') and label.endswith('"'):
            return m.group(0)
            
        return f'{prefix}{bracket_type}"{label}"{end_bracket}'

    # Catch [], (), {} and also handle the case where they have special chemistry chars
    code = re.sub(r'(\w+)(\[|\(|\{)([^\]\)\}"\n]+)(\]|\)|\})', quote_label, code)
    
    # Fix common chemical syntax issues in transitions: -->|A + B|
    # Ensure transition labels are always quoted if they have + or ->
    def quote_transition(m):
        arrow = m.group(1)
        label = m.group(2)
        if '+' in label or '->' in label or '-' in label:
            return f'{arrow}|"{label}"|'
        return m.group(0)
    code = re.sub(r'(-->|==>|-.->)\|([^|]+)\|', quote_transition, code)

    # Remove blank lines
    code = '\n'.join(line for line in code.split('\n') if line.strip())
    
    return code


class GenerateDiagramView(APIView):
    """Generate a Mermaid.js diagram from a text description — AI picks the best type."""
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request):
        description = request.data.get('description', '').strip()
        diagram_type = request.data.get('type', 'auto')
        message_id = request.data.get('message_id')

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
                f"- ALWAYS quote node labels containing parentheses, brackets, or special chars with double quotes: A[\"Label (info)\"]\n"
                f"- Use simple arrow syntax: --> or -->|label text| (NEVER use -->|text|>)\n"
                f"- Keep node IDs simple alphanumeric: A, B, C1, step1, etc.\n"
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
            mermaid_code = async_to_sync(ai.chat)([{'role': 'user', 'content': prompt}])
            # Strip any accidental markdown wrapping
            mermaid_code = mermaid_code.strip()
            for prefix in ['```mermaid', '```']:
                if mermaid_code.startswith(prefix):
                    mermaid_code = mermaid_code[len(prefix):]
            if mermaid_code.endswith('```'):
                mermaid_code = mermaid_code[:-3]
            mermaid_code = mermaid_code.strip()
            
            # Post-processing to fix common AI syntax errors
            mermaid_code = sanitize_mermaid(mermaid_code)
            
            # Link to existing message if provided
            if message_id:
                try:
                    msg = ChatMessage.objects.filter(id=message_id, session__user=request.user).first()
                    if msg:
                        msg.diagram_code = mermaid_code
                        msg.save()
                except Exception as e:
                    logger.warning(f"Failed to link diagram to message {message_id}: {e}")

            return Response({'mermaid': mermaid_code, 'type': diagram_type})
        except Exception as e:
            logger.error(f"Diagram Generation Error: {e}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GenerateImageView(APIView):
    """
    Generate an image from a text prompt using OpenAI DALL-E.
    Requires OPENAI_API_KEY to be in the environment.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        prompt = request.data.get('prompt', '').strip()
        message_id = request.data.get('message_id')
        if not prompt:
            return Response({'error': 'Prompt required.'}, status=status.HTTP_400_BAD_REQUEST)

        enhance = request.data.get('enhance', True)
        final_prompt = prompt
        
        if enhance:
            try:
                ai = AIService()
                enhanced = async_to_sync(ai.chat)([{
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

        try:
            ai = AIService()
            image_data_uri = ai.generate_image(final_prompt)
            
            if image_data_uri:
                # Link to existing message if provided
                if message_id:
                    try:
                        msg = ChatMessage.objects.filter(id=message_id, session__user=request.user).first()
                        if msg:
                            msg.image = image_data_uri
                            msg.save()
                    except Exception as e:
                        logger.warning(f"Failed to link image to message {message_id}: {e}")

                return Response({
                    'url': image_data_uri,
                    'prompt': final_prompt,
                    'original_prompt': prompt,
                })
            else:
                return Response(
                    {'error': "Failed to generate image. All available models are currently unavailable."}, 
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

        except Exception as e:
            logger.error(f"Generate Image exception: {e}")
            return Response({'error': f'Failed to generate image: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AgentView(APIView):
    """Universal platform agent endpoint (Hybrid Sync/Async)."""
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request):
        query = request.data.get('query', '').strip()
        context = request.data.get('context', '')
        history = request.data.get('history', [])
        session_id = request.data.get('session_id')
        is_tutor = request.data.get('is_tutor_mode') in [True, 'true']
        
        if not query:
            return Response({'error': 'Query required.'}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Handle Session Persistence (Sync Protocol for DRF Auth compatibility)
        session = None
        is_academic = any(kw in query.lower() for kw in ['pdf', 'note', 'resource', 'material', 'study', 'kit'])
        
        if session_id and (is_academic or is_tutor):
            session = get_object_or_404(ChatSession, id=session_id, user=request.user)
        else:
            # Dedicated lane for general platform assistance
            session, created = ChatSession.objects.get_or_create(
                user=request.user, 
                context_type='global', 
                title='FlowAI Platform Assistant'
            )

        # 2. Process with Agent (High-Performance Async Bridge)
        try:
            # Save User Message
            ChatMessage.objects.create(session=session, role='user', content=query)
            
            # Explicitly access request.user to ensure authentication is finalized in sync context
            current_user = request.user
            
            agent = FlowAgent(current_user)
            # THE BRIDGE: async_to_sync used once for high-level orchestration
            from asgiref.sync import async_to_sync
            reply, action = async_to_sync(agent.process_request)(query, context, history=history, is_tutor_mode=is_tutor)
            
            execution_result = None
            if action:
                execution_result = async_to_sync(agent.execute_action)(action)

            display_reply = reply.split('ACTION:')[0].strip()
            speech_text = VoiceSanitizer.clean(display_reply)
            
            voice_enabled = request.data.get('voice_enabled') in [True, 'true']
            voice_id = request.data.get('voice_id')
            audio_url = None

            if voice_enabled and speech_text:
                try:
                    h = hashlib.md5(speech_text.encode('utf-8')).hexdigest()
                    out_dir = os.path.join(settings.MEDIA_ROOT, 'agent_responses')
                    os.makedirs(out_dir, exist_ok=True)
                    f_name = f"{h}.mp3"
                    f_path = os.path.join(out_dir, f_name)
                    
                    if not os.path.exists(f_path):
                        v_id = voice_id or SUPPORTED_VOICES.get('Andrew', 'en-US-AndrewNeural')
                        generate_tts_file(speech_text, v_id, f_path)
                    
                    audio_url = request.build_absolute_uri(f"{settings.MEDIA_URL}agent_responses/{f_name}")
                except Exception as e:
                    logger.error(f"Agent Voice Synthesis Error: {e}")

            # 4. Save Assistant Message
            assistant_msg = ChatMessage.objects.create(
                session=session, 
                role='assistant', 
                content=display_reply,
                image=execution_result if action and action.get('tool') == 'generate_image' else None,
                diagram_code=execution_result if action and action.get('tool') == 'generate_diagram' else None
            )

            return Response({
                'done': True,
                'message_id': assistant_msg.id,
                'session_id': session.id,
                'reply': display_reply,
                'speech_text': speech_text,
                'audio_url': audio_url,
                'action': action,
                'execution_result': execution_result,
                'message': ChatMessageSerializer(assistant_msg, context={'request': request}).data
            })
        except Exception as e:
            err_details = f"Atomic Agent Error: {str(e)}"
            logger.error(err_details)
            return Response({
                'done': True,
                'reply': f"Intelligence Signal Interrupted: {str(e)}",
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class AgentStreamView(APIView):
    """Universal platform agent endpoint (Streaming SSE - Hybrid)."""
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request):
        query = request.data.get('query', '').strip()
        context = request.data.get('context', '')
        history = request.data.get('history', [])
        session_id = request.data.get('session_id')
        is_tutor = request.data.get('is_tutor_mode') in [True, 'true']
        
        if not query:
            return Response({'error': 'Query required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Ensure we have a session to save to
        session = None
        if session_id:
            session = get_object_or_404(ChatSession, id=session_id, user=request.user)
        else:
            # Always create a new, dedicated session for a new conversation
            title = query[:30] + ('...' if len(query) > 30 else '')
            session = ChatSession.objects.create(user=request.user, title=title or "New Chat")

        agent = FlowAgent(request.user)

        # 1. Save User Message immediately
        ChatMessage.objects.create(session=session, role='user', content=query)
        
        # 2. Create placeholder for Assistant Message early to provide ID for visuals
        assistant_msg = ChatMessage.objects.create(session=session, role='assistant', content="")

        async def event_stream():
            full_reply = ""
            # High-Pressure Silent Pulse (2KB) to force Render proxy flush
            yield f": {' ' * 2048}\n\n"
            
            try:
                # Yield the message ID and session ID first so frontend can track them
                yield f"data: {json.dumps({'done': False, 'message_id': assistant_msg.id, 'session_id': session.id})}\n\n"

                async for chunk in agent.process_request_stream(query, context, history=history, is_tutor_mode=is_tutor):
                    if chunk:
                        full_reply += chunk
                        yield f"data: {json.dumps({'chunk': chunk})}\n\n"
                
                # 3. Update Assistant Message on completion
                from asgiref.sync import sync_to_async
                
                display_reply = full_reply.split('ACTION:')[0].strip()
                
                # Update the placeholder with final content
                def update_msg():
                    # REFRESH FROM DB: In case a tools (image/diagram) was saved to this msg during the stream
                    assistant_msg.refresh_from_db()
                    assistant_msg.content = display_reply
                    assistant_msg.save()
                    session.save()
                
                await sync_to_async(update_msg)()

                yield f"data: {json.dumps({'done': True, 'message_id': assistant_msg.id})}\n\n"
                yield "data: [DONE]\n\n"
            except asyncio.CancelledError:
                pass
            except Exception as e:
                import traceback
                traceback.print_exc()
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        response = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response

class AgentAudioView(APIView):
    """
    Accepts an audio blob, transcribes it via Groq Whisper,
    and then processes the query through the FlowAgent.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AIRateThrottle]

    def post(self, request):
        audio_file = request.FILES.get('audio')
        context = request.data.get('context', '')
        voice_enabled = request.data.get('voice_enabled') == 'true'
        voice_id = request.data.get('voice_id')
        
        # Load history if sent as a JSON string (typical for multipart/form-data)
        history = []
        history_raw = request.data.get('history')
        if history_raw:
            try:
                history = json.loads(history_raw)
            except:
                pass

        if not audio_file:
            return Response({'error': 'No audio file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Transcribe via AIService (Multi-modal OpenRouter/Gemini fallback)
        # Bypasses Groq dependency entirely for the Voice Assistant Agent.
        agent = FlowAgent(request.user)
        try:
            logger.info("[Agent] Attempting backend transcription via OpenRouter fallback...")
            query = agent.ai.transcribe_audio(audio_file)
        except Exception as e:
            logger.error(f"Agent Audio STT Exception: {e}")
            return Response({'error': f'STT Error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        if not query:
            logger.warning("[Agent] Audio transcription returned empty. Ensure browser STT is working.")
            return Response({'error': 'Transcription failed or returned empty. Please speak clearly.'}, status=status.HTTP_400_BAD_REQUEST)

        # 2. Process with FlowAgent
        reply, action = agent.process_request(query, context, history=history, is_tutor_mode=request.data.get('is_tutor_mode') == 'true')
        
        execution_result = None
        if action:
            execution_result = agent.execute_action(action)

        # UI Cleanup: Strip technical ACTION tags from the display text
        display_reply = reply.split('ACTION:')[0].strip()

        # 3. High-Fidelity Voice Synthesis (Optional)
        audio_url = None
        speech_text = VoiceSanitizer.clean(reply)
        
        if voice_enabled and speech_text:
            try:
                h = hashlib.md5(speech_text.encode('utf-8')).hexdigest()
                out_dir = os.path.join(settings.MEDIA_ROOT, 'agent_responses')
                os.makedirs(out_dir, exist_ok=True)
                f_name = f"{h}.mp3"
                f_path = os.path.join(out_dir, f_name)
                
                if not os.path.exists(f_path):
                    v_id = voice_id or SUPPORTED_VOICES['Andrew']
                    generate_tts_file(speech_text, v_id, f_path)
                
                audio_url = request.build_absolute_uri(f"{settings.MEDIA_URL}agent_responses/{f_name}")
            except Exception as e:
                logger.error(f"Agent Voice Synthesis Error: {e}")

        return Response({
            'query': query,
            'reply': display_reply,
            'speech_text': speech_text,
            'action': action,
            'execution_result': execution_result,
            'audio_url': audio_url
        })
