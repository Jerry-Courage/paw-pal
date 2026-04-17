import os
import sys
import django
from django.db import connection

sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

def test_query():
    from workspace.models import Workspace
    try:
        count = Workspace.objects.count()
        print(f"Workspace count: {count}")
    except Exception as e:
        print(f"Query failed: {e}")

if __name__ == "__main__":
    test_query()
