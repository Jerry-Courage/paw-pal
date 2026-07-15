"""
WSGI config for core project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/
"""

import os
import sys
from django.core.wsgi import get_wsgi_application

# Add the backend directory to sys.path so Vercel can find 'core'
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

application = get_wsgi_application()
app = application

# Database Integrity Check & Programmatic Migration Runner
try:
    from django.db import connection
    from django.core.management import call_command
    
    cursor = connection.cursor()
    cursor.execute("SELECT 1 FROM information_schema.tables WHERE table_name='library_resourceprogress' LIMIT 1")
    table_exists = bool(cursor.fetchone())
    if not table_exists:
        cursor.execute("SELECT 1 FROM django_migrations WHERE app='library' AND name='0013_resourceprogress' LIMIT 1")
        applied = bool(cursor.fetchone())
        if applied:
            print("Auto-Healing Database (WSGI): library_resourceprogress table is missing but migration 0013 is marked as applied. Clearing record...")
            cursor.execute("DELETE FROM django_migrations WHERE app='library' AND name='0013_resourceprogress'")
            print("Migration record cleared.")
            
    print("Core WSGI: Running migrations...")
    call_command("migrate", no_input=True, verbosity=1)
    print("Core WSGI: Migrations completed.")
except Exception as e:
    print(f"Core WSGI Integrity/Migration Check Skipped: {e}")
