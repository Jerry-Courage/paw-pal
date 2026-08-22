from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('groups', '0003_quizroom_quizquestion_quizplayer_quizanswer'),
    ]

    operations = [
        migrations.AddField(
            model_name='quizquestion',
            name='explanation',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='quizplayer',
            name='ready',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='quizplayer',
            name='correct_count',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='quizplayer',
            name='total_time',
            field=models.FloatField(default=0),
        ),
        migrations.CreateModel(
            name='BattleHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('score', models.IntegerField(default=0)),
                ('rank', models.IntegerField(default=0)),
                ('correct_count', models.IntegerField(default=0)),
                ('total_questions', models.IntegerField(default=0)),
                ('best_streak', models.IntegerField(default=0)),
                ('avg_time', models.FloatField(default=0)),
                ('xp_earned', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('room', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='history_entries', to='groups.quizroom')),
                ('player', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='battle_history', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
