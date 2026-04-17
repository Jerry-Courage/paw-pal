import os
import sys
import django

# Add current directory to path
sys.path.append(os.getcwd())

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.db import connection

def cleanup():
    with connection.cursor() as cursor:
        print("Dropping workspace tables...")
        # Get all tables starting with workspace_
        cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'workspace%';")
        tables = [row[0] for row in cursor.fetchall()]
        
        for table in tables:
            print(f"Dropping table {table}...")
            cursor.execute(f"DROP TABLE IF EXISTS {table} CASCADE;")
        
        print("Clearing migration history for 'workspace'...")
        cursor.execute("DELETE FROM django_migrations WHERE app='workspace';")
        
    print("Success. Migration state cleared.")

if __name__ == "__main__":
    cleanup()
