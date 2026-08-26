import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('learning', '0007_add_ordering_activity_type'), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(
            name='TeachingSession',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('status', models.CharField(choices=[('not_started','Not started'),('teaching','Teaching'),('paused','Paused'),('remediation','Remediation'),('practicing','Practicing'),('mastery_check','Mastery check'),('completed','Completed')], default='not_started', max_length=24)),
                ('current_point', models.PositiveSmallIntegerField(default=0)), ('resume_point', models.PositiveSmallIntegerField(default=0)),
                ('objectives', models.JSONField(default=list)), ('objectives_covered', models.JSONField(default=list)),
                ('objectives_understood', models.JSONField(default=list)), ('unresolved_misconceptions', models.JSONField(default=list)),
                ('state', models.JSONField(default=dict)), ('conversation_summary', models.TextField(blank=True)),
                ('mastery', models.PositiveSmallIntegerField(default=0)), ('started_at', models.DateTimeField(auto_now_add=True)),
                ('last_active_at', models.DateTimeField(auto_now=True)), ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('concept', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='teaching_sessions', to='learning.conceptnode')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='teaching_sessions', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='TeachingTurn',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('role', models.CharField(choices=[('flow','Flow'),('learner','Learner'),('system','System')], max_length=12)),
                ('kind', models.CharField(choices=[('message','Message'),('activity','Activity'),('video','Video'),('flashcards','Flashcards'),('voice','Voice'),('completion','Completion')], default='message', max_length=16)),
                ('content', models.TextField(blank=True)), ('payload', models.JSONField(blank=True, default=dict)),
                ('idempotency_key', models.CharField(blank=True, max_length=80)), ('created_at', models.DateTimeField(auto_now_add=True)),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='turns', to='learning.teachingsession')),
            ], options={'ordering':['created_at']}),
        migrations.AddConstraint(model_name='teachingsession', constraint=models.UniqueConstraint(fields=('user','concept'), name='unique_user_concept_teaching_session')),
        migrations.AddConstraint(model_name='teachingturn', constraint=models.UniqueConstraint(condition=~models.Q(idempotency_key=''), fields=('session','idempotency_key'), name='unique_teaching_turn_idempotency')),
    ]
