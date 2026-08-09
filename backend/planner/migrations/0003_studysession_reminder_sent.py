from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('planner', '0002_studysession_recurrence_id_studysession_session_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='studysession',
            name='reminder_sent',
            field=models.BooleanField(default=False, help_text='True once push reminder has been sent'),
        ),
    ]
