import os
import django
import time
from datetime import timedelta

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from library.models import Resource
from library.tasks import process_resource_task
from users.models import User

def run_calculus_test():
    print("STARTING HIGH-OCTANE CALCULUS PERFORMANCE TEST...")
    print("Document: EBS301 CALCULUS - Units 1 and 2.pdf (98 Pages)")
    
    # 1. Get/Create test user
    user = User.objects.first()
    if not user:
        print("No user found. Cannot run test.")
        return

    # 2. Create Resource entry
    # Note: We point to the actual file on disk
    pdf_path = r'C:\Users\DONEX\Downloads\Compressed\paw-pal\paw-pal\EBS301 CALCULUS - Units 1 and 2.pdf'
    
    # Mocking a resource for testing
    resource = Resource.objects.create(
        owner=user,
        title="CALCULUS SPEED TEST - 98 PAGES",
        resource_type='pdf'
    )
    
    # We manually set the file field for this test
    from django.core.files import File
    with open(pdf_path, 'rb') as f:
        resource.file.save('calculus_test.pdf', File(f), save=True)

    print(f"Resource {resource.id} created. Starting timer...")
    start_time = time.time()

    # 3. Trigger the High-Octane Task
    process_resource_task(resource.id)

    # 4. End Timer
    end_time = time.time()
    duration = end_time - start_time
    
    # 5. Fetch resulting kit
    resource.refresh_from_db()
    kit_size = len(resource.ai_notes_json.get('sections', []))
    
    print("\n" + "="*50)
    print("TEST COMPLETE!")
    print(f"Total Time: {duration:.2f} seconds ({timedelta(seconds=int(duration))})")
    print(f"Sections Generated: {kit_size}")
    print(f"Final Status: {resource.status} ({resource.processing_progress}%)")
    print("="*50)

if __name__ == "__main__":
    run_calculus_test()
