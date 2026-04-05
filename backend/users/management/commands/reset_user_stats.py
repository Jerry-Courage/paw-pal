from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'Reset study stats for a user (use after test data pollution)'

    def add_arguments(self, parser):
        parser.add_argument('email', type=str)

    def handle(self, *args, **options):
        email = options['email']
        try:
            user = User.objects.get(email=email)
            user.study_streak = 0
            user.total_study_time = 0
            user.last_study_date = None
            user.save(update_fields=['study_streak', 'total_study_time', 'last_study_date'])
            self.stdout.write(self.style.SUCCESS(f'Reset stats for {email}'))
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'User {email} not found'))
