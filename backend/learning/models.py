import uuid
from django.db import models
from django.conf import settings


class LearningPath(models.Model):
    """A cross-resource learning roadmap — concept progression with unit hierarchy."""
    STATUS_CHOICES = [('draft', 'Draft'), ('active', 'Active'), ('paused', 'Paused'), ('completed', 'Completed')]
    DEPTH_CHOICES = [('quick', 'Quick'), ('standard', 'Standard'), ('deep', 'Deep')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='learning_paths')
    title = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    subject = models.CharField(max_length=200, blank=True)
    goal = models.CharField(max_length=300, blank=True, help_text='What the user wants to master')
    depth = models.CharField(max_length=20, choices=DEPTH_CHOICES, default='standard')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    start_date = models.DateTimeField(null=True, blank=True, help_text='When to start studying')
    deadline = models.DateTimeField(null=True, blank=True, help_text='When the exam/goal is due')
    total_xp = models.IntegerField(default=0)
    concepts_completed = models.IntegerField(default=0)
    total_concepts = models.IntegerField(default=0)
    daily_review_goal = models.IntegerField(default=10, help_text='Concepts to review per day')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.title} ({self.get_status_display()})'

    @property
    def mastery_percent(self):
        if self.total_concepts == 0:
            return 0
        return int((self.concepts_completed / self.total_concepts) * 100)

    def recalculate_progress(self):
        nodes = self.concepts.all()
        self.total_concepts = nodes.count()
        self.concepts_completed = nodes.filter(status='completed').count()
        self.total_xp = sum(n.xp_earned for n in nodes)
        self.save(update_fields=['total_concepts', 'concepts_completed', 'total_xp', 'updated_at'])


class Unit(models.Model):
    """A logical grouping of concepts within a learning path (e.g. 'Cell Foundations')."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    path = models.ForeignKey(LearningPath, on_delete=models.CASCADE, related_name='units')
    title = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    order_index = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order_index']

    def __str__(self):
        return f'{self.title} (unit {self.order_index + 1})'


class ConceptNode(models.Model):
    """A single concept in a learning path — a node in the dependency graph."""
    STATUS_CHOICES = [('locked', 'Locked'), ('current', 'Current'), ('completed', 'Completed')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    path = models.ForeignKey(LearningPath, on_delete=models.CASCADE, related_name='concepts')
    unit = models.ForeignKey(Unit, on_delete=models.SET_NULL, null=True, blank=True, related_name='concepts')
    title = models.CharField(max_length=300)
    description = models.TextField(blank=True, help_text='Why this concept matters + key explanation')
    source_resource = models.ForeignKey('library.Resource', on_delete=models.SET_NULL, null=True, blank=True, related_name='concept_nodes')
    source_page = models.IntegerField(null=True, blank=True, help_text='Page number in source material')
    source_section = models.CharField(max_length=200, blank=True, help_text='Section title in source material')
    order_index = models.IntegerField(default=0)
    prerequisites = models.ManyToManyField('self', symmetrical=False, blank=True, related_name='unlocks')
    mastery = models.IntegerField(default=0, help_text='0-100 mastery score')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='locked')
    xp_earned = models.IntegerField(default=0)
    difficulty = models.CharField(max_length=20, choices=[('easy', 'Easy'), ('medium', 'Medium'), ('hard', 'Hard')], default='medium')
    estimated_minutes = models.IntegerField(default=15, help_text='Estimated study time in minutes')
    key_definitions = models.JSONField(default=list, blank=True, help_text='List of key terms/definitions')
    summary = models.TextField(blank=True, help_text='One-paragraph AI summary of the concept')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order_index']

    def __str__(self):
        return f'{self.title} ({self.get_status_display()})'


class ConceptReview(models.Model):
    """Spaced repetition review record for a concept — tracks retention curve."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    concept = models.ForeignKey(ConceptNode, on_delete=models.CASCADE, related_name='reviews')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='concept_reviews')
    ease_factor = models.FloatField(default=2.5, help_text='SM-2 ease factor (1.3-3.0)')
    interval_days = models.IntegerField(default=1, help_text='Days until next review')
    repetitions = models.IntegerField(default=0, help_text='Successful review count')
    last_reviewed = models.DateTimeField(null=True, blank=True)
    next_review = models.DateTimeField(null=True, blank=True, help_text='When this concept is due for review')
    last_score = models.IntegerField(default=0, help_text='Last quiz score 0-100')
    total_reviews = models.IntegerField(default=0)
    correct_reviews = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('concept', 'user')
        ordering = ['next_review']

    def __str__(self):
        return f'{self.concept.title} — next review: {self.next_review}'

    @property
    def retention_rate(self):
        if self.total_reviews == 0:
            return 0
        return int((self.correct_reviews / self.total_reviews) * 100)
