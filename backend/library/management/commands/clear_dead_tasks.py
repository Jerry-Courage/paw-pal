from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Clear all failed/stale Django-Q tasks from the queue'

    def handle(self, *args, **options):
        from django_q.models import Task, Failure, OrmQ

        failed = Failure.objects.all().count()
        queued = OrmQ.objects.all().count()
        tasks = Task.objects.all().count()

        Failure.objects.all().delete()
        OrmQ.objects.all().delete()
        Task.objects.all().delete()

        self.stdout.write(self.style.SUCCESS(
            f'Cleared: {failed} failures, {queued} queued tasks, {tasks} task records'
        ))
