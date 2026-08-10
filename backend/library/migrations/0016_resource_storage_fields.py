from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('library', '0015_resource_curriculum_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='resource',
            name='storage_backend',
            field=models.CharField(default='cloudinary', help_text='cloudinary or r2', max_length=20),
        ),
        migrations.AddField(
            model_name='resource',
            name='r2_key',
            field=models.CharField(blank=True, help_text='R2 object key for large files', max_length=500),
        ),
    ]
