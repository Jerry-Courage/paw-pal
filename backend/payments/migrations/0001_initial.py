from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='PaymentTransaction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField()),
                ('reference', models.CharField(db_index=True, max_length=100, unique=True)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=10)),
                ('currency', models.CharField(default='USD', max_length=10)),
                ('status', models.CharField(choices=[('pending','Pending'),('success','Success'),('failed','Failed'),('abandoned','Abandoned')], db_index=True, default='pending', max_length=20)),
                ('plan', models.CharField(default='premium_monthly', max_length=50)),
                ('paystack_data', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='payment_transactions', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='PromoCode',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(db_index=True, max_length=30, unique=True)),
                ('description', models.CharField(blank=True, max_length=200)),
                ('discount_type', models.CharField(choices=[('free_days','Free Premium Days'),('percent_off','Percent Off')], default='free_days', max_length=20)),
                ('discount_value', models.IntegerField(help_text='Days of free premium (for free_days) or % off (for percent_off)')),
                ('max_uses', models.IntegerField(default=0, help_text='0 = unlimited')),
                ('times_used', models.IntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('expires_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='PromoRedemption',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('redeemed_at', models.DateTimeField(auto_now_add=True)),
                ('promo', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='redemptions', to='payments.promocode')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='promo_redemptions', to=settings.AUTH_USER_MODEL)),
            ],
            options={'unique_together': {('user', 'promo')}},
        ),
    ]
