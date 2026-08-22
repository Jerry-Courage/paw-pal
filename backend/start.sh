#!/usr/bin/env bash
set -o errexit

# Auto-Heal: check if migrations table is desynced with actual tables
echo "Running database integrity checks..."
python -c "
import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()
from django.db import connection
try:
    cursor = connection.cursor()
    cursor.execute(\"SELECT 1 FROM information_schema.tables WHERE table_name='library_resourceprogress' LIMIT 1\")
    table_exists = bool(cursor.fetchone())
    if not table_exists:
        cursor.execute(\"SELECT 1 FROM django_migrations WHERE app='library' AND name='0013_resourceprogress' LIMIT 1\")
        applied = bool(cursor.fetchone())
        if applied:
            print('Auto-Healing Database: library_resourceprogress table is missing but migration 0013 is marked as applied. Clearing migration record...')
            cursor.execute(\"DELETE FROM django_migrations WHERE app='library' AND name='0013_resourceprogress'\")
            print('Migration record cleared successfully.')
except Exception as e:
    print(f'Database auto-heal check skipped: {e}')
" || true

# Run database migrations
echo "Running database migrations..."
python manage.py migrate --noinput --verbosity 2 || echo "WARNING: migrate failed, attempting column-level fix..."

# Fallback: ensure quiz battle columns exist (handles migration desync)
python -c "
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()
from django.db import connection
cursor = connection.cursor()

# Check and add missing columns to groups_quizplayer
for col, typedef in [
    ('ready', 'BOOLEAN DEFAULT FALSE NOT NULL'),
    ('correct_count', 'INTEGER DEFAULT 0 NOT NULL'),
    ('total_time', 'DOUBLE PRECISION DEFAULT 0 NOT NULL'),
]:
    cursor.execute(\"SELECT 1 FROM information_schema.columns WHERE table_name='groups_quizplayer' AND column_name=%s\", [col])
    if not cursor.fetchone():
        print(f'Adding missing column groups_quizplayer.{col}')
        cursor.execute(f'ALTER TABLE groups_quizplayer ADD COLUMN {col} {typedef}')

for col, typedef in [
    ('explanation', \"TEXT DEFAULT '' NOT NULL\"),
]:
    cursor.execute(\"SELECT 1 FROM information_schema.columns WHERE table_name='groups_quizquestion' AND column_name=%s\", [col])
    if not cursor.fetchone():
        print(f'Adding missing column groups_quizquestion.{col}')
        cursor.execute(f'ALTER TABLE groups_quizquestion ADD COLUMN {col} {typedef}')

# Check and create groups_battlehistory table
cursor.execute(\"SELECT 1 FROM information_schema.tables WHERE table_name='groups_battlehistory' LIMIT 1\")
if not cursor.fetchone():
    print('Creating missing table groups_battlehistory')
    cursor.execute('''
        CREATE TABLE groups_battlehistory (
            id BIGSERIAL PRIMARY KEY,
            score INTEGER DEFAULT 0 NOT NULL,
            \"rank\" INTEGER DEFAULT 0 NOT NULL,
            correct_count INTEGER DEFAULT 0 NOT NULL,
            total_questions INTEGER DEFAULT 0 NOT NULL,
            best_streak INTEGER DEFAULT 0 NOT NULL,
            avg_time DOUBLE PRECISION DEFAULT 0 NOT NULL,
            xp_earned INTEGER DEFAULT 0 NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
            room_id INTEGER REFERENCES groups_quizroom(id) ON DELETE SET NULL,
            player_id INTEGER REFERENCES users_user(id) ON DELETE CASCADE
        )
    ''')

# Ensure the migration record exists so Django doesn't try to re-apply
cursor.execute(\"SELECT 1 FROM django_migrations WHERE app='groups' AND name='0004_quiz_enhancements' LIMIT 1\")
if not cursor.fetchone():
    cursor.execute(\"INSERT INTO django_migrations (app, name, applied) VALUES ('groups', '0004_quiz_enhancements', NOW())\")
    print('Inserted migration record for 0004_quiz_enhancements')

print('Quiz battle DB check complete')
" || echo "Quiz battle column fix skipped (table may not exist yet)"

# Verify the ResourceProgress table exists
python -c "
from django.db import connection
cursor = connection.cursor()
cursor.execute(\"SELECT 1 FROM information_schema.tables WHERE table_name='library_resourceprogress' LIMIT 1\")
if cursor.fetchone():
    print('ResourceProgress table exists')
else:
    print('ResourceProgress table NOT found - migrations may have failed')
" || true

# One-time cleanup: delete stuck processing resources
# Set CLEAR_PROCESSING=true in Render env vars to trigger, then remove it after
if [ "$CLEAR_PROCESSING" = "true" ]; then
    echo "Clearing stuck processing resources..."
    python manage.py clear_processing
fi

# Create superuser from env vars (one-time, safe to repeat)
python manage.py shell << 'PYEOF'
import os
from django.contrib.auth import get_user_model
User = get_user_model()
email = os.getenv('ADMIN_EMAIL', '')
username = os.getenv('ADMIN_USERNAME', 'admin')
password = os.getenv('ADMIN_PASSWORD', '')
if email and password:
    if not User.objects.filter(email=email).exists():
        User.objects.create_superuser(email=email, username=username, password=password)
        print(f'Superuser created: {email}')
    else:
        print(f'Superuser already exists: {email}')
PYEOF

# Start the ASGI server
echo "Starting ASGI server..."
exec daphne -b 0.0.0.0 -p $PORT core.asgi:application
