"""
Run this once to create the admin superuser:
  python create_superuser.py
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

email = input('Admin email: ').strip()
username = input('Admin username: ').strip()
password = input('Admin password: ').strip()

if User.objects.filter(email=email).exists():
    print(f'User {email} already exists.')
else:
    User.objects.create_superuser(
        email=email,
        username=username,
        password=password,
    )
    print(f'✓ Superuser created: {email}')
    print('  Access admin at: http://localhost:8000/admin')
