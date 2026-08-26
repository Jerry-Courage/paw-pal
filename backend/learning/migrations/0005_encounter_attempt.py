import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('learning', '0004_reconcile_journey_schema'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='EncounterAttempt',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('activity_id', models.CharField(max_length=80)),
                ('activity_type', models.CharField(choices=[('predict', 'Predict'), ('mcq', 'Multiple choice'), ('short_answer', 'Short answer'), ('reflection', 'Reflection')], max_length=30)),
                ('stage', models.CharField(max_length=20)),
                ('response', models.JSONField(default=dict)),
                ('correct', models.BooleanField(blank=True, null=True)),
                ('score', models.PositiveSmallIntegerField(default=0)),
                ('feedback', models.CharField(blank=True, max_length=500)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('concept', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attempts', to='learning.conceptnode')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='encounter_attempts', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['created_at']},
        ),
        migrations.AddIndex(model_name='encounterattempt', index=models.Index(fields=['user', 'concept', 'created_at'], name='learning_en_user_id_8208b9_idx')),
    ]
