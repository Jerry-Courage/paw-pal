import os
import sys
import django
from django.db import connection

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

def check():
    with connection.cursor() as cursor:
        cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'workspace%';")
        tables = [row[0] for row in cursor.fetchall()]
        print(f"Workspace tables found: {tables}")
        
        cursor.execute("SELECT name, applied FROM django_migrations WHERE app='workspace';")
        migrations = cursor.fetchall()
        print(f"Workspace migrations in DB: {migrations}")

if __name__ == "__main__":
    check()
