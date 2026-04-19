import os
import sys
import django

# SETUP
sys.path.append('c:\\Users\\DONEX\\Downloads\\Compressed\\paw-pal\\paw-pal\\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

import json
from rest_framework.test import APIRequestFactory, force_authenticate
from library.views import CuratedLibraryView
from users.models import User

user = User.objects.first()
factory = APIRequestFactory()
view = CuratedLibraryView.as_view()

request = factory.get('/api/library/resources/curated/')
if user:
    force_authenticate(request, user=user)

response = view(request)
data = response.data

print(f"--- STRUCTURE ANALYSIS ---")
print(f"Data Type: {type(data)}")
if isinstance(data, dict):
    print(f"Keys: {list(data.keys())}")
    if 'results' in data:
        print(f"Results Count: {len(data['results'])}")
elif isinstance(data, list):
    print(f"List Length: {len(data)}")
    if len(data) > 0:
        print(f"First Item Keys: {list(data[0].keys())}")
print(f"--- END ANALYSIS ---")
