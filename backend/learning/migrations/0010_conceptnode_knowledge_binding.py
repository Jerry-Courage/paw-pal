from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('learning', '0009_learning_artifacts_and_mastery')]
    operations = [migrations.AddField(model_name='conceptnode', name='knowledge_binding', field=models.JSONField(default=dict, blank=True))]
