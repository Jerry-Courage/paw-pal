import os
import sys
import io
import django
from django.utils import timezone
from datetime import timedelta

# Fix for emojis in Windows terminal
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from library.models import Resource
from django_q.models import Task, Success, Failure

def run_audit():
    try:
        print(f"--- [Live Audit: {timezone.now()}] ---")
        
        print("\n[LATEST RESOURCES]")
        resources = Resource.objects.all().order_by('-id')[:5]
        for r in resources:
            print(f"ID: {r.id} | Title: {r.title} | Status: {r.status} | Progress: {r.status_text}")

        print("\n[QUEUE STATUS]")
        print(f"Pending Tasks (Task model): {Task.objects.count()}")

        print("\n[RECENT SUCCESSES (10m)]")
        print(f"Success Count: {Success.objects.filter(stopped__gte=timezone.now()-timedelta(minutes=10)).count()}")

        print("\n[RECENT FAILURES (10m)]")
        print(f"Failure Count: {Failure.objects.filter(stopped__gte=timezone.now()-timedelta(minutes=10)).count()}")

    except Exception as e:
        print(f"Audit Error: {e}")

if __name__ == "__main__":
    run_audit()
