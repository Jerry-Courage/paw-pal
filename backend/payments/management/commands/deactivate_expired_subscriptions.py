"""
Management command: deactivate_expired_subscriptions
Run daily via Render Cron Job or django-q:
  Command: python manage.py deactivate_expired_subscriptions
  Schedule: 0 0 * * *  (midnight UTC daily)

Proactively flips is_premium=False for all users whose subscription
has expired, and sends a downgrade notification.
"""
from django.core.management.base import BaseCommand
from payments.views import deactivate_expired_subscriptions


class Command(BaseCommand):
    help = 'Deactivate expired premium subscriptions and notify users'

    def handle(self, *args, **options):
        self.stdout.write('Deactivating expired subscriptions...')
        count = deactivate_expired_subscriptions()
        self.stdout.write(self.style.SUCCESS(f'Done. Deactivated {count} user(s).'))
