#!/usr/bin/env bash
set -o errexit

# Run database migrations with verbose output to catch any issues
echo "Running database migrations..."
python manage.py migrate --noinput --verbosity 2

# Verify the ResourceProgress table exists
python -c "
from django.db import connection
cursor = connection.cursor()
cursor.execute(\"SELECT 1 FROM information_schema.tables WHERE table_name='library_resourceprogress' LIMIT 1\")
if cursor.fetchone():
    print('✓ ResourceProgress table exists')
else:
    print('✗ ResourceProgress table NOT found - migrations may have failed')
" || true

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
