import os
import django
from django.utils import timezone
from datetime import timedelta

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from library.models import Resource
from django_q.models import Task, Success, Failure

def run_audit():
    print(f"--- [Live Audit: {timezone.now()}] ---")
    
    # 1. Check for new Resources
    latest_resources = Resource.objects.all().order_by('-id')[:3]
    print("\n[LATEST RESOURCES]")
    if latest_resources:
        for r in latest_resources:
            print(f"ID: {r.id} | Title: {r.title} | Status: {r.status} | Progress: {r.status_text}")
    else:
        print("No resources found.")

    # 2. Check Task Queue
    print("\n[QUEUE STATUS]")
    print(f"Pending Tasks (Task model): {Task.objects.count()}")

    # 3. Check recent Successes (last 10 mins)
    recent_s = Success.objects.filter(stopped__gt=timezone.now() - timedelta(minutes=10))
    print(f"\n[RECENT SUCCESSES (10m)]: {recent_s.count()}")
    for s in recent_s[:3]:
        print(f"- {s.name} at {s.stopped}")

    # 4. Check recent Failures (last 10 mins)
    recent_f = Failure.objects.filter(stopped__gt=timezone.now() - timedelta(minutes=10))
    print(f"\n[RECENT FAILURES (10m)]: {recent_f.count()}")
    for f in recent_f[:3]:
        print(f"- {f.name} error: {f.result}")

if __name__ == "__main__":
    run_audit()
