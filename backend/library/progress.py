"""
Study Path Progress — tracks per-user, per-resource mastery.
Each resource has 5 steps: notes → flashcards → quiz → practice → examprep
Completing steps earns XP and updates mastery score.
"""
from django.db import models
from django.conf import settings


STEP_XP = {
    'notes':      50,
    'flashcards': 75,
    'quiz':       100,
    'practice':   100,
    'examprep':   150,
}

STEP_ORDER = ['notes', 'flashcards', 'quiz', 'practice', 'examprep']


class ResourceProgress(models.Model):
    """Tracks which study path steps a user has completed for a resource."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='resource_progress'
    )
    resource = models.ForeignKey(
        'library.Resource',
        on_delete=models.CASCADE,
        related_name='progress'
    )
    # Which steps are done — stored as a dict: {'notes': True, 'quiz': True, ...}
    completed_steps = models.JSONField(default=dict)
    # Best scores per step (0-100)
    step_scores = models.JSONField(default=dict)
    # Total XP earned from this resource
    xp_earned = models.IntegerField(default=0)
    # Overall mastery 0-100 (weighted avg of completed steps)
    mastery = models.IntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'resource')
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.user.email} — {self.resource.title} — {self.mastery}%'

    def complete_step(self, step: str, score: int = 100) -> int:
        """
        Mark a step complete. Returns XP gained (0 if already completed).
        score: 0-100, used for mastery calculation.
        """
        if step not in STEP_ORDER:
            return 0

        xp_gained = 0
        already_done = self.completed_steps.get(step, False)

        # Update score (keep best score)
        current_score = self.step_scores.get(step, 0)
        self.step_scores[step] = max(current_score, score)

        # Award XP only on first completion
        if not already_done:
            self.completed_steps[step] = True
            xp_gained = STEP_XP.get(step, 50)
            self.xp_earned += xp_gained

        # Recalculate mastery
        total_steps = len(STEP_ORDER)
        completed = [s for s in STEP_ORDER if self.completed_steps.get(s)]
        if completed:
            avg_score = sum(self.step_scores.get(s, 100) for s in completed) / len(completed)
            completion_pct = len(completed) / total_steps
            self.mastery = int(avg_score * completion_pct)
        else:
            self.mastery = 0

        self.save()

        # Award XP to user
        if xp_gained > 0:
            try:
                from django.contrib.auth import get_user_model
                User = get_user_model()
                User.objects.filter(pk=self.user_id).update(
                    xp=models.F('xp') + xp_gained
                )
            except Exception:
                pass  # xp field may not exist yet — handled gracefully

        return xp_gained

    @property
    def next_step(self) -> str | None:
        """Returns the next uncompleted step in order."""
        for step in STEP_ORDER:
            if not self.completed_steps.get(step):
                return step
        return None  # all done

    @property
    def completed_count(self) -> int:
        return sum(1 for s in STEP_ORDER if self.completed_steps.get(s))
