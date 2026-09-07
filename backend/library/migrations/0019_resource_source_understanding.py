from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('library', '0018_sourcebookmark')]
    operations = [migrations.AddField(model_name='resource', name='source_understanding',
                                    field=models.JSONField(default=dict, blank=True))]
