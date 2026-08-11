from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0011_user_total_assignments_created'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='notification_preferences',
            field=models.JSONField(
                blank=True,
                default=dict,
                help_text='Per-type notification toggle preferences.',
            ),
        ),
    ]
