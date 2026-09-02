import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('learning', '0008_teaching_session'), ('library', '0018_sourcebookmark'), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(
            name='LearningArtifact',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('artifact_type', models.CharField(choices=[('flashcard','Flashcard'),('note','Note'),('podcast','Podcast'),('video_reference','Video reference'),('saved_example','Saved example'),('saved_diagram','Saved diagram'),('feynman_result','Feynman result'),('mastery_result','Mastery result')], max_length=32)),
                ('title', models.CharField(max_length=300)), ('content', models.JSONField(default=dict)), ('provenance', models.JSONField(default=dict)),
                ('external_object_type', models.CharField(blank=True, max_length=40)), ('external_object_id', models.CharField(blank=True, max_length=80)), ('created_at', models.DateTimeField(auto_now_add=True)),
                ('concept', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='artifacts', to='learning.conceptnode')),
                ('path', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='artifacts', to='learning.learningpath')),
                ('resource', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='journey_artifacts', to='library.resource')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='learning_artifacts', to=settings.AUTH_USER_MODEL)),
            ], options={'ordering':['-created_at']},
        ),
        migrations.CreateModel(
            name='JourneyMasteryAttempt',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)), ('idempotency_key', models.CharField(max_length=80)),
                ('challenges', models.JSONField(default=list)), ('responses', models.JSONField(default=list)), ('objective_results', models.JSONField(default=list)),
                ('score', models.PositiveSmallIntegerField(default=0)), ('passed', models.BooleanField(default=False)), ('review_objective_ids', models.JSONField(default=list)), ('created_at', models.DateTimeField(auto_now_add=True)),
                ('path', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='mastery_attempts', to='learning.learningpath')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='journey_mastery_attempts', to=settings.AUTH_USER_MODEL)),
            ], options={'ordering':['-created_at']},
        ),
        migrations.AddIndex(model_name='learningartifact', index=models.Index(fields=['user','artifact_type','created_at'], name='learning_art_user_ty_idx')),
        migrations.AddConstraint(model_name='learningartifact', constraint=models.UniqueConstraint(condition=~models.Q(external_object_id=''), fields=('user','external_object_type','external_object_id'), name='unique_saved_external_artifact')),
        migrations.AddConstraint(model_name='journeymasteryattempt', constraint=models.UniqueConstraint(fields=('user','path','idempotency_key'), name='unique_journey_mastery_submission')),
    ]
