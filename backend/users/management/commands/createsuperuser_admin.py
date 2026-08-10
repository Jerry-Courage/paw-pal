"""
Usage on Render shell:
  python manage.py createsuperuser_admin --email admin@flowstate.ai --username admin --password YourPassword123
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model


class Command(BaseCommand):
    help = 'Create a Django admin superuser (non-interactive)'

    def add_arguments(self, parser):
        parser.add_argument('--email', required=True)
        parser.add_argument('--username', required=True)
        parser.add_argument('--password', required=True)

    def handle(self, *args, **options):
        User = get_user_model()
        email = options['email']
        username = options['username']
        password = options['password']

        if User.objects.filter(email=email).exists():
            user = User.objects.get(email=email)
            if not user.is_superuser:
                user.is_staff = True
                user.is_superuser = True
                user.set_password(password)
                user.save()
                self.stdout.write(self.style.SUCCESS(f'Updated {email} to superuser'))
            else:
                self.stdout.write(f'{email} is already a superuser')
        else:
            User.objects.create_superuser(
                email=email,
                username=username,
                password=password,
            )
            self.stdout.write(self.style.SUCCESS(f'Superuser created: {email}'))
