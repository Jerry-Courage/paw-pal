"""
Spaced Repetition Engine — SM-2 algorithm variant for concept retention.
"""
from datetime import timedelta
from django.utils import timezone


def calculate_next_review(review, score):
    """
    SM-2 algorithm: calculates next review interval and ease factor.
    
    Args:
        review: ConceptReview instance
        score: 0-100 quiz score
    
    Returns:
        dict with updated ease_factor, interval_days, repetitions, next_review
    """
    # Normalize score to 0-5 scale (SM-2 uses 0-5)
    quality = max(0, min(5, int(score / 20)))
    
    ef = review.ease_factor
    rep = review.repetitions
    
    if quality >= 3:  # Correct response
        if rep == 0:
            interval = 1
        elif rep == 1:
            interval = 6
        else:
            interval = max(1, int(review.interval_days * ef))
        rep += 1
    else:  # Incorrect response — reset
        interval = 1
        rep = 0
    
    # Update ease factor
    ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    ef = max(1.3, min(3.0, ef))
    
    next_review = timezone.now() + timedelta(days=interval)
    
    return {
        'ease_factor': round(ef, 2),
        'interval_days': interval,
        'repetitions': rep,
        'next_review': next_review,
        'last_score': score,
        'last_reviewed': timezone.now(),
    }


def get_due_concepts(user, limit=20):
    """Get concepts due for review, ordered by priority."""
    from .models import ConceptReview, ConceptNode
    now = timezone.now()
    
    reviews = ConceptReview.objects.filter(
        user=user,
        next_review__lte=now,
        concept__status__in=['current', 'completed']
    ).select_related('concept', 'concept__path').order_by('next_review')[:limit]
    
    return reviews


def get_review_stats(user):
    """Get overall review statistics for a user."""
    from .models import ConceptReview
    from django.db.models import Avg, Count, Q
    
    now = timezone.now()
    stats = ConceptReview.objects.filter(user=user).aggregate(
        total=Count('id'),
        due_count=Count('id', filter=Q(next_review__lte=now)),
        avg_retention=Avg('last_score'),
        avg_ease=Avg('ease_factor'),
    )
    return stats


def calculate_mastery(concept, reviews):
    """Calculate concept mastery from review history and quiz scores."""
    if not reviews:
        return 0
    
    # Weight: recent scores matter more
    total_weight = 0
    weighted_score = 0
    for i, review in enumerate(reviews):
        weight = 1 + (i * 0.5)  # More recent = higher weight
        weighted_score += review.last_score * weight
        total_weight += weight
    
    if total_weight == 0:
        return 0
    
    mastery = weighted_score / total_weight
    return min(100, int(mastery))
