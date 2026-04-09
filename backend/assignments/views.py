import io
import logging
import re
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from django.utils import timezone

from .models import Assignment
from .serializers import AssignmentSerializer

logger = logging.getLogger('flowstate')

class AssignmentViewSet(viewsets.ModelViewSet):
    """
    Unified ViewSet for all Assignment operations including creation, 
    detail, AI solving, refinement, and exporting.
    """
    serializer_class = AssignmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Assignment.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        assignment = serializer.save(user=self.request.user)
        if assignment.due_date:
            self._create_deadline(assignment)

    def _create_deadline(self, assignment):
        try:
            from planner.models import Deadline
            Deadline.objects.create(
                user=assignment.user,
                title=assignment.title,
                subject=assignment.subject or '',
                due_date=assignment.due_date,
                assignment=assignment,
            )
            # Notify if due within 7 days
            days_until = (assignment.due_date - timezone.now()).days
            if days_until <= 7:
                from users.notifications import notify_deadline_approaching
                notify_deadline_approaching(assignment.user, assignment.title, days_until)
        except Exception as e:
            logger.warning(f'Could not create deadline for assignment {assignment.id}: {e}')

    def get_parsers(self):
        from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
        return [MultiPartParser(), FormParser(), JSONParser()]

    @action(detail=True, methods=['post'])
    def solve(self, request, pk=None):
        """Trigger AI to solve the assignment using linked resources."""
        assignment = self.get_object()

        # Extract text from uploaded file if instructions are empty
        if not assignment.instructions.strip() and assignment.file:
            try:
                from library.pdf_extractor import extract_pdf_text
                text = extract_pdf_text(assignment.file.path)
                if text:
                    assignment.instructions = text[:6000]
                    assignment.save(update_fields=['instructions'])
            except Exception as e:
                logger.warning(f'Could not extract text from assignment file: {e}')

        if not assignment.instructions.strip():
            return Response({'error': 'Assignment instructions are required. Please type them or upload a PDF.'}, status=status.HTTP_400_BAD_REQUEST)

        assignment.status = 'processing'
        assignment.save(update_fields=['status'])

        try:
            from ai_assistant.services import AIService
            ai = AIService()
            result = ai.solve_assignment(assignment)

            assignment.ai_response = result['response']
            assignment.ai_overview = result['overview']
            assignment.ai_outline = result['outline']
            assignment.status = 'completed'
            assignment.save()
            return Response(self.get_serializer(assignment).data)
        except Exception as e:
            logger.error(f'Assignment solve error {pk}: {e}')
            assignment.status = 'error'
            assignment.save()
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def refine(self, request, pk=None):
        """Iteratively refine the AI response based on user feedback."""
        assignment = self.get_object()
        prompt = request.data.get('prompt')
        if not prompt:
            return Response({'error': 'Prompt is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from ai_assistant.services import AIService
            ai = AIService()
            result = ai.refine_assignment(assignment, prompt)
            
            assignment.ai_response = result['response']
            assignment.ai_overview = result['overview']
            assignment.chat_history = result['chat_history']
            assignment.save()
            return Response(self.get_serializer(assignment).data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['get'])
    def export(self, request, pk=None):
        """Export assignment as PDF, DOCX, or TXT."""
        assignment = self.get_object()
        fmt = request.query_params.get('format', 'txt').lower()
        
        logger.info(f"Exporting assignment {assignment.id} to {fmt}")

        if not assignment.ai_response:
            return Response({'error': 'No AI response to export yet.'}, status=status.HTTP_400_BAD_REQUEST)

        if fmt == 'txt':
            return self._export_txt(assignment)
        elif fmt == 'pdf':
            return self._export_pdf(assignment)
        elif fmt == 'docx':
            return self._export_docx(assignment)
        else:
            return Response({'error': 'Unsupported format. Use txt, pdf, or docx.'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'])
    def roadmap(self, request, pk=None):
        """Analyze assignment and generate roadmap milestones."""
        assignment = self.get_object()
        try:
            from ai_assistant.services import AIService
            ai = AIService()
            roadmap = ai.generate_assignment_roadmap(assignment)
            
            from planner.models import Deadline
            for step in roadmap:
                Deadline.objects.create(
                    user=request.user,
                    title=f"Milestone: {step['title']}",
                    subject=assignment.subject or 'General',
                    due_date=step['due_date'],
                    assignment=assignment
                )
            return Response({'message': f'Generated {len(roadmap)} milestones in your planner.'})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def transform(self, request, pk=None):
        """Convert assignment result into a new Workspace with intelligent blocks."""
        assignment = self.get_object()
        if not assignment.ai_response:
            return Response({'error': 'Solve the assignment first.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            from workspace.models import Workspace, WorkspaceBlock
            
            # 1. Create Workspace (Fixing 'user' bug to 'owner')
            ws = Workspace.objects.create(
                owner=request.user,
                name=f"Project: {assignment.title}",
                subject=assignment.subject or 'General',
                assignment=assignment
            )
            
            # 2. Extract structured blocks from AI response
            lines = assignment.ai_response.split('\n')
            current_content = []
            order = 0
            
            def save_block(b_type, content_lines, order_idx):
                text = '\n'.join(content_lines).strip()
                if text:
                    WorkspaceBlock.objects.create(
                        workspace=ws,
                        block_type=b_type,
                        content=text,
                        order=order_idx
                    )
                    return True
                return False

            i = 0
            while i < len(lines):
                line = lines[i]
                
                # Detect Code Blocks
                if line.strip().startswith('```'):
                    if save_block('text', current_content, order):
                        order += 1
                        current_content = []
                    
                    lang = line.strip()[3:].strip()
                    i += 1
                    code_lines = []
                    while i < len(lines) and not lines[i].strip().startswith('```'):
                        code_lines.append(lines[i])
                        i += 1
                    
                    WorkspaceBlock.objects.create(
                        workspace=ws,
                        block_type='code',
                        content='\n'.join(code_lines).strip(),
                        metadata={'language': lang},
                        order=order
                    )
                    order += 1
                    i += 1
                    continue
                
                # Break at major headers to create discrete blocks
                if line.startswith('# ') or line.startswith('## '):
                    if save_block('text', current_content, order):
                        order += 1
                        current_content = []
                
                current_content.append(line)
                i += 1
            
            save_block('text', current_content, order)
            
            # 3. Link existing resources
            for res in assignment.resources.all():
                ws.resources.add(res)
                
            return Response({'workspace_id': ws.id})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'])
    def schedule(self, request, pk=None):
        """Create a planner study session linked to this assignment."""
        assignment = self.get_object()
        start_time = request.data.get('start_time')
        end_time = request.data.get('end_time')

        if not start_time or not end_time:
            return Response({'error': 'start_time and end_time are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from planner.models import StudySession
            from planner.serializers import StudySessionSerializer
            session = StudySession.objects.create(
                user=request.user,
                title=f'Work on: {assignment.title}',
                subject=assignment.subject or '',
                start_time=start_time,
                end_time=end_time,
                assignment=assignment,
                notes=f'Study session for assignment: {assignment.title}',
            )
            return Response(StudySessionSerializer(session).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # --- Export Helper Methods ---

    def _export_txt(self, assignment):
        content = self._build_text_content(assignment)
        response = HttpResponse(content, content_type='text/plain; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="{self._safe_filename(assignment.title)}.txt"'
        return response

    def _export_pdf(self, assignment):
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import cm
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
            
            buffer = io.BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=2*cm, leftMargin=2*cm, topMargin=2*cm, bottomMargin=2*cm)
            styles = getSampleStyleSheet()
            story = []

            title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=18, spaceAfter=6)
            story.append(Paragraph(assignment.title, title_style))
            if assignment.subject:
                story.append(Paragraph(f'Subject: {assignment.subject}', styles['Normal']))
            story.append(Spacer(1, 0.5*cm))

            if assignment.ai_overview:
                story.append(Paragraph('AI Overview', styles['Heading2']))
                story.append(Paragraph(assignment.ai_overview, styles['Normal']))
                story.append(Spacer(1, 0.3*cm))

            content = assignment.ai_response
            for line in content.split('\n'):
                line = line.strip()
                if not line:
                    story.append(Spacer(1, 0.2*cm))
                elif line.startswith('## '):
                    story.append(Paragraph(line[3:], styles['Heading2']))
                elif line.startswith('# '):
                    story.append(Paragraph(line[2:], styles['Heading1']))
                elif line.startswith('### '):
                    story.append(Paragraph(line[4:], styles['Heading3']))
                elif line.startswith('- ') or line.startswith('* '):
                    story.append(Paragraph(f'• {line[2:]}', styles['Normal']))
                else:
                    line = re.sub(r'\*\*(.+?)\*\*', r'\1', line)
                    line = re.sub(r'\*(.+?)\*', r'\1', line)
                    story.append(Paragraph(line, styles['Normal']))

            doc.build(story)
            buffer.seek(0)
            response = HttpResponse(buffer.read(), content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="{self._safe_filename(assignment.title)}.pdf"'
            return response
        except ImportError:
            return self._export_txt(assignment)

    def _export_docx(self, assignment):
        try:
            from docx import Document
            doc = Document()
            doc.add_heading(assignment.title, 0)
            if assignment.subject:
                doc.add_paragraph(f'Subject: {assignment.subject}')

            if assignment.ai_overview:
                doc.add_heading('AI Overview', level=2)
                doc.add_paragraph(assignment.ai_overview)

            doc.add_heading('Assignment Response', level=1)
            for line in assignment.ai_response.split('\n'):
                line = line.strip()
                if not line: continue
                if line.startswith('## '): doc.add_heading(line[3:], level=2)
                elif line.startswith('# '): doc.add_heading(line[2:], level=1)
                elif line.startswith('### '): doc.add_heading(line[4:], level=3)
                elif line.startswith('- ') or line.startswith('* '): doc.add_paragraph(line[2:], style='List Bullet')
                else:
                    line = re.sub(r'\*\*(.+?)\*\*', r'\1', line)
                    doc.add_paragraph(line)

            buffer = io.BytesIO()
            doc.save(buffer)
            buffer.seek(0)
            response = HttpResponse(buffer.read(), content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            response['Content-Disposition'] = f'attachment; filename="{self._safe_filename(assignment.title)}.docx"'
            return response
        except ImportError:
            return self._export_txt(assignment)

    def _build_text_content(self, assignment):
        lines = [assignment.title.upper(), '=' * len(assignment.title), '']
        if assignment.subject: lines += [f'Subject: {assignment.subject}', '']
        if assignment.ai_overview: lines += ['AI OVERVIEW', '-' * 11, assignment.ai_overview, '']
        lines += ['ASSIGNMENT RESPONSE', '-' * 19, '', assignment.ai_response]
        return '\n'.join(lines)

    def _safe_filename(self, title):
        return re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_')[:50]
