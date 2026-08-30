from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('ai_assistant', '0005_chatmessage_flow_objects')]
    operations = [migrations.AddField(model_name='chatsession', name='state', field=models.JSONField(blank=True, default=dict))]
