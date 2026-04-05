import io
import logging
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from .models import Assignment
from .serializers import AssignmentSerializer

logger = logging.getLogger('flowstate')


class AssignmentListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AssignmentSerializer

    def get_queryset(self):
        return Assignment.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        assignment = serializer.save(user=self.request.user)
        # Auto-create a planner deadline if due_date is set
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
            from django.utils import timezone
            days_until = (assignment.due_date - timezone.now()).days
            if days_until <= 7:
                from users.notifications import notify_deadline_approaching
                notify_deadline_approaching(assignment.user, assignment.title, days_until)
        except Exception as e:
            logger.warning(f'Could not create deadline for assignment {assignment.id}: {e}')

    def get_parsers(self):
        from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
        return [MultiPartParser(), FormParser(), JSONParser()]


class AssignmentDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AssignmentSerializer

    def get_queryset(self):
        return Assignment.objects.filter(user=self.request.user)


class SolveAssignmentView(APIView):
    """Trigger AI to solve the assignment using linked resources."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        assignment = get_object_or_404(Assignment, pk=pk, user=request.user)

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
            assignment.save(update_fields=['ai_response', 'ai_overview', 'ai_outline', 'status'])

            return Response(AssignmentSerializer(assignment).data)
        except Exception as e:
            logger.error(f'Assignment solve error {pk}: {e}')
            assignment.status = 'error'
            assignment.save(update_fields=['status'])
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ScheduleSessionView(APIView):
    """Create a planner study session linked to this assignment."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        assignment = get_object_or_404(Assignment, pk=pk, user=request.user)
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


class ExportAssignmentView(APIView):
    """Export assignment as PDF, DOCX, or TXT."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        assignment = get_object_or_404(Assignment, pk=pk, user=request.user)
        fmt = request.query_params.get('format', 'txt').lower()

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
            from reportlab.lib.enums import TA_LEFT, TA_CENTER
            import re

            buffer = io.BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=A4,
                                    rightMargin=2*cm, leftMargin=2*cm,
                                    topMargin=2*cm, bottomMargin=2*cm)
            styles = getSampleStyleSheet()
            story = []

            # Title
            title_style = ParagraphStyle('Title', parent=styles['Title'], fontSize=18, spaceAfter=6)
            story.append(Paragraph(assignment.title, title_style))
            if assignment.subject:
                story.append(Paragraph(f'Subject: {assignment.subject}', styles['Normal']))
            story.append(Spacer(1, 0.5*cm))

            # Overview
            if assignment.ai_overview:
                story.append(Paragraph('AI Overview', styles['Heading2']))
                story.append(Paragraph(assignment.ai_overview, styles['Normal']))
                story.append(Spacer(1, 0.3*cm))

            # Main content — strip markdown
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
                    # Strip remaining markdown bold/italic
                    line = re.sub(r'\*\*(.+?)\*\*', r'\1', line)
                    line = re.sub(r'\*(.+?)\*', r'\1', line)
                    story.append(Paragraph(line, styles['Normal']))

            doc.build(story)
            buffer.seek(0)
            response = HttpResponse(buffer.read(), content_type='application/pdf')
            response['Content-Disposition'] = f'attachment; filename="{self._safe_filename(assignment.title)}.pdf"'
            return response
        except ImportError:
            # Fallback to txt if reportlab not installed
            return self._export_txt(assignment)

    def _export_docx(self, assignment):
        try:
            from docx import Document
            from docx.shared import Pt, Inches
            import re

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
                if not line:
                    continue
                elif line.startswith('## '):
                    doc.add_heading(line[3:], level=2)
                elif line.startswith('# '):
                    doc.add_heading(line[2:], level=1)
                elif line.startswith('### '):
                    doc.add_heading(line[4:], level=3)
                elif line.startswith('- ') or line.startswith('* '):
                    doc.add_paragraph(line[2:], style='List Bullet')
                else:
                    line = re.sub(r'\*\*(.+?)\*\*', r'\1', line)
                    doc.add_paragraph(line)

            buffer = io.BytesIO()
            doc.save(buffer)
            buffer.seek(0)
            response = HttpResponse(buffer.read(),
                content_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            response['Content-Disposition'] = f'attachment; filename="{self._safe_filename(assignment.title)}.docx"'
            return response
        except ImportError:
            return self._export_txt(assignment)

    def _build_text_content(self, assignment):
        lines = [
            assignment.title.upper(),
            '=' * len(assignment.title),
            '',
        ]
        if assignment.subject:
            lines.append(f'Subject: {assignment.subject}')
            lines.append('')
        if assignment.ai_overview:
            lines += ['AI OVERVIEW', '-' * 11, assignment.ai_overview, '']
        lines += ['ASSIGNMENT RESPONSE', '-' * 19, '', assignment.ai_response]
        return '\n'.join(lines)

    def _safe_filename(self, title):
        import re
        return re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_')[:50]
