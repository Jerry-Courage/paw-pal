from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('library', '0011_flashcard_is_public_quiz_is_public'),
    ]

    operations = [
        migrations.AddField(
            model_name='resource',
            name='selected_features',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
