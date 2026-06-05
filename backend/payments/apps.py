from django.apps import AppConfig


class PaymentsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'payments'

    def ready(self):
        """Register django-q scheduled tasks on startup."""
        try:
            from django_q.models import Schedule

            task_name = 'Premium Expiry Reminders'
            if not Schedule.objects.filter(name=task_name).exists():
                Schedule.objects.create(
                    name=task_name,
                    func='payments.views.send_expiry_reminders',
                    schedule_type=Schedule.HOURLY,
                    repeats=-1,
                )
        except Exception:
            # django-q may not be migrated yet — safe to skip
            pass
