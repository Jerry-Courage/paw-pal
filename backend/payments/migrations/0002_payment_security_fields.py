from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('payments', '0001_initial')]
    operations = [
        migrations.AlterField(model_name='paymenttransaction', name='currency', field=models.CharField(default='GHS', max_length=10)),
        migrations.AlterField(model_name='paymenttransaction', name='status', field=models.CharField(choices=[('initialized','Initialized'),('pending','Pending'),('success','Success'),('failed','Failed'),('abandoned','Abandoned'),('reversed','Reversed'),('refunded','Refunded')], db_index=True, default='pending', max_length=20)),
        migrations.AddField(model_name='paymenttransaction', name='expected_amount_minor', field=models.PositiveBigIntegerField(default=0)),
        migrations.AddField(model_name='paymenttransaction', name='paid_amount_minor', field=models.PositiveBigIntegerField(blank=True, null=True)),
        migrations.AddField(model_name='paymenttransaction', name='provider_transaction_id', field=models.CharField(blank=True, max_length=100)),
        migrations.AddField(model_name='paymenttransaction', name='channel', field=models.CharField(blank=True, max_length=40)),
        migrations.AddField(model_name='paymenttransaction', name='card_brand', field=models.CharField(blank=True, max_length=40)),
        migrations.AddField(model_name='paymenttransaction', name='card_last4', field=models.CharField(blank=True, max_length=4)),
        migrations.AddField(model_name='paymenttransaction', name='failure_reason', field=models.CharField(blank=True, max_length=255)),
        migrations.AddField(model_name='paymenttransaction', name='initialization_key', field=models.CharField(blank=True, db_index=True, max_length=100)),
        migrations.AddField(model_name='paymenttransaction', name='promo_code', field=models.CharField(blank=True, max_length=30)),
        migrations.AddField(model_name='paymenttransaction', name='paid_at', field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name='paymenttransaction', name='fulfilled_at', field=models.DateTimeField(blank=True, null=True)),
    ]
