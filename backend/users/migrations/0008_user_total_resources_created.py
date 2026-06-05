from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0007_user_subscription_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='total_resources_created',
            field=models.PositiveIntegerField(
                default=0,
                help_text='Lifetime count of resources created. Never decremented on delete — used for free tier gating.'
            ),
        ),
    ]
