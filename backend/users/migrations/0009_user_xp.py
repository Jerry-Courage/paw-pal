from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0008_user_total_resources_created'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='xp',
            field=models.PositiveIntegerField(default=0, help_text='Total XP earned across all study path steps.'),
        ),
    ]
