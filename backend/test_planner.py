import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.utils import timezone
from datetime import timedelta
from users.models import User
from planner.models import StudySession, Deadline
from library.models import Resource

u = User.objects.first()
print('User:', u.email)

# 1. Create a deadline
deadline = Deadline.objects.create(
    user=u, title='Final Exam', subject='Mathematics',
    due_date=timezone.now() + timedelta(days=5)
)
days_left = (deadline.due_date - timezone.now()).days
print(f'Deadline created: {deadline.title} - days until: {days_left}')

# 2. Create a session linked to a resource
resource = Resource.objects.filter(owner=u).first()
session = StudySession.objects.create(
    user=u, title='Math Study Block',
    subject='Mathematics',
    start_time=timezone.now(),
    end_time=timezone.now() + timedelta(hours=1),
    resource=resource,
    status='scheduled'
)
print(f'Session created: {session.title} - duration: {session.duration_minutes} mins')
print(f'Linked resource: {session.resource.title if session.resource else "None"}')

# 3. Test complete session logs study time
streak_before = u.study_streak
time_before = u.total_study_time
u.log_study_time(session.duration_minutes)
u.refresh_from_db()
print(f'Study time: {time_before:.2f}h -> {u.total_study_time:.2f}h')
print(f'Streak: {streak_before} -> {u.study_streak}')

# 4. Test smart schedule view
from planner.views import SmartScheduleView
from django.test import RequestFactory
factory = RequestFactory()
req = factory.get('/planner/smart-schedule/')
req.user = u
view = SmartScheduleView()
resp = view.get(req)
suggestions = resp.data['suggestions']
print(f'Smart suggestions: {len(suggestions)}')
for s in suggestions:
    print(f'  [{s["urgency"]}] {s["title"]} - {s["reason"]}')

# 5. Test serializer includes resource fields
from planner.serializers import StudySessionSerializer
data = StudySessionSerializer(session).data
assert data['resource_title'] == (resource.title if resource else None), 'resource_title missing'
assert data['duration_minutes'] == 60, f'duration wrong: {data["duration_minutes"]}'
print('Serializer fields OK')

# 6. Test complete endpoint
from planner.views import CompleteSessionView
start = timezone.now() - timedelta(minutes=45)
end = timezone.now()
session2 = StudySession.objects.create(
    user=u, title='Test Complete',
    start_time=start,
    end_time=end,
    status='scheduled'
)
print(f'Session2 duration_minutes: {session2.duration_minutes}')
req2 = factory.post(f'/planner/sessions/{session2.id}/complete/')
req2.user = u
view2 = CompleteSessionView()
resp2 = view2.post(req2, pk=session2.id)
assert resp2.status_code == 200, f'Complete failed: {resp2.data}'
assert resp2.data['minutes_logged'] == 45, f'Wrong minutes: {resp2.data}'
print(f'Complete endpoint OK - logged {resp2.data["minutes_logged"]}m')

# Cleanup
deadline.delete()
session.delete()
session2.delete()
print('\nAll tests passed!')
