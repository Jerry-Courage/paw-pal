"""
Full app integration test — verifies all major endpoints work correctly.
Run: python test_full_app.py
"""
import os, django, sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from rest_framework.test import APIRequestFactory, force_authenticate
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta

User = get_user_model()
factory = APIRequestFactory()
u = User.objects.first()

if not u:
    print("ERROR: No users found. Create a user first.")
    sys.exit(1)

print(f"Testing with: {u.email}\n")
errors = []

def test(name, fn):
    try:
        fn()
        print(f"  ✓ {name}")
    except Exception as e:
        print(f"  ✗ {name}: {e}")
        errors.append(f"{name}: {e}")

# ── USERS ──────────────────────────────────────────────────────────────────
print("USERS")
from users.views import AnalyticsView, LogStudyView, SetWeeklyGoalView, NotificationsView

def test_analytics():
    req = factory.get('/auth/analytics/')
    force_authenticate(req, user=u)
    resp = AnalyticsView.as_view()(req)
    assert resp.status_code == 200
    assert 'streak' in resp.data

def test_log_study():
    before = u.total_study_time
    req = factory.post('/auth/log-study/', {'minutes': 30}, format='json')
    force_authenticate(req, user=u)
    resp = LogStudyView.as_view()(req)
    assert resp.status_code == 200
    u.refresh_from_db()
    assert u.total_study_time > before

def test_set_goal():
    req = factory.post('/auth/set-goal/', {'hours': 15}, format='json')
    force_authenticate(req, user=u)
    resp = SetWeeklyGoalView.as_view()(req)
    assert resp.status_code == 200
    u.refresh_from_db()
    assert u.weekly_goal_hours == 15

def test_notifications():
    req = factory.get('/auth/notifications/')
    force_authenticate(req, user=u)
    resp = NotificationsView.as_view()(req)
    assert resp.status_code == 200
    assert 'results' in resp.data

test("Analytics", test_analytics)
test("Log study time", test_log_study)
test("Set weekly goal", test_set_goal)
test("Notifications", test_notifications)

# ── PLANNER ────────────────────────────────────────────────────────────────
print("\nPLANNER")
from planner.views import StudySessionListCreateView, DeadlineListCreateView, SmartScheduleView, CompleteSessionView
from planner.models import StudySession, Deadline

def test_create_session():
    req = factory.post('/planner/sessions/', {
        'title': 'Test Session',
        'subject': 'Math',
        'start_time': (timezone.now()).isoformat(),
        'end_time': (timezone.now() + timedelta(hours=1)).isoformat(),
    }, format='json')
    force_authenticate(req, user=u)
    resp = StudySessionListCreateView.as_view()(req)
    assert resp.status_code == 201
    assert resp.data['duration_minutes'] == 60
    return resp.data['id']

def test_complete_session():
    req = factory.post('/planner/sessions/', {
        'title': 'Complete Test',
        'start_time': (timezone.now() - timedelta(hours=1)).isoformat(),
        'end_time': timezone.now().isoformat(),
    }, format='json')
    force_authenticate(req, user=u)
    r = StudySessionListCreateView.as_view()(req)
    assert r.status_code == 201
    sid = r.data['id']
    req2 = factory.post(f'/planner/sessions/{sid}/complete/')
    force_authenticate(req2, user=u)
    resp = CompleteSessionView.as_view()(req2, pk=sid)
    assert resp.status_code == 200
    assert resp.data['minutes_logged'] == 60
    StudySession.objects.filter(id=sid).delete()

def test_smart_schedule():
    # Create a deadline first
    d = Deadline.objects.create(user=u, title='Test Deadline', due_date=timezone.now() + timedelta(days=5))
    req = factory.get('/planner/smart-schedule/')
    force_authenticate(req, user=u)
    resp = SmartScheduleView.as_view()(req)
    assert resp.status_code == 200
    assert 'suggestions' in resp.data
    d.delete()

test("Create session", test_create_session)
test("Complete session + log time", test_complete_session)
test("Smart schedule", test_smart_schedule)

# ── ASSIGNMENTS ────────────────────────────────────────────────────────────
print("\nASSIGNMENTS")
from assignments.views import AssignmentListCreateView, ScheduleSessionView
from assignments.models import Assignment

def test_create_assignment():
    req = factory.post('/assignments/', {
        'title': 'Test Assignment',
        'subject': 'Biology',
        'instructions': 'Explain photosynthesis.',
    }, format='json')
    force_authenticate(req, user=u)
    resp = AssignmentListCreateView.as_view()(req)
    assert resp.status_code == 201
    assert resp.data['status'] == 'pending'
    # Check deadline was auto-created if due_date set
    return resp.data['id']

def test_assignment_with_deadline():
    req = factory.post('/assignments/', {
        'title': 'Deadline Test',
        'instructions': 'Test',
        'due_date': (timezone.now() + timedelta(days=3)).isoformat(),
    }, format='json')
    force_authenticate(req, user=u)
    resp = AssignmentListCreateView.as_view()(req)
    assert resp.status_code == 201
    aid = resp.data['id']
    a = Assignment.objects.get(id=aid)
    assert hasattr(a, 'deadline')
    assert a.deadline is not None
    a.delete()

