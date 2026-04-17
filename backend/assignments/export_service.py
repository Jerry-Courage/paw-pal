import io
import asyncio
import logging
from django.http import HttpResponse, Http404
from django.shortcuts import get_object_or_404
from .models import Assignment
from rest_framework_simplejwt.authentication import JWTAuthentication

logger = logging.getLogger(__name__)

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response as DRFResponse

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def standalone_export_view(request, pk):
    """
    Permanent Terminal Routing Dispatcher with Fluid Disconnect Handling.
    Bypasses ViewSet/Router complexities to ensure 1:1 Mission Success.
    """
    user = request.user
    
    # ── Object & Permission Check ────────────────────────────
    assignment = get_object_or_404(Assignment, pk=pk)
    
    # Security Check: Is Owner OR is a member of a workspace where shared
    from workspace.models import WorkspaceMember
    can_access = (assignment.user == user)
    if not can_access:
         can_access = WorkspaceMember.objects.filter(
             workspace__messages__shared_assignment=assignment,
             user=user
         ).exists()

    if not can_access:
        return HttpResponse("Unauthorized: Access to this document signal is restricted.", status=403)
    format_type = request.GET.get('format', 'pdf').lower()
    
    # ── Synthesis Dispatch ──────────────────────────────────
    from .views import AssignmentViewSet
    v = AssignmentViewSet()
    
    try:
        if format_type == 'pdf':
            return v._export_pdf(assignment)
        elif format_type in ['docx', 'word']:
            return v._export_docx(assignment)
        else:
            return v._export_txt(assignment)
    except asyncio.CancelledError:
        logger.info(f"Fluid Disconnect: Client hung up on export for assignment {pk}")
        # Return none to let Daphne handle the clean exit
        return None
    except Exception as e:
        logger.error(f"Export synthesis failed: {e}")
        return HttpResponse("Internal server error during document synthesis.", status=500)
