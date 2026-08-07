from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ai_assistant', '0003_change_image_to_textfield'),
    ]

    operations = [
        migrations.AlterField(
            model_name='chatsession',
            name='context_type',
            field=models.CharField(
                choices=[
                    ('global', 'Global'),
                    ('resource', 'Resource'),
                    ('group', 'Group'),
                    ('voice_tutor', 'Voice Tutor'),
                ],
                default='global',
                max_length=20,
            ),
        ),
    ]
