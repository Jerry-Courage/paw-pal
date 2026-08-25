from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.db import DatabaseError, ProgrammingError
from django.shortcuts import get_object_or_404
from .models import Resource, ResourceProgress

STEP_ORDER = ['notes', 'flashcards', 'quiz', 'practice', 'examprep']
STEP_XP = {'notes': 50, 'flashcards': 10, 'quiz': 10, 'practice': 100, 'examprep': 150}

# Map study steps to RewardEngine activity types
# notes and practice are unique study-step types.
# flashcards, quiz, examprep route to standalone completion types
# (ONE base reward per activity — no overlap with study_* variants).
STEP_ACTIVITY_MAP = {
    'notes': 'study_notes',
    'flashcards': 'flashcard_session',
    'quiz': 'quiz_completion',
    'practice': 'study_practice',
    'examprep': 'exam_prep_completion',
}


class ResourceProgressView(APIView):
    """GET / PUT /api/library/resources/<id>/progress/ — fetch or sync study progress."""
    permission_classes = [IsAuthenticated]

    def get(self, request, resource_id):
        resource = get_object_or_404(Resource, id=resource_id)
        try:
            progress, _ = ResourceProgress.objects.get_or_create(
                user=request.user,
                resource=resource,
            )
            return Response(_serialize(progress))
        except (ProgrammingError, DatabaseError):
            return Response(_empty_progress_payload(resource.id))

    def put(self, request, resource_id):
        """Sync section progress from frontend to backend."""
        resource = get_object_or_404(Resource, id=resource_id)
        try:
            progress, _ = ResourceProgress.objects.get_or_create(
                user=request.user,
                resource=resource,
            )
            completed_sections = request.data.get('completed_sections')
            current_section = request.data.get('current_section')
            if completed_sections is not None:
                progress.completed_sections = completed_sections
            if current_section is not None:
                progress.current_section = int(current_section)
            progress.save(update_fields=['completed_sections', 'current_section', 'updated_at'])
            total_sections = len((resource.ai_notes_json or {}).get('sections', []))
            progress.recalculate_mastery(total_sections)
            return Response(_serialize(progress))
        except (ProgrammingError, DatabaseError):
            return Response(_empty_progress_payload(resource.id))


class CompleteStepView(APIView):
    """
    POST /api/library/resources/<id>/progress/complete/
    Body: { "step": "notes"|"flashcards"|"quiz"|"practice"|"examprep", "score": 0-100 }
    Awards XP via RewardEngine and updates mastery.
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

        try:
            progress, _ = ResourceProgress.objects.get_or_create(
                user=request.user,
                resource=resource,
            )

            # complete_step still updates ResourceProgress (backward compat)
            # but we do NOT add to global XP here — RewardEngine handles that
            already_done = progress.completed_steps.get(step, False)
            current_score = progress.step_scores.get(step, 0)
            progress.step_scores[step] = max(current_score, score)
            if not already_done:
                progress.completed_steps[step] = True
            progress.save()
            total_sections = len((resource.ai_notes_json or {}).get('sections', []))
            progress.recalculate_mastery(total_sections)

            # Award global XP via RewardEngine
            from gamification.services import RewardEngine
            activity_type = STEP_ACTIVITY_MAP.get(step, 'study_notes')
            reward = RewardEngine.process(
                user=request.user,
                activity_type=activity_type,
                source_id=str(resource.id),
                context={'step': step, 'score': score, 'resource_id': resource.id},
            )

            return Response({
                **_serialize(progress),
                'xp_gained': reward['xp'],
                'total_xp': reward['level']['current'] if reward['xp'] > 0 else 0,
                'reward': reward,
            })
        except (ProgrammingError, DatabaseError):
            return Response({
                **_empty_progress_payload(resource.id),
                'xp_gained': 0,
                'total_xp': 0,
            })


def _empty_progress_payload(resource_id: int) -> dict:
    return {
        'resource_id': resource_id,
        'completed_steps': {},
        'step_scores': {},
        'completed_sections': [],
        'current_section': 0,
        'xp_earned': 0,
        'mastery': 0,
        'next_step': 'notes',
        'completed_count': 0,
        'step_order': STEP_ORDER,
        'step_xp': STEP_XP,
    }


def _serialize(p: ResourceProgress) -> dict:
    return {
        'resource_id': p.resource_id,
        'completed_steps': p.completed_steps,
        'step_scores': p.step_scores,
        'completed_sections': p.completed_sections or [],
        'current_section': p.current_section,
        'xp_earned': p.xp_earned,
        'mastery': p.mastery,
        'next_step': p.next_step,
        'completed_count': p.completed_count,
        'step_order': STEP_ORDER,
        'step_xp': STEP_XP,
    }
