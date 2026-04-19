import os
import django
import sys

# Setup Django Environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from library.models import Resource
from library.tasks import process_resource_task
from django_q.tasks import async_task

def rescue_resource(res_id):
    try:
        res = Resource.objects.get(id=res_id)
        print(f"[*] Rescuing Resource {res_id}: '{res.title}'")
        
        # Reset status to trigger UI update
        res.status = 'processing'
        res.status_text = "🔄 Resilience Rescue: Restarting AI pipeline..."
        res.processing_progress = 5
        res.save()
        
        # Manually kick the task back into the queue
        async_task('library.tasks.process_resource_task', res.id)
        print(f"[+] Task dispatched. Check your dashboard/logs!")
        
    except Exception as e:
        print(f"[!] Error during rescue: {e}")

if __name__ == "__main__":
    rescue_resource(9)
