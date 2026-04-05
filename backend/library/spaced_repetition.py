"""
Spaced repetition review endpoint.
Uses SM-2 algorithm implemented on the Flashcard model.
"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions, status
from django.utils import timezone
from .models import Flashcard
from .serializers import FlashcardSerializer


class DueFlashcardsView(APIView):
    """Get flashcards due for review today."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        # Cards never reviewed OR due today
        due = Flashcard.objects.filter(
            owner=request.user
        ).filter(
            models.Q(next_review__isnull=True) | models.Q(next_review__lte=now)
        ).order_by('next_review', 'created_at')[:50]

        return Response({
            'count': due.count(),
            'flashcards': FlashcardSerializer(due, many=True).data,
        })


class ReviewFlashcardView(APIView):
    """Submit a review result for a flashcard (SM-2)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, flashcard_id):
        flashcard = Flashcard.objects.filter(id=flashcard_id, owner=request.user).first()
        if not flashcard:
            return Response({'error': 'Flashcard not found.'}, status=status.HTTP_404_NOT_FOUND)

        quality = int(request.data.get('quality', 3))  # 0-5
        quality = max(0, min(5, quality))

        flashcard.update_spaced_repetition(quality)

        return Response({
            'next_review': flashcard.next_review,
            'interval_days': flashcard.interval_days,
            'ease_factor': round(flashcard.ease_factor, 2),
        })


# Need to import models.Q
from django.db import models
