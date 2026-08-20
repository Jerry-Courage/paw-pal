from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Standalone fix: add start_date and deadline columns that were missed
    because 0001_initial had a dependency on library.0017 which may not have
    existed on the Render database at deploy time.
    """

    dependencies = [
        ('learning', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='learningpath',
            name='start_date',
            field=models.DateTimeField(blank=True, help_text='When to start studying', null=True),
        ),
        migrations.AddField(
            model_name='learningpath',
            name='deadline',
            field=models.DateTimeField(blank=True, help_text='When the exam/goal is due', null=True),
        ),
    ]
