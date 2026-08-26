from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('learning', '0005_encounter_attempt'),
    ]

    operations = [
        migrations.AlterField(
            model_name='encounterattempt',
            name='activity_type',
            field=models.CharField(
                choices=[
                    ('predict', 'Predict'), ('mcq', 'Multiple choice'),
                    ('scenario', 'Scenario'), ('short_answer', 'Short answer'),
                    ('reflection', 'Reflection'), ('comparison', 'Comparison'),
                    ('worked_example', 'Worked example'),
                ],
                max_length=30,
            ),
        ),
    ]
