import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Adds Unit model, goal/depth fields to LearningPath, unit FK to ConceptNode.
    All additive — safe for Render auto-deploy.
    """

    dependencies = [
        ('learning', '0002_add_start_date_deadline'),
    ]

    operations = [
        # Add goal and depth fields to LearningPath
        migrations.AddField(
            model_name='learningpath',
            name='goal',
            field=models.CharField(blank=True, help_text='What the user wants to master', max_length=300),
        ),
        migrations.AddField(
            model_name='learningpath',
            name='depth',
            field=models.CharField(
                choices=[('quick', 'Quick'), ('standard', 'Standard'), ('deep', 'Deep')],
                default='standard',
                max_length=20,
            ),
        ),
        # Create Unit model
        migrations.CreateModel(
            name='Unit',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=300)),
                ('description', models.TextField(blank=True)),
                ('order_index', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('path', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='units',
                    to='learning.learningpath',
                )),
            ],
            options={
                'ordering': ['order_index'],
            },
        ),
        # Add unit FK to ConceptNode
        migrations.AddField(
            model_name='conceptnode',
            name='unit',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='concepts',
                to='learning.unit',
            ),
        ),
    ]
