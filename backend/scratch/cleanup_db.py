import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

def cleanup():
    with connection.cursor() as cursor:
        print("Dropping workspace tables...")
        cursor.execute("DROP TABLE IF EXISTS workspace_workspacemessage CASCADE;")
        cursor.execute("DROP TABLE IF EXISTS workspace_workspacemember CASCADE;")
        cursor.execute("DROP TABLE IF EXISTS workspace_workspace_resources CASCADE;")
        cursor.execute("DROP TABLE IF EXISTS workspace_workspace CASCADE;")
        
        print("Clearing migration history for 'workspace'...")
        cursor.execute("DELETE FROM django_migrations WHERE app='workspace';")
        
        print("Fixing any other potential conflicts...")
        # Add 'pinned_resource_id' to existing table if it somehow survived (unlikely with CASCADE)
        
    print("Success. Run 'python manage.py migrate' now.")

if __name__ == "__main__":
    cleanup()
