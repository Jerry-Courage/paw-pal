import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.test import RequestFactory
from django.contrib.auth import get_user_model
from community.models import Post, Comment, StudyRoom, StudyEvent
from community.views import (
    PostListCreateView, LikePostView, StudyRoomListCreateView,
    StudyRoomJoinLeaveView, LeaderboardView, AIAnswerView
)
import json

User = get_user_model()
factory = RequestFactory()
u = User.objects.first()
print(f'Testing with user: {u.email}')

# 1. Create a post
post = Post.objects.create(author=u, content='Test post', post_type='general', tags=['test'])
print(f'Post created: {post.id} [{post.post_type}]')

# 2. Create a question post
q_post = Post.objects.create(author=u, content='What is backpropagation?', post_type='question')
print(f'Question post created: {q_post.id}')

from rest_framework.test import APIRequestFactory, force_authenticate
api_factory = APIRequestFactory()

# 3. Like a post
req = api_factory.post(f'/community/posts/{post.id}/like/')
force_authenticate(req, user=u)
view = LikePostView.as_view()
resp = view(req, pk=post.id)
assert resp.status_code == 200
assert resp.data['liked'] == True
print(f'Like post OK: liked={resp.data["liked"]}, count={resp.data["like_count"]}')

# 4. Create a study room
room = StudyRoom.objects.create(host=u, title='Math Study Room', subject='Mathematics', max_participants=10)
room.participants.add(u)
print(f'Study room created: {room.id}, participants: {room.participants.count()}')

# 5. Join/leave room
u2 = User.objects.exclude(id=u.id).first()
if u2:
    req2 = api_factory.post(f'/community/rooms/{room.id}/join/')
    force_authenticate(req2, user=u2)
    view2 = StudyRoomJoinLeaveView.as_view()
    resp2 = view2(req2, pk=room.id)
    assert resp2.status_code == 200
    assert resp2.data['joined'] == True
    print(f'Join room OK: {resp2.data}')
else:
    print('No second user to test join')

# 6. Leaderboard
req3 = api_factory.get('/community/leaderboard/')
force_authenticate(req3, user=u)
view3 = LeaderboardView.as_view()
resp3 = view3(req3)
assert resp3.status_code == 200
assert 'leaderboard' in resp3.data
assert 'my_rank' in resp3.data
print(f'Leaderboard OK: {len(resp3.data["leaderboard"])} users, my rank: {resp3.data["my_rank"]["rank"]}')

# 7. Create event
event = StudyEvent.objects.create(
    host=u, title='Calculus Exam Prep',
    event_type='exam_prep',
    scheduled_at='2026-04-10T18:00:00Z',
    max_participants=30
)
print(f'Event created: {event.id} - {event.title}')

# Cleanup
post.delete()
q_post.delete()
room.delete()
event.delete()
print('\nAll community tests passed!')
