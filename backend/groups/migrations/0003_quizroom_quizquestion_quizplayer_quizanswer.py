from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import groups.models


class Migration(migrations.Migration):

    dependencies = [
        ('groups', '0002_groupdocument'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='QuizRoom',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('pin', models.CharField(default=groups.models._gen_pin, max_length=6, unique=True)),
                ('title', models.CharField(max_length=300)),
                ('status', models.CharField(choices=[('lobby', 'Lobby'), ('countdown', 'Countdown'), ('question', 'Question'), ('results', 'Results'), ('finished', 'Finished')], default='lobby', max_length=12)),
                ('current_q_idx', models.IntegerField(default=0)),
                ('time_per_q', models.IntegerField(default=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('host', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='hosted_quiz_rooms', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='QuizQuestion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order', models.IntegerField(default=0)),
                ('text', models.TextField()),
                ('opt_a', models.CharField(max_length=400)),
                ('opt_b', models.CharField(max_length=400)),
                ('opt_c', models.CharField(max_length=400)),
                ('opt_d', models.CharField(max_length=400)),
                ('correct', models.CharField(choices=[('A', 'A'), ('B', 'B'), ('C', 'C'), ('D', 'D')], max_length=1)),
                ('room', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='questions', to='groups.quizroom')),
            ],
            options={'ordering': ['order']},
        ),
        migrations.CreateModel(
            name='QuizPlayer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('score', models.IntegerField(default=0)),
                ('streak', models.IntegerField(default=0)),
                ('room', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='players', to='groups.quizroom')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='quiz_sessions', to=settings.AUTH_USER_MODEL)),
            ],
            options={'unique_together': {('room', 'user')}},
        ),
        migrations.CreateModel(
            name='QuizAnswer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('choice', models.CharField(max_length=1)),
                ('is_correct', models.BooleanField(default=False)),
                ('time_taken', models.FloatField(default=0)),
                ('points', models.IntegerField(default=0)),
                ('player', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='answers', to='groups.quizplayer')),
                ('question', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='answers', to='groups.quizquestion')),
            ],
            options={'unique_together': {('player', 'question')}},
        ),
    ]
