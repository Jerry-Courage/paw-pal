import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.contrib.auth import get_user_model
from library.models import Resource
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()

def test_delete():
    # 1. Create/Get test user
    user, _ = User.objects.get_or_create(
        email='testuser@example.com',
        defaults={'username': 'testuser'}
    )
    user.set_password('password123')
    user.save()

    # 2. Create test resource
    resource = Resource.objects.create(
        title="Test Network Security",
        owner=user,
        status='processing',
        resource_type='pdf'
    )
    print(f"Created Resource ID: {resource.id}")

    # 3. Initialize API client
    client = APIClient()
    client.force_authenticate(user=user)

    # 4. Perform DELETE request
    url = f'/api/library/resources/{resource.id}/'
    print(f"Deleting resource via {url}...")
    response = client.delete(url)

    print(f"Response Status: {response.status_code}")
    print(f"Response Data: {response.data if hasattr(response, 'data') else response.content}")

    # Check if resource still exists
    exists = Resource.objects.filter(id=resource.id).exists()
    print(f"Resource still exists in DB? {exists}")

if __name__ == '__main__':
    test_delete()
