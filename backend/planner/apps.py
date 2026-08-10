from django.apps import AppConfig
from django.db.models.signals import post_migrate


def _create_reminder_schedule(sender, **kwargs):
    """Create the django-q scheduled task after migrations run."""
    try:
        from django_q.models import Schedule
        task_name = 'Planner Session Reminders'
        if not Schedule.objects.filter(name=task_name).exists():
            Schedule.objects.create(
                name=task_name,
                func='planner.views.send_planner_reminders',
                schedule_type='I',
                minutes=5,
                repeats=-1,
            )
    except Exception:
        pass


class PlannerConfig(AppConfig):
    name = 'planner'

    def ready(self):
        post_migrate.connect(_create_reminder_schedule, sender=self)
