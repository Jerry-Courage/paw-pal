from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workspace', '0004_workspacemessage_shared_assignment'),
    ]

    operations = [
        migrations.AddField(
            model_name='workspacemessage',
            name='audio_data',
            field=models.TextField(blank=True, null=True),
        ),
    ]
