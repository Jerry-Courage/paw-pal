from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0011_user_total_assignments_created'),
    ]

    operations = [
        migrations.RunSQL(
            sql='ALTER TABLE users_user DROP COLUMN IF EXISTS notification_preferences;',
            reverse_sql='ALTER TABLE users_user ADD COLUMN notification_preferences JSONField DEFAULT \'{}\' NOT NULL;',
        ),
    ]
