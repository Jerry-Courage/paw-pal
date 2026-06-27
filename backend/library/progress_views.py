from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from .models import Resource
from .progress import ResourceProgress, STEP_ORDER, STEP_XP


class ResourceProgressView(APIView):
    """GET /api/library/resources/<id>/progress/ — fetch study path progress."""
    permission_classes = [IsAuthenticated]

    def get(self, request, resource_id):
        resource = get_object_or_404(Resource, id=resource_id)
        progress, _ = ResourceProgress.objects.get_or_create(
            user=request.user,
            resource=resource,
        )
        return Response(_serialize(progress))


class CompleteStepView(APIView):
    """
    POST /api/library/resources/<id>/progress/complete/
    Body: { "step": "notes"|"flashcards"|"quiz"|"practice"|"examprep", "score": 0-100 }
    Awards XP and updates mastery.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, resource_id):
        resource = get_object_or_404(Resource, id=resource_id)
        step = request.data.get('step', '').strip()
        score = int(request.data.get('score', 100))

        if step not in STEP_ORDER:
            return Response(
                {'error': f'Invalid step. Must be one of: {", ".join(STEP_ORDER)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        score = max(0, min(100, score))

        progress, _ = ResourceProgress.objects.get_or_create(
            user=request.user,
            resource=resource,
        )

        xp_gained = progress.complete_step(step, score)

        # Fetch updated user XP
        request.user.refresh_from_db()

        return Response({
            **_serialize(progress),
            'xp_gained': xp_gained,
            'total_xp': request.user.xp,
        })


def _serialize(p: ResourceProgress) -> dict:
    return {
        'resource_id': p.resource_id,
        'completed_steps': p.completed_steps,
        'step_scores': p.step_scores,
        'xp_earned': p.xp_earned,
        'mastery': p.mastery,
        'next_step': p.next_step,
        'completed_count': p.completed_count,
        'step_order': STEP_ORDER,
        'step_xp': STEP_XP,
    }
