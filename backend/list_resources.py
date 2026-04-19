import os
import django
import sys

# Setup Django Environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from library.models import Resource

def find_system_analysis():
    print("[*] Searching for 'System Analysis'...")
    resources = Resource.objects.filter(title__icontains='System Analysis')
    if not resources.exists():
        print("[!] No exact title match. Searching all processing resources...")
        resources = Resource.objects.filter(status='processing')
        
    for r in resources:
        print(f"ID: {r.id} | Title: {r.title} | Status: {r.status} | Owner: {r.owner.email}")

if __name__ == "__main__":
    find_system_analysis()
