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
        if self.total_concepts and self.concepts_completed == self.total_concepts:
            self.status = 'completed'
        self.save(update_fields=['total_concepts', 'concepts_completed', 'total_xp', 'status', 'updated_at'])


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


class EncounterAttempt(models.Model):
    """Server-evaluated evidence produced inside a Journey encounter."""
    ACTIVITY_CHOICES = [
        ('predict', 'Predict'), ('mcq', 'Multiple choice'),
        ('scenario', 'Scenario'), ('short_answer', 'Short answer'),
        ('reflection', 'Reflection'), ('comparison', 'Comparison'),
        ('worked_example', 'Worked example'), ('ordering', 'Ordering'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='encounter_attempts')
    concept = models.ForeignKey(ConceptNode, on_delete=models.CASCADE, related_name='attempts')
    activity_id = models.CharField(max_length=80)
    activity_type = models.CharField(max_length=30, choices=ACTIVITY_CHOICES)
    stage = models.CharField(max_length=20)
    response = models.JSONField(default=dict)
    correct = models.BooleanField(null=True, blank=True)
    score = models.PositiveSmallIntegerField(default=0)
    feedback = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        indexes = [models.Index(fields=['user', 'concept', 'created_at'], name='learning_en_user_id_8208b9_idx')]


class TeachingSession(models.Model):
    STATUS_CHOICES = [
        ('not_started', 'Not started'), ('teaching', 'Teaching'), ('paused', 'Paused'),
        ('remediation', 'Remediation'), ('practicing', 'Practicing'),
        ('mastery_check', 'Mastery check'), ('completed', 'Completed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='teaching_sessions')
    concept = models.ForeignKey(ConceptNode, on_delete=models.CASCADE, related_name='teaching_sessions')
    status = models.CharField(max_length=24, choices=STATUS_CHOICES, default='not_started')
    current_point = models.PositiveSmallIntegerField(default=0)
    resume_point = models.PositiveSmallIntegerField(default=0)
    objectives = models.JSONField(default=list)
    objectives_covered = models.JSONField(default=list)
    objectives_understood = models.JSONField(default=list)
    unresolved_misconceptions = models.JSONField(default=list)
    state = models.JSONField(default=dict)
    conversation_summary = models.TextField(blank=True)
    mastery = models.PositiveSmallIntegerField(default=0)
    started_at = models.DateTimeField(auto_now_add=True)
    last_active_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'concept'], name='unique_user_concept_teaching_session')]


class TeachingTurn(models.Model):
    ROLE_CHOICES = [('flow', 'Flow'), ('learner', 'Learner'), ('system', 'System')]
    KIND_CHOICES = [('message', 'Message'), ('activity', 'Activity'), ('video', 'Video'), ('flashcards', 'Flashcards'), ('voice', 'Voice'), ('completion', 'Completion')]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(TeachingSession, on_delete=models.CASCADE, related_name='turns')
    role = models.CharField(max_length=12, choices=ROLE_CHOICES)
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default='message')
    content = models.TextField(blank=True)
    payload = models.JSONField(default=dict, blank=True)
    idempotency_key = models.CharField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']
        constraints = [models.UniqueConstraint(fields=['session', 'idempotency_key'], condition=~models.Q(idempotency_key=''), name='unique_teaching_turn_idempotency')]
