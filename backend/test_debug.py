import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from rest_framework.test import APIRequestFactory, force_authenticate
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta

User = get_user_model()
factory = APIRequestFactory()
u = User.objects.first()

# Test 1: Complete session
from planner.views import StudySessionListCreateView, CompleteSessionView
from planner.models import StudySession

print("=== Test: Complete Session ===")
req = factory.post('/planner/sessions/', {
    'title': 'Debug Session',
    'start_time': (timezone.now() - timedelta(hours=1)).isoformat(),
    'end_time': timezone.now().isoformat(),
}, format='json')
force_authenticate(req, user=u)
resp = StudySessionListCreateView.as_view()(req)
print(f"Create status: {resp.status_code}, data: {resp.data}")
sid = resp.data['id']

req2 = factory.post(f'/planner/sessions/{sid}/complete/')
force_authenticate(req2, user=u)
resp2 = CompleteSessionView.as_view()(req2, pk=sid)
print(f"Complete status: {resp2.status_code}, data: {resp2.data}")
StudySession.objects.filter(id=sid).delete()

# Test 2: Schedule from assignment
print("\n=== Test: Schedule from Assignment ===")
from assignments.views import AssignmentListCreateView, ScheduleSessionView
from assignments.models import Assignment

req3 = factory.post('/assignments/', {
    'title': 'Debug Assignment',
    'instructions': 'Test instructions',
}, format='json')
force_authenticate(req3, user=u)
resp3 = AssignmentListCreateView.as_view()(req3)
print(f"Create assignment status: {resp3.status_code}, data keys: {list(resp3.data.keys())}")
aid = resp3.data['id']

req4 = factory.post(f'/assignments/{aid}/schedule/', {
    'start_time': (timezone.now() + timedelta(days=1)).isoformat(),
    'end_time': (timezone.now() + timedelta(days=1, hours=2)).isoformat(),
}, format='json')
force_authenticate(req4, user=u)
resp4 = ScheduleSessionView.as_view()(req4, pk=aid)
print(f"Schedule status: {resp4.status_code}, data: {resp4.data}")
Assignment.objects.filter(id=aid).delete()
