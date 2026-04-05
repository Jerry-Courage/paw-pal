import io
import logging
import re
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from django.utils import timezone
from .models import Workspace, WorkspaceMember, WorkspaceDocument, WorkspaceMessage, WorkspaceTask, DocumentVersion, WorkspaceFile
from .serializers import (
    WorkspaceSerializer, WorkspaceMemberSerializer, WorkspaceDocumentSerializer,
    WorkspaceMessageSerializer, WorkspaceTaskSerializer, DocumentVersionSerializer,
    WorkspaceFileSerializer
)

logger = logging.getLogger('flowstate')


def _get_workspace(pk, user):
    ws = get_object_or_404(Workspace, pk=pk)
    if not ws.memberships.filter(user=user).exists():
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('You are not a member of this workspace.')
    return ws


def _get_doc(workspace):
    doc, _ = WorkspaceDocument.objects.get_or_create(workspace=workspace)
    return doc


class WorkspaceListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = WorkspaceSerializer

    def get_queryset(self):
        return Workspace.objects.filter(memberships__user=self.request.user, is_active=True)

    def perform_create(self, serializer):
        ws = serializer.save(owner=self.request.user)
        WorkspaceMember.objects.create(workspace=ws, user=self.request.user, role='owner')
        _get_doc(ws)  # create empty doc

    def get_serializer_context(self):
        return {'request': self.request}


class WorkspaceDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = WorkspaceSerializer

    def get_queryset(self):
        return Workspace.objects.filter(memberships__user=self.request.user)

    def get_serializer_context(self):
        return {'request': self.request}


class JoinWorkspaceView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        code = request.data.get('invite_code', '').strip().upper()
        if not code:
            return Response({'error': 'Invite code required.'}, status=status.HTTP_400_BAD_REQUEST)
        ws = get_object_or_404(Workspace, invite_code=code, is_active=True)
        member, created = WorkspaceMember.objects.get_or_create(
            workspace=ws, user=request.user,
            defaults={'role': 'editor'}
        )
        if not created:
            return Response({'detail': 'Already a member.'})
        return Response(WorkspaceSerializer(ws, context={'request': request}).data, status=status.HTTP_201_CREATED)


class WorkspaceMembersView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        ws = _get_workspace(pk, request.user)
        # Update last_seen
        WorkspaceMember.objects.filter(workspace=ws, user=request.user).update(last_seen=timezone.now())
        members = ws.memberships.select_related('user').all()
        return Response(WorkspaceMemberSerializer(members, many=True).data)


class DocumentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        ws = _get_workspace(pk, request.user)
        doc = _get_doc(ws)
        return Response(WorkspaceDocumentSerializer(doc).data)

    def patch(self, request, pk):
        ws = _get_workspace(pk, request.user)
        doc = _get_doc(ws)
        new_content = request.data.get('content', doc.content)

        # Save version snapshot every 10 edits
        if doc.version % 10 == 0:
            DocumentVersion.objects.create(
                document=doc, content=doc.content,
                saved_by=request.user, version=doc.version
            )

        doc.content = new_content
        doc.version += 1
        doc.last_edited_by = request.user
        doc.save()
        return Response(WorkspaceDocumentSerializer(doc).data)


class DocumentVersionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        ws = _get_workspace(pk, request.user)
        doc = _get_doc(ws)
        versions = doc.versions.all()[:20]
        return Response(DocumentVersionSerializer(versions, many=True).data)

    def post(self, request, pk):
        """Restore a version."""
        ws = _get_workspace(pk, request.user)
        doc = _get_doc(ws)
        version_id = request.data.get('version_id')
        v = get_object_or_404(DocumentVersion, id=version_id, document=doc)
        doc.content = v.content
        doc.version += 1
        doc.last_edited_by = request.user
        doc.save()
        return Response(WorkspaceDocumentSerializer(doc).data)


class MessagesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        ws = _get_workspace(pk, request.user)
        msgs = ws.messages.select_related('author').order_by('-created_at')[:50]
        return Response(WorkspaceMessageSerializer(list(reversed(msgs)), many=True).data)

    def post(self, request, pk):
        ws = _get_workspace(pk, request.user)
        content = request.data.get('content', '').strip()
        if not content:
            return Response({'error': 'Content required.'}, status=status.HTTP_400_BAD_REQUEST)

        msg = WorkspaceMessage.objects.create(workspace=ws, author=request.user, content=content)
        response_data = {'user_message': WorkspaceMessageSerializer(msg).data, 'ai_message': None}

        # If message starts with @FlowAI, trigger AI response and return it immediately
        if content.lower().startswith('@flowai') or content.lower().startswith('@ai'):
            question = re.sub(r'^@(flowai|ai)\s*', '', content, flags=re.IGNORECASE).strip()
            if question:
                ai_reply = _get_ai_response(ws, question, request.user)
                ai_msg = WorkspaceMessage.objects.create(workspace=ws, content=ai_reply, is_ai=True)
                response_data['ai_message'] = WorkspaceMessageSerializer(ai_msg).data

        return Response(response_data, status=status.HTTP_201_CREATED)


class TasksView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        ws = _get_workspace(pk, request.user)
        tasks = ws.tasks.select_related('assigned_to', 'created_by').all()
        return Response(WorkspaceTaskSerializer(tasks, many=True).data)

    def post(self, request, pk):
        ws = _get_workspace(pk, request.user)
        serializer = WorkspaceTaskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace=ws, created_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class TaskDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk, task_id):
        ws = _get_workspace(pk, request.user)
        task = get_object_or_404(WorkspaceTask, id=task_id, workspace=ws)
        serializer = WorkspaceTaskSerializer(task, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk, task_id):
        ws = _get_workspace(pk, request.user)
        task = get_object_or_404(WorkspaceTask, id=task_id, workspace=ws)
        task.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FilesView(APIView):
    """Upload files directly to a workspace or link library resources."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        ws = _get_workspace(pk, request.user)
        files = ws.files.select_related('uploaded_by').all()
        linked = ws.resources.all()
        return Response({
            'uploaded': WorkspaceFileSerializer(files, many=True, context={'request': request}).data,
            'linked_resources': [
                {'id': r.id, 'title': r.title, 'type': r.resource_type, 'subject': r.subject}
                for r in linked
            ],
        })

    def post(self, request, pk):
        ws = _get_workspace(pk, request.user)
        uploaded_file = request.FILES.get('file')
        resource_id = request.data.get('resource_id')

        # Link an existing library resource
        if resource_id:
            from library.models import Resource
            resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
            ws.resources.add(resource)
            return Response({'linked': True, 'resource_id': resource_id})

        # Upload a new file
        if not uploaded_file:
            return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        import os
        name = uploaded_file.name
        ext = os.path.splitext(name)[1].lower()
        if ext not in ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg']:
            return Response({'error': 'Unsupported file type.'}, status=status.HTTP_400_BAD_REQUEST)
        if uploaded_file.size > 20 * 1024 * 1024:
            return Response({'error': 'File too large. Max 20MB.'}, status=status.HTTP_400_BAD_REQUEST)

        ws_file = WorkspaceFile.objects.create(
            workspace=ws,
            uploaded_by=request.user,
            file=uploaded_file,
            name=name,
            file_size=uploaded_file.size,
        )

        # Extract text from PDF for AI context
        if ext == '.pdf':
            try:
                from library.pdf_extractor import extract_pdf_text
                text = extract_pdf_text(ws_file.file.path)
                if text:
                    ws_file.extracted_text = text[:8000]
                    ws_file.save(update_fields=['extracted_text'])
            except Exception as e:
                logger.warning(f'Could not extract text from workspace file: {e}')

        return Response(
            WorkspaceFileSerializer(ws_file, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )

    def delete(self, request, pk):
        ws = _get_workspace(pk, request.user)
        file_id = request.query_params.get('file_id')
        resource_id = request.query_params.get('resource_id')

        if file_id:
            f = get_object_or_404(WorkspaceFile, id=file_id, workspace=ws)
            f.file.delete(save=False)
            f.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        if resource_id:
            from library.models import Resource
            try:
                ws.resources.remove(int(resource_id))
            except Exception:
                pass
            return Response(status=status.HTTP_204_NO_CONTENT)

        return Response({'error': 'Provide file_id or resource_id.'}, status=status.HTTP_400_BAD_REQUEST)


class AIAssistView(APIView):
    """FlowAI workspace assistant — full context access."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        ws = _get_workspace(pk, request.user)
        action = request.data.get('action', 'ask')  # ask | generate_outline | improve | expand | simplify | review | generate_slides
        text = request.data.get('text', '')
        question = request.data.get('question', '')

        try:
            if action == 'generate_outline':
                result = _ai_generate_outline(ws)
            elif action == 'improve':
                result = _ai_improve_text(ws, text)
            elif action == 'expand':
                result = _ai_expand_text(ws, text)
            elif action == 'simplify':
                result = _ai_simplify_text(ws, text)
            elif action == 'review':
                result = _ai_review_doc(ws)
            elif action == 'write_section':
                result = _ai_write_section(ws, text)
            elif action == 'generate_slides':
                result = _ai_generate_slides_outline(ws)
            else:
                result = _get_ai_response(ws, question or text, request.user)

            # Save AI response as chat message
            WorkspaceMessage.objects.create(workspace=ws, content=result, is_ai=True)
            return Response({'result': result})
        except Exception as e:
            logger.error(f'Workspace AI error: {e}')
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ExportView(APIView):
    """Export workspace document as PDF, DOCX, PPTX, or TXT."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        ws = _get_workspace(pk, request.user)
        fmt = request.query_params.get('format', 'pdf').lower()
        doc = _get_doc(ws)

        if fmt == 'pdf':
            return _export_pdf(ws, doc)
        elif fmt == 'docx':
            return _export_docx(ws, doc)
        elif fmt == 'pptx':
            return _export_pptx(ws, doc)
        elif fmt == 'txt':
            return _export_txt(ws, doc)
        return Response({'error': 'Unsupported format.'}, status=status.HTTP_400_BAD_REQUEST)


# ─── AI HELPERS ──────────────────────────────────────────────────────────────

def _build_workspace_context(ws) -> str:
    """Build full workspace context for FlowAI."""
    parts = [f"Workspace: {ws.name}", f"Subject: {ws.subject or 'General'}"]

    if ws.description:
        parts.append(f"Description: {ws.description}")

    if ws.assignment:
        parts.append(f"Assignment: {ws.assignment.title}\nInstructions: {ws.assignment.instructions[:1000]}")

    # Document content
    try:
        doc_content = ws.document.content
        if doc_content:
            parts.append(f"Current document:\n{doc_content[:4000]}")
    except Exception:
        pass

    # Recent chat
    recent_msgs = ws.messages.order_by('-created_at')[:10]
    if recent_msgs:
        chat = '\n'.join([f"{'FlowAI' if m.is_ai else (m.author.username if m.author else 'User')}: {m.content}" for m in reversed(recent_msgs)])
        parts.append(f"Recent chat:\n{chat}")

    # Tasks
    tasks = ws.tasks.all()[:10]
    if tasks:
        task_list = '\n'.join([f"[{t.status}] {t.title}" for t in tasks])
        parts.append(f"Tasks:\n{task_list}")

    # Resources (library)
    for r in ws.resources.all()[:3]:
        from ai_assistant.services import AIService
        ai = AIService()
        ctx = ai._get_resource_context(r)
        if ctx:
            parts.append(f"Resource '{r.title}':\n{ctx[:1500]}")

    # Uploaded workspace files
    for f in ws.files.exclude(extracted_text='')[:3]:
        parts.append(f"Uploaded file '{f.name}':\n{f.extracted_text[:1500]}")

    return '\n\n'.join(parts)


def _get_ai_response(ws, question: str, user) -> str:
    from ai_assistant.services import AIService, FLOWAI_SYSTEM_PROMPT
    ai = AIService()
    context = _build_workspace_context(ws)
    system = (
        f"{FLOWAI_SYSTEM_PROMPT}\n\n"
        f"You are FlowAI inside a collaborative workspace. You have FULL ACCESS to everything in this workspace.\n\n"
        f"WORKSPACE CONTEXT:\n{context}"
    )
    return ai.chat([{'role': 'system', 'content': system}, {'role': 'user', 'content': question}])


def _ai_generate_outline(ws) -> str:
    from ai_assistant.services import AIService, FLOWAI_SYSTEM_PROMPT
    ai = AIService()
    context = _build_workspace_context(ws)
    prompt = (
        f"Based on this workspace context, generate a detailed document outline with sections and subsections.\n\n"
        f"{context}\n\n"
        "Return a well-structured markdown outline that the team can use as their document skeleton. "
        "Include an introduction, main sections based on the assignment/topic, and a conclusion. "
        "Add brief notes under each section about what to cover."
    )
    return ai.chat([{'role': 'user', 'content': prompt}])


def _ai_improve_text(ws, text: str) -> str:
    from ai_assistant.services import AIService
    ai = AIService()
    context = _build_workspace_context(ws)
    prompt = (
        f"Improve this text from a student's workspace document. Make it more academic, clear, and well-structured.\n\n"
        f"Workspace context: {ws.name} ({ws.subject or 'General'})\n\n"
        f"Text to improve:\n{text}\n\n"
        "Return only the improved version, no explanation."
    )
    return ai.chat([{'role': 'user', 'content': prompt}])


def _ai_expand_text(ws, text: str) -> str:
    from ai_assistant.services import AIService
    ai = AIService()
    context = _build_workspace_context(ws)
    prompt = (
        f"Expand this text with more detail, examples, and supporting points. "
        f"Use the workspace resources and context where relevant.\n\n"
        f"Context: {context[:1000]}\n\nText:\n{text}\n\nReturn only the expanded version."
    )
    return ai.chat([{'role': 'user', 'content': prompt}])


def _ai_simplify_text(ws, text: str) -> str:
    from ai_assistant.services import AIService
    ai = AIService()
    prompt = f"Simplify this text to be clearer and easier to understand while keeping all key information:\n\n{text}\n\nReturn only the simplified version."
    return ai.chat([{'role': 'user', 'content': prompt}])


def _ai_review_doc(ws) -> str:
    from ai_assistant.services import AIService
    ai = AIService()
    try:
        doc_content = ws.document.content
    except Exception:
        doc_content = ''
    if not doc_content.strip():
        return "The document is empty. Start writing and I'll review it for you!"
    prompt = (
        f"Review this student document for the workspace '{ws.name}' ({ws.subject or 'General'}).\n\n"
        f"Document:\n{doc_content[:5000]}\n\n"
        "Provide structured feedback covering:\n"
        "## Overall Assessment\n## Strengths\n## Areas to Improve\n## Specific Suggestions\n## Grade Estimate\n\n"
        "Be constructive and specific."
    )
    return ai.chat([{'role': 'user', 'content': prompt}])


def _ai_write_section(ws, section_title: str) -> str:
    from ai_assistant.services import AIService
    ai = AIService()
    context = _build_workspace_context(ws)
    prompt = (
        f"Write a complete section titled '{section_title}' for this workspace document.\n\n"
        f"Workspace context:\n{context}\n\n"
        "Write in academic style with proper paragraphs. Use markdown formatting. "
        "Base the content on the assignment instructions and linked resources."
    )
    return ai.chat([{'role': 'user', 'content': prompt}])


def _ai_generate_slides_outline(ws) -> str:
    from ai_assistant.services import AIService
    ai = AIService()
    context = _build_workspace_context(ws)
    try:
        doc_content = ws.document.content or ''
    except Exception:
        doc_content = ''
    prompt = (
        f"Create a PowerPoint presentation outline for this workspace.\n\n"
        f"Workspace: {ws.name}\nSubject: {ws.subject or 'General'}\n\n"
        f"Document content:\n{doc_content[:3000] if doc_content else 'No document yet.'}\n\n"
        f"Additional context:\n{context[:1000]}\n\n"
        "Generate a slide-by-slide outline in this format:\n"
        "## Slide 1: Title\n**Title:** [slide title]\n**Content:** [bullet points]\n\n"
        "Include: Title slide, Agenda, 5-8 content slides, Conclusion, Q&A. "
        "Make it presentation-ready."
    )
    return ai.chat([{'role': 'user', 'content': prompt}])


# ─── EXPORT HELPERS ──────────────────────────────────────────────────────────

def _safe_filename(name):
    return re.sub(r'[^\w\s-]', '', name).strip().replace(' ', '_')[:50]


def _export_txt(ws, doc):
    content = f"{ws.name}\n{'='*len(ws.name)}\n\n{doc.content}"
    resp = HttpResponse(content, content_type='text/plain; charset=utf-8')
    resp['Content-Disposition'] = f'attachment; filename="{_safe_filename(ws.name)}.txt"'
    return resp


def _export_pdf(ws, doc):
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import cm
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

        buffer = io.BytesIO()
        pdf = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
        styles = getSampleStyleSheet()
        story = [Paragraph(ws.name, styles['Title'])]
        if ws.subject:
            story.append(Paragraph(ws.subject, styles['Normal']))
        story.append(Spacer(1, 0.5*cm))

        for line in doc.content.split('\n'):
            line = line.strip()
            if not line:
                story.append(Spacer(1, 0.2*cm))
            elif line.startswith('# '):
                story.append(Paragraph(line[2:], styles['Heading1']))
            elif line.startswith('## '):
                story.append(Paragraph(line[3:], styles['Heading2']))
            elif line.startswith('### '):
                story.append(Paragraph(line[4:], styles['Heading3']))
            elif line.startswith('- ') or line.startswith('* '):
                story.append(Paragraph(f'• {line[2:]}', styles['Normal']))
            else:
                line = re.sub(r'\*\*(.+?)\*\*', r'\1', line)
                story.append(Paragraph(line, styles['Normal']))

        pdf.build(story)
        buffer.seek(0)
        resp = HttpResponse(buffer.read(), content_type='application/pdf')
        resp['Content-Disposition'] = f'attachment; filename="{_safe_filename(ws.name)}.pdf"'
        return resp
    except ImportError:
        return _export_txt(ws, doc)


def _export_docx(ws, doc):
    try:
        from docx import Document as DocxDoc
        d = DocxDoc()
        d.add_heading(ws.name, 0)
        if ws.subject:
            d.add_paragraph(ws.subject)
        for line in doc.content.split('\n'):
            line = line.strip()
            if not line:
                continue
            elif line.startswith('# '):
                d.add_heading(line[2:], level=1)
            elif line.startswith('## '):
                d.add_heading(line[3:], level=2)
            elif line.startswith('### '):
                d.add_heading(line[4:], level=3)
            elif line.startswith('- ') or line.startswith('* '):
                d.add_paragraph(line[2:], style='List Bullet')
            else:
                line = re.sub(r'\*\*(.+?)\*\*', r'\1', line)
                d.add_paragraph(line)
        buf = io.BytesIO()
        d.save(buf)
        buf.seek(0)
        resp = HttpResponse(buf.read(), content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        resp['Content-Disposition'] = f'attachment; filename="{_safe_filename(ws.name)}.docx"'
        return resp
    except ImportError:
        return _export_txt(ws, doc)


def _export_pptx(ws, doc):
    try:
        from pptx import Presentation
        from pptx.util import Inches, Pt
        from pptx.dml.color import RGBColor
        from pptx.enum.text import PP_ALIGN

        prs = Presentation()
        prs.slide_width = Inches(13.33)
        prs.slide_height = Inches(7.5)

        DARK_BG = RGBColor(0x0F, 0x17, 0x2A)
        SKY_BLUE = RGBColor(0x0E, 0xA5, 0xE9)
        WHITE = RGBColor(0xFF, 0xFF, 0xFF)
        LIGHT_GRAY = RGBColor(0xCB, 0xD5, 0xE1)

        def set_bg(slide, color):
            from pptx.util import Emu
            fill = slide.background.fill
            fill.solid()
            fill.fore_color.rgb = color

        def add_text(tf, text, size, bold=False, color=WHITE, align=PP_ALIGN.LEFT):
            p = tf.add_paragraph()
            p.alignment = align
            run = p.add_run()
            run.text = text
            run.font.size = Pt(size)
            run.font.bold = bold
            run.font.color.rgb = color

        # Parse document into slides
        slides_data = []
        current_slide = None

        for line in doc.content.split('\n'):
            line = line.strip()
            if line.startswith('# ') or line.startswith('## Slide'):
                if current_slide:
                    slides_data.append(current_slide)
                current_slide = {'title': re.sub(r'^#+\s*(Slide\s*\d+:?\s*)?', '', line), 'bullets': []}
            elif line.startswith('- ') or line.startswith('* ') or line.startswith('• '):
                if current_slide:
                    current_slide['bullets'].append(line.lstrip('-*• ').strip())
            elif line.startswith('**') and line.endswith('**') and current_slide:
                current_slide['bullets'].append(re.sub(r'\*\*', '', line))
            elif line and current_slide and not line.startswith('#'):
                current_slide['bullets'].append(line)

        if current_slide:
            slides_data.append(current_slide)

        # If no structured slides, create from scratch
        if not slides_data:
            slides_data = [
                {'title': ws.name, 'bullets': [ws.subject or '', ws.description or '']},
                {'title': 'Overview', 'bullets': ['Document content not yet structured for slides.', 'Use FlowAI → Generate Slides to create a proper outline.']},
            ]

        blank_layout = prs.slide_layouts[6]  # blank

        for i, slide_data in enumerate(slides_data):
            slide = prs.slides.add_slide(blank_layout)
            set_bg(slide, DARK_BG)

            # Accent bar
            bar = slide.shapes.add_shape(1, Inches(0), Inches(0), Inches(13.33), Inches(0.08))
            bar.fill.solid()
            bar.fill.fore_color.rgb = SKY_BLUE
            bar.line.fill.background()

            if i == 0:
                # Title slide
                tf_title = slide.shapes.add_textbox(Inches(1.5), Inches(2.5), Inches(10), Inches(1.5)).text_frame
                tf_title.word_wrap = True
                add_text(tf_title, slide_data['title'], 44, bold=True, align=PP_ALIGN.CENTER)

                if slide_data['bullets']:
                    tf_sub = slide.shapes.add_textbox(Inches(2), Inches(4.2), Inches(9), Inches(1)).text_frame
                    add_text(tf_sub, slide_data['bullets'][0], 24, color=LIGHT_GRAY, align=PP_ALIGN.CENTER)

                # FlowState branding
                tf_brand = slide.shapes.add_textbox(Inches(0.3), Inches(6.9), Inches(4), Inches(0.5)).text_frame
                add_text(tf_brand, 'Made with FlowState', 10, color=SKY_BLUE)
            else:
                # Content slide
                tf_title = slide.shapes.add_textbox(Inches(0.5), Inches(0.3), Inches(12), Inches(0.9)).text_frame
                add_text(tf_title, slide_data['title'], 28, bold=True, color=SKY_BLUE)

                # Divider
                div = slide.shapes.add_shape(1, Inches(0.5), Inches(1.3), Inches(12.3), Inches(0.03))
                div.fill.solid()
                div.fill.fore_color.rgb = RGBColor(0x1E, 0x3A, 0x5F)
                div.line.fill.background()

                # Bullets
                tf_body = slide.shapes.add_textbox(Inches(0.6), Inches(1.5), Inches(12), Inches(5.5)).text_frame
                tf_body.word_wrap = True
                for bullet in slide_data['bullets'][:8]:
                    if bullet.strip():
                        p = tf_body.add_paragraph()
                        p.space_before = Pt(6)
                        run = p.add_run()
                        run.text = f'  {bullet}'
                        run.font.size = Pt(18)
                        run.font.color.rgb = LIGHT_GRAY

                # Slide number
                tf_num = slide.shapes.add_textbox(Inches(12.5), Inches(6.9), Inches(0.7), Inches(0.5)).text_frame
                add_text(tf_num, str(i + 1), 10, color=RGBColor(0x64, 0x74, 0x8B), align=PP_ALIGN.RIGHT)

        buf = io.BytesIO()
        prs.save(buf)
        buf.seek(0)
        resp = HttpResponse(buf.read(), content_type='application/vnd.openxmlformats-officedocument.presentationml.presentation')
        resp['Content-Disposition'] = f'attachment; filename="{_safe_filename(ws.name)}.pptx"'
        return resp
    except ImportError:
        return _export_txt(ws, doc)
