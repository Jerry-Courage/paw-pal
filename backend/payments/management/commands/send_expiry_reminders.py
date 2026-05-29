"""
Management command: send_expiry_reminders
Run daily via Render Cron Job:
  Command: python manage.py send_expiry_reminders
  Schedule: 0 9 * * *  (9am UTC daily)
"""
from django.core.management.base import BaseCommand
from payments.views import send_expiry_reminders


class Command(BaseCommand):
    help = 'Send premium expiry reminder notifications to users expiring in 3 days'

    def handle(self, *args, **options):
        self.stdout.write('Sending expiry reminders...')
        send_expiry_reminders()
        self.stdout.write(self.style.SUCCESS('Done.'))
