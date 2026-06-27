from django.db import models
from django.conf import settings
from pgvector.django import VectorField


class Resource(models.Model):
    TYPE_CHOICES = [
        ('pdf', 'PDF/Word'),
        ('video', 'YouTube'),
        ('code', 'Code'),
        ('slides', 'Slides'),
        ('other', 'Other'),
    ]
    STATUS_CHOICES = [
        ('processing', 'Processing'),
        ('ready', 'Study Ready'),
        ('error', 'Error'),
    ]

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='resources', db_index=True)
    title = models.CharField(max_length=300)
    resource_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='pdf')
    file = models.FileField(upload_to='resources/', null=True, blank=True)
    url = models.URLField(blank=True)
    subject = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='processing')
    processing_progress = models.IntegerField(default=0)
    status_text = models.CharField(max_length=255, blank=True)
    file_size = models.BigIntegerField(default=0)
    ai_summary = models.TextField(blank=True)
    ai_notes_json = models.JSONField(default=dict, blank=True)
    selected_features = models.JSONField(default=list, blank=True)  # features to auto-generate on upload
    ai_concepts = models.JSONField(default=list)
    has_study_kit = models.BooleanField(default=False)
    cover_image = models.ImageField(upload_to='resources/covers/', null=True, blank=True)
    thumbnail_url = models.URLField(blank=True)
    is_public = models.BooleanField(default=False, db_index=True)
    author_name = models.CharField(max_length=200, default='Flow State Curator')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class ResourceImage(models.Model):
    resource = models.ForeignKey(Resource, on_delete=models.CASCADE, related_name='extracted_images')
    image = models.ImageField(upload_to='resources/images/')
    page_number = models.IntegerField(default=1)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Image from {self.resource.title} - Page {self.page_number}"


class Deck(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='decks')
    title = models.CharField(max_length=200)
    subject = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.title} ({self.subject})"


class Flashcard(models.Model):
    deck = models.ForeignKey(Deck, on_delete=models.SET_NULL, null=True, blank=True, related_name='cards')
    resource = models.ForeignKey(Resource, on_delete=models.CASCADE, related_name='flashcards')
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='flashcards')
    question = models.TextField()
    answer = models.TextField()
    subject = models.CharField(max_length=200, blank=True)
    difficulty = models.CharField(max_length=20, default='medium')
    # Spaced repetition fields
    ease_factor = models.FloatField(default=2.5)       # SM-2 ease factor
    interval_days = models.IntegerField(default=1)     # Days until next review
    repetitions = models.IntegerField(default=0)       # Times reviewed
    next_review = models.DateTimeField(null=True, blank=True)
    is_public = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Flashcard: {self.question[:50]}"

    def update_spaced_repetition(self, quality: int):
        """
        SM-2 algorithm. quality: 0-5 (0=blackout, 5=perfect)
        """
        from django.utils import timezone
        from datetime import timedelta

        if quality < 3:
            self.repetitions = 0
            self.interval_days = 1
        else:
            if self.repetitions == 0:
                self.interval_days = 1
            elif self.repetitions == 1:
                self.interval_days = 6
            else:
                self.interval_days = round(self.interval_days * self.ease_factor)
            self.repetitions += 1

        self.ease_factor = max(1.3, self.ease_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
        self.next_review = timezone.now() + timedelta(days=self.interval_days)
        self.save()


class Quiz(models.Model):
    FORMAT_CHOICES = [
        ('flashcard', 'Flashcards'),
        ('mcq', 'Multiple Choice'),
        ('short', 'Short Answer'),
        ('mixed', 'Mixed Mode'),
    ]
    resource = models.ForeignKey(Resource, on_delete=models.CASCADE, related_name='quizzes')
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='quizzes')
    title = models.CharField(max_length=300)
    format = models.CharField(max_length=20, choices=FORMAT_CHOICES, default='mcq')
    questions = models.JSONField(default=list)
    academic_level = models.CharField(max_length=50, default='undergrad')
    is_public = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class PodcastSession(models.Model):
    resource = models.ForeignKey(Resource, on_delete=models.CASCADE, related_name='podcasts', db_index=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='podcasts', db_index=True)
    voice_a = models.CharField(max_length=100, default='en-US-ChristopherNeural')
    voice_b = models.CharField(max_length=100, default='en-US-JennyNeural')
    status = models.CharField(max_length=20, default='generating')
    script_chunks = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Podcast for {self.resource.title}"

class DocumentChunk(models.Model):
    """Stores text fragments and their vector embeddings for Semantic RAG Search"""
    resource = models.ForeignKey(Resource, on_delete=models.CASCADE, related_name='chunks', db_index=True)
    text_content = models.TextField()
    
    # We use 384 dimensions since we target sentence-transformers/all-MiniLM-L6-v2 which is
    # incredibly fast and accurate for RAG use cases.
    embedding = VectorField(dimensions=384)
    page_number = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Chunk for {self.resource.title}"

# ResourceProgress is defined in progress.py in this same app package.
# Django discovers it automatically — no explicit import needed here.

class ResourceProgress(models.Model):
    """Tracks study path progress per user per resource."""
    STEP_ORDER = ['notes', 'flashcards', 'quiz', 'practice', 'examprep']
    STEP_XP = {'notes': 50, 'flashcards': 75, 'quiz': 100, 'practice': 100, 'examprep': 150}

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='resource_progress')
    resource = models.ForeignKey('Resource', on_delete=models.CASCADE, related_name='progress')
    completed_steps = models.JSONField(default=dict)
    step_scores = models.JSONField(default=dict)
    xp_earned = models.IntegerField(default=0)
    mastery = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'resource')
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.user.email} — {self.resource.title} — {self.mastery}%'

    def complete_step(self, step: str, score: int = 100) -> int:
        if step not in self.STEP_ORDER:
            return 0
        xp_gained = 0
        already_done = self.completed_steps.get(step, False)
        current_score = self.step_scores.get(step, 0)
        self.step_scores[step] = max(current_score, score)
        if not already_done:
            self.completed_steps[step] = True
            xp_gained = self.STEP_XP.get(step, 50)
            self.xp_earned += xp_gained
        completed = [s for s in self.STEP_ORDER if self.completed_steps.get(s)]
        if completed:
            avg_score = sum(self.step_scores.get(s, 100) for s in completed) / len(completed)
            self.mastery = int(avg_score * len(completed) / len(self.STEP_ORDER))
        else:
            self.mastery = 0
        self.save()
        if xp_gained > 0:
            try:
                from django.db.models import F as _F
                type(self.user).objects.filter(pk=self.user_id).update(xp=_F('xp') + xp_gained)
            except Exception:
                pass
        return xp_gained

    @property
    def next_step(self):
        for step in self.STEP_ORDER:
            if not self.completed_steps.get(step):
                return step
        return None

    @property
    def completed_count(self):
        return sum(1 for s in self.STEP_ORDER if self.completed_steps.get(s))
