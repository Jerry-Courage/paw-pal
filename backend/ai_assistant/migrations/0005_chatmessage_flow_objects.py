from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('ai_assistant', '0004_add_voice_tutor_context_type')]

    operations = [
        migrations.AddField(
            model_name='chatmessage',
            name='flow_objects',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
