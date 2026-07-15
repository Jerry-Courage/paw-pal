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
python manage.py migrate --noinput --verbosity 2

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
