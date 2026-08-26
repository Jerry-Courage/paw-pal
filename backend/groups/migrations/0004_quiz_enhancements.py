from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def ensure_quiz_enhancement_schema(apps, schema_editor):
    """Apply the 0004 schema safely when a prior startup repair created part of it."""
    connection = schema_editor.connection
    QuizQuestion = apps.get_model('groups', 'QuizQuestion')
    QuizPlayer = apps.get_model('groups', 'QuizPlayer')
    BattleHistory = apps.get_model('groups', 'BattleHistory')

    def tables():
        return set(connection.introspection.table_names())

    def columns(table_name):
        with connection.cursor() as cursor:
            return {
                column.name
                for column in connection.introspection.get_table_description(cursor, table_name)
            }

    for model, field_names in (
        (QuizQuestion, ('explanation',)),
        (QuizPlayer, ('ready', 'correct_count', 'total_time')),
    ):
        existing = columns(model._meta.db_table)
        for field_name in field_names:
            field = model._meta.get_field(field_name)
            if field.column not in existing:
                schema_editor.add_field(model, field)

    if BattleHistory._meta.db_table not in tables():
        schema_editor.create_model(BattleHistory)


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('groups', '0003_quizroom_quizquestion_quizplayer_quizanswer'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AddField(model_name='quizquestion', name='explanation', field=models.TextField(blank=True, default='')),
                migrations.AddField(model_name='quizplayer', name='ready', field=models.BooleanField(default=False)),
                migrations.AddField(model_name='quizplayer', name='correct_count', field=models.IntegerField(default=0)),
                migrations.AddField(model_name='quizplayer', name='total_time', field=models.FloatField(default=0)),
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
                    options={'ordering': ['-created_at']},
                ),
            ],
        ),
        migrations.RunPython(ensure_quiz_enhancement_schema, migrations.RunPython.noop),
    ]
