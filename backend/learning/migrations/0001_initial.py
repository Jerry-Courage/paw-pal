import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('library', '0017_add_section_progress_tracking'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='LearningPath',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=300)),
                ('description', models.TextField(blank=True)),
                ('subject', models.CharField(blank=True, max_length=200)),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('active', 'Active'), ('paused', 'Paused'), ('completed', 'Completed')], default='draft', max_length=20)),
                ('deadline', models.DateTimeField(blank=True, null=True)),
                ('total_xp', models.IntegerField(default=0)),
                ('concepts_completed', models.IntegerField(default=0)),
                ('total_concepts', models.IntegerField(default=0)),
                ('daily_review_goal', models.IntegerField(default=10, help_text='Concepts to review per day')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='learning_paths', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-updated_at'],
            },
        ),
        migrations.CreateModel(
            name='ConceptNode',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=300)),
                ('description', models.TextField(blank=True)),
                ('source_page', models.IntegerField(blank=True, null=True)),
                ('source_section', models.CharField(blank=True, max_length=200)),
                ('order_index', models.IntegerField(default=0)),
                ('mastery', models.IntegerField(default=0)),
                ('status', models.CharField(choices=[('locked', 'Locked'), ('current', 'Current'), ('completed', 'Completed')], default='locked', max_length=20)),
                ('xp_earned', models.IntegerField(default=0)),
                ('difficulty', models.CharField(choices=[('easy', 'Easy'), ('medium', 'Medium'), ('hard', 'Hard')], default='medium', max_length=20)),
                ('estimated_minutes', models.IntegerField(default=15)),
                ('key_definitions', models.JSONField(blank=True, default=list)),
                ('summary', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('path', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='concepts', to='learning.learningpath')),
                ('prerequisites', models.ManyToManyField(blank=True, related_name='unlocks', to='learning.conceptnode')),
                ('source_resource', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='concept_nodes', to='library.resource')),
            ],
            options={
                'ordering': ['order_index'],
            },
        ),
        migrations.CreateModel(
            name='ConceptReview',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('ease_factor', models.FloatField(default=2.5)),
                ('interval_days', models.IntegerField(default=1)),
                ('repetitions', models.IntegerField(default=0)),
                ('last_reviewed', models.DateTimeField(blank=True, null=True)),
                ('next_review', models.DateTimeField(blank=True, null=True)),
                ('last_score', models.IntegerField(default=0)),
                ('total_reviews', models.IntegerField(default=0)),
                ('correct_reviews', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('concept', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reviews', to='learning.conceptnode')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='concept_reviews', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['next_review'],
                'unique_together': {('concept', 'user')},
            },
        ),
    ]
