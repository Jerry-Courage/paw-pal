from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('library', '0012_resource_selected_features'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ResourceProgress',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('completed_steps', models.JSONField(default=dict)),
                ('step_scores', models.JSONField(default=dict)),
                ('xp_earned', models.IntegerField(default=0)),
                ('mastery', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='resource_progress',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('resource', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='progress',
                    to='library.resource',
                )),
            ],
            options={
                'ordering': ['-updated_at'],
                'unique_together': {('user', 'resource')},
            },
        ),
    ]
