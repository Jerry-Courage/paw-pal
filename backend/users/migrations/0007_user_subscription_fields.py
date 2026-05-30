from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0006_globalconfig'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='is_premium',
            field=models.BooleanField(default=False, db_index=True),
        ),
        migrations.AddField(
            model_name='user',
            name='subscription_expires_at',
            field=models.DateTimeField(null=True, blank=True),
        ),
        migrations.AddField(
            model_name='user',
            name='paystack_customer_code',
            field=models.CharField(max_length=100, blank=True),
        ),
    ]
