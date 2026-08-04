from django.db import models
from django.conf import settings


class StudyGroup(models.Model):
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    cover_image = models.ImageField(upload_to='groups/', null=True, blank=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='owned_groups')
    members = models.ManyToManyField(settings.AUTH_USER_MODEL, through='GroupMembership', related_name='study_groups')
    is_public = models.BooleanField(default=True)
    is_verified = models.BooleanField(default=False)
    subject = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    @property
    def member_count(self):
        return self.memberships.count()


class GroupMembership(models.Model):
    ROLE_CHOICES = [('member', 'Member'), ('moderator', 'Moderator'), ('admin', 'Admin')]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    group = models.ForeignKey(StudyGroup, on_delete=models.CASCADE, related_name='memberships')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='member')
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'group')


class GroupSession(models.Model):
    group = models.ForeignKey(StudyGroup, on_delete=models.CASCADE, related_name='sessions')
    title = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    scheduled_at = models.DateTimeField()
    duration_minutes = models.IntegerField(default=60)
    is_active = models.BooleanField(default=False)
    attendees = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='attending_sessions')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['scheduled_at']



class GroupTask(models.Model):
    group = models.ForeignKey(StudyGroup, on_delete=models.CASCADE, related_name='tasks')
    title = models.CharField(max_length=300)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='group_tasks'
    )
    is_completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)


class GroupMessage(models.Model):
    group = models.ForeignKey(StudyGroup, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    content = models.TextField()
    is_ai = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']


class GroupDocument(models.Model):
    """Shared collaborative document within a study group."""
    group = models.ForeignKey(StudyGroup, on_delete=models.CASCADE, related_name='documents')
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name='group_documents'
    )
    title = models.CharField(max_length=300)
    content = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return f'{self.group.name} — {self.title}'


import uuid as _uuid
import random as _random
import string as _string


def _gen_pin():
    return ''.join(_random.choices(_string.digits, k=6))


class QuizRoom(models.Model):
    STATUS_CHOICES = [
        ('lobby',    'Lobby'),
        ('countdown','Countdown'),
        ('question', 'Question'),
        ('results',  'Results'),
        ('finished', 'Finished'),
    ]
    pin           = models.CharField(max_length=6, unique=True, default=_gen_pin)
    title         = models.CharField(max_length=300)
    host          = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='hosted_quiz_rooms')
    status        = models.CharField(max_length=12, choices=STATUS_CHOICES, default='lobby')
    current_q_idx = models.IntegerField(default=0)
    time_per_q    = models.IntegerField(default=20)   # seconds per question
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.title} [{self.pin}]'


class QuizQuestion(models.Model):
    room    = models.ForeignKey(QuizRoom, on_delete=models.CASCADE, related_name='questions')
    order   = models.IntegerField(default=0)
    text    = models.TextField()
    opt_a   = models.CharField(max_length=400)
    opt_b   = models.CharField(max_length=400)
    opt_c   = models.CharField(max_length=400)
    opt_d   = models.CharField(max_length=400)
    correct = models.CharField(max_length=1, choices=[('A','A'),('B','B'),('C','C'),('D','D')])

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f'Q{self.order}: {self.text[:60]}'


class QuizPlayer(models.Model):
    room   = models.ForeignKey(QuizRoom, on_delete=models.CASCADE, related_name='players')
    user   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='quiz_sessions')
    score  = models.IntegerField(default=0)
    streak = models.IntegerField(default=0)   # consecutive correct answers

    class Meta:
        unique_together = ('room', 'user')

    def __str__(self):
        return f'{self.user.username} in {self.room.pin}'


class QuizAnswer(models.Model):
    """One answer per player per question."""
    player      = models.ForeignKey(QuizPlayer, on_delete=models.CASCADE, related_name='answers')
    question    = models.ForeignKey(QuizQuestion, on_delete=models.CASCADE, related_name='answers')
    choice      = models.CharField(max_length=1)
    is_correct  = models.BooleanField(default=False)
    time_taken  = models.FloatField(default=0)   # seconds
    points      = models.IntegerField(default=0)

    class Meta:
        unique_together = ('player', 'question')
