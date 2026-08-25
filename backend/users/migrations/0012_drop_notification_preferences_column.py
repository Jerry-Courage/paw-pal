from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0011_user_total_assignments_created'),
    ]

    operations = [
        migrations.RunSQL(
            sql='ALTER TABLE users_user DROP COLUMN IF EXISTS notification_preferences;',
            reverse_sql='ALTER TABLE users_user ADD COLUMN notification_preferences jsonb DEFAULT \'{}\' NOT NULL;',
        ),
    ]

    def apply(self, project_state, schema_editor, collect_sql=False):
        """Skip on SQLite (test DB) — column may not exist."""
        if schema_editor.connection.vendor == 'sqlite':
            return project_state
        return super().apply(project_state, schema_editor, collect_sql)
