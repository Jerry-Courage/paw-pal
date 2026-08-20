from django.db import migrations, models


def add_columns_if_missing(apps, schema_editor):
    """Add start_date and deadline columns only if they don't exist."""
    with schema_editor.connection.cursor() as cursor:
        # Check which columns exist
        cursor.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'learning_learningpath'
        """)
        existing = {row[0] for row in cursor.fetchall()

        if 'start_date' not in existing:
            cursor.execute(
                'ALTER TABLE learning_learningpath ADD COLUMN start_date timestamp with time zone NULL'
            )
            print('  Added start_date column')

        if 'deadline' not in existing:
            cursor.execute(
                'ALTER TABLE learning_learningpath ADD COLUMN deadline timestamp with time zone NULL'
            )
            print('  Added deadline column')


def reverse(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("ALTER TABLE learning_learningpath DROP COLUMN IF EXISTS start_date")
        cursor.execute("ALTER TABLE learning_learningpath DROP COLUMN IF EXISTS deadline")


class Migration(migrations.Migration):
    """
    Safe migration: adds start_date + deadline columns using raw SQL
    so it works regardless of whether 0001_initial was applied.
    """

    dependencies = [
        ('learning', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(add_columns_if_missing, reverse),
    ]
