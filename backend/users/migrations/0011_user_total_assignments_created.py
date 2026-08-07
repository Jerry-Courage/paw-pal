from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0010_user_education_level'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='total_assignments_created',
            field=models.PositiveIntegerField(
                default=0,
                help_text='Lifetime count of assignments created. Used for free tier gating (3 free trials).',
            ),
        ),
    ]
