import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0012_drop_notification_preferences_column'),
    ]

    operations = [
        migrations.CreateModel(
            name='Feedback',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('rating', models.IntegerField(default=5)),
                ('feedback_text', models.TextField()),
                ('is_testimonial', models.BooleanField(default=False)),
                ('display_name', models.CharField(blank=True, max_length=120, help_text="Name shown publicly if approved as a testimonial. Empty falls back to the user's full name.")),
                ('is_approved', models.BooleanField(default=False, help_text='Approved testimonials are shown publicly on the landing page.')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='feedbacks', to='users.user')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]