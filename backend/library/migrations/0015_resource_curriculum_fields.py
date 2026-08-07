from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('library', '0014_alter_resource_author_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='resource',
            name='curriculum_topic_id',
            field=models.CharField(blank=True, db_index=True, max_length=100, help_text='Curriculum topic ID (e.g. bio-cell, algebra)'),
        ),
        migrations.AddField(
            model_name='resource',
            name='curriculum_year',
            field=models.CharField(blank=True, max_length=10, help_text='SHS year: shs1, shs2, shs3'),
        ),
        migrations.AddField(
            model_name='resource',
            name='curriculum_subject',
            field=models.CharField(blank=True, max_length=100, help_text='Curriculum subject ID (e.g. core-math, physics)'),
        ),
    ]