def test_schedule_from_assignment():
    aid = test_create_assignment()
    req = factory.post(f'/assignments/{aid}/schedule/', {
        'start_time': (timezone.now() + timedelta(days=1)).isoformat(),
        'end_time': (timezone.now() + timedelta(days=1, hours=2)).isoformat(),
    }, format='json')
    force_authenticate(req, user=u)
    from assignments.views import ScheduleSessionView
    resp = ScheduleSessionView.as_view()(req, pk=aid)
    assert resp.status_code == 201
    assert resp.data['assignment'] == aid
    Assignment.objects.filter(id=aid).delete()

test("Create assignment", test_create_assignment)
test("Assignment auto-creates deadline", test_assignment_with_deadline)
test("Schedule session from assignment", test_schedule_from_assignment)

# ── WORKSPACE ──────────────────────────────────────────────────────────────
print("\nWORKSPACE")
from workspace.views import WorkspaceListCreateView, DocumentView, MessagesView, TasksView, FilesView
from workspace.models import Workspace, WorkspaceMember, WorkspaceDocument

def test_create_workspace():
    req = factory.post('/workspace/', {'name': 'Test WS', 'subject': 'CS'}, format='json')
    force_authenticate(req, user=u)
    resp = WorkspaceListCreateView.as_view()(req)
    assert resp.status_code == 201
    assert resp.data['invite_code']
    return resp.data['id']

def test_workspace_document():
    wid = test_create_workspace()
    req = factory.patch(f'/workspace/{wid}/document/', {'content': '# Hello\n\nTest content'}, format='json')
    force_authenticate(req, user=u)
    resp = DocumentView.as_view()(req, pk=wid)
    assert resp.status_code == 200
    assert resp.data['version'] == 2
    Workspace.objects.filter(id=wid).delete()

def test_workspace_tasks():
    wid = test_create_workspace()
    req = factory.post(f'/workspace/{wid}/tasks/', {'title': 'Write intro'}, format='json')
    force_authenticate(req, user=u)
    resp = TasksView.as_view()(req, pk=wid)
    assert resp.status_code == 201
    assert resp.data['status'] == 'todo'
    Workspace.objects.filter(id=wid).delete()

def test_workspace_messages():
    wid = test_create_workspace()
    req = factory.post(f'/workspace/{wid}/messages/', {'content': 'Hello team!'}, format='json')
    force_authenticate(req, user=u)
    resp = MessagesView.as_view()(req, pk=wid)
    assert resp.status_code == 201
    assert resp.data['user_message']['content'] == 'Hello team!'
    Workspace.objects.filter(id=wid).delete()

def test_workspace_join():
    wid = test_create_workspace()
    ws = Workspace.objects.get(id=wid)
    u2 = User.objects.exclude(id=u.id).first()
    if u2:
        from workspace.views import JoinWorkspaceView
        req = factory.post('/workspace/join/', {'invite_code': ws.invite_code}, format='json')
        force_authenticate(req, user=u2)
        resp = JoinWorkspaceView.as_view()(req)
        assert resp.status_code in (200, 201)
    Workspace.objects.filter(id=wid).delete()

test("Create workspace", test_create_workspace)
test("Workspace document edit", test_workspace_document)
test("Workspace tasks", test_workspace_tasks)
test("Workspace messages", test_workspace_messages)
test("Join workspace by code", test_workspace_join)

# ── COMMUNITY ──────────────────────────────────────────────────────────────
print("\nCOMMUNITY")
from community.views import PostListCreateView, LikePostView, StudyRoomListCreateView, LeaderboardView
from community.models import Post, StudyRoom
from rest_framework.test import force_authenticate

def test_create_post():
    req = factory.post('/community/posts/', {
        'content': 'Test post about studying',
        'post_type': 'tip',
        'tags': ['study', 'tips'],
    }, format='json')
    force_authenticate(req, user=u)
    resp = PostListCreateView.as_view()(req)
    assert resp.status_code == 201
    pid = resp.data['id']
    Post.objects.filter(id=pid).delete()

def test_leaderboard():
    req = factory.get('/community/leaderboard/')
    force_authenticate(req, user=u)
    resp = LeaderboardView.as_view()(req)
    assert resp.status_code == 200
    assert 'leaderboard' in resp.data
    assert 'my_rank' in resp.data

def test_study_room():
    req = factory.post('/community/rooms/', {
        'title': 'Test Room', 'subject': 'Math', 'max_participants': 10
    }, format='json')
    force_authenticate(req, user=u)
    resp = StudyRoomListCreateView.as_view()(req)
    assert resp.status_code == 201
    rid = resp.data['id']
    StudyRoom.objects.filter(id=rid).delete()

test("Create post", test_create_post)
test("Leaderboard", test_leaderboard)
test("Create study room", test_study_room)

# ── SUMMARY ────────────────────────────────────────────────────────────────
print(f"\n{'='*50}")
if errors:
    print(f"FAILED: {len(errors)} test(s)")
    for e in errors:
        print(f"  - {e}")
    sys.exit(1)
else:
    print(f"ALL TESTS PASSED ✓")
    print(f"User stats: streak={u.study_streak}, time={round(u.total_study_time,2)}h")
