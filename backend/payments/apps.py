from django.apps import AppConfig


class PaymentsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'payments'

    def ready(self):
        """Register django-q scheduled tasks on startup."""
        try:
            from django_q.models import Schedule

            # Hourly expiry reminders (3-day warning)
            reminder_name = 'Premium Expiry Reminders'
            if not Schedule.objects.filter(name=reminder_name).exists():
                Schedule.objects.create(
                    name=reminder_name,
                    func='payments.views.send_expiry_reminders',
                    schedule_type=Schedule.HOURLY,
                    repeats=-1,
                )

            # Daily deactivation of expired subscriptions
            deactivation_name = 'Deactivate Expired Subscriptions'
            if not Schedule.objects.filter(name=deactivation_name).exists():
                Schedule.objects.create(
                    name=deactivation_name,
                    func='payments.views.deactivate_expired_subscriptions',
                    schedule_type=Schedule.DAILY,
                    repeats=-1,
                )
        except Exception:
            # django-q may not be migrated yet — safe to skip
            pass
