from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('library', '0016_resource_storage_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='resourceprogress',
            name='completed_sections',
            field=models.JSONField(blank=True, default=list,
                help_text='List of section indices (ints) the user has completed in study mode.'),
        ),
        migrations.AddField(
            model_name='resourceprogress',
            name='current_section',
            field=models.IntegerField(default=0,
                help_text='Last section index the user was on in study mode.'),
        ),
    ]
