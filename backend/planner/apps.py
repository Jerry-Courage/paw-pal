from django.apps import AppConfig


class PlannerConfig(AppConfig):
    name = 'planner'

    def ready(self):
        """Register django-q scheduled tasks on startup."""
        try:
            from django_q.models import Schedule

            task_name = 'Planner Session Reminders'
            if not Schedule.objects.filter(name=task_name).exists():
                Schedule.objects.create(
                    name=task_name,
                    func='planner.views.send_planner_reminders',
                    schedule_type='I',  # Every 5 minutes (interval)
                    minutes=5,
                    repeats=-1,
                )
        except Exception:
            # django-q may not be migrated yet — safe to skip
            pass
