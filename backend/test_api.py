# Full API + AI test suite for FlowState
# Run with: C:\Users\DONEX\AppData\Local\Python\bin\python.exe test_api.py
import requests
import json
import sys

BASE = "http://127.0.0.1:8000"
PASS_COUNT = 0
FAIL_COUNT = 0

def ok(label, detail=""):
    global PASS_COUNT
    PASS_COUNT += 1
    print(f"  \033[92m✓\033[0m {label}" + (f" — {detail}" if detail else ""))

def fail(label, detail=""):
    global FAIL_COUNT
    FAIL_COUNT += 1
    print(f"  \033[91m✗\033[0m {label}" + (f" — {detail}" if detail else ""))

def section(title):
    print(f"\n\033[96m{'='*50}\033[0m")
    print(f"\033[96m  {title}\033[0m")
    print(f"\033[96m{'='*50}\033[0m")

# ─── Health ───────────────────────────────────────────────────────────────────
section("HEALTH CHECK")
r = requests.get(f"{BASE}/health/")
if r.status_code == 200 and r.json()["status"] == "healthy":
    ok("Health endpoint", f"DB: {r.json()['database']}")
else:
    fail("Health endpoint", r.text[:100])

# ─── Auth ─────────────────────────────────────────────────────────────────────
section("AUTH ENDPOINTS")

# Register
r = requests.post(f"{BASE}/api/auth/register/", json={
    "email": "apitest@flowstate.dev",
    "username": "apitestuser",
    "first_name": "API",
    "last_name": "Tester",
    "password": "TestPass123!",
    "password2": "TestPass123!",
})
if r.status_code in (200, 201):
    data = r.json()
    TOKEN = data["access"]
    ok("Register", f"user: {data['user']['email']}")
elif r.status_code == 400 and "email" in r.json():
    # Already exists, login instead
    r2 = requests.post(f"{BASE}/api/auth/login/", json={
        "email": "apitest@flowstate.dev",
        "password": "TestPass123!"
    })
    if r2.status_code == 200:
        TOKEN = r2.json()["access"]
        ok("Login (user already existed)", "token acquired")
    else:
        fail("Login", r2.text[:100])
        sys.exit(1)
else:
    fail("Register", r.text[:100])
    sys.exit(1)

H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

# Get profile
r = requests.get(f"{BASE}/api/auth/me/", headers=H)
if r.status_code == 200:
    me = r.json()
    ok("Get profile", f"streak: {me['study_streak']} | study_time: {me['total_study_time']}h")
else:
    fail("Get profile", r.text[:100])

# Update profile
r = requests.patch(f"{BASE}/api/auth/me/", json={"university": "MIT", "weekly_goal_hours": 15}, headers=H)
if r.status_code == 200:
    ok("Update profile", f"university: {r.json().get('university', '?')}")
else:
    fail("Update profile", r.text[:100])

# ─── Library ──────────────────────────────────────────────────────────────────
section("LIBRARY ENDPOINTS")

# Get resources (empty)
r = requests.get(f"{BASE}/api/library/resources/", headers=H)
if r.status_code == 200:
    ok("Get resources", f"count: {r.json()['count']}")
else:
    fail("Get resources", r.text[:100])

# Get flashcards
r = requests.get(f"{BASE}/api/library/flashcards/", headers=H)
if r.status_code == 200:
    ok("Get flashcards", f"count: {r.json()['count']}")
else:
    fail("Get flashcards", r.text[:100])

# Get due flashcards (spaced repetition)
r = requests.get(f"{BASE}/api/library/flashcards/due/", headers=H)
if r.status_code == 200:
    ok("Get due flashcards (SM-2)", f"due: {r.json()['count']}")
else:
    fail("Get due flashcards", r.text[:100])

# ─── Planner ──────────────────────────────────────────────────────────────────
section("PLANNER ENDPOINTS")

# Create session
r = requests.post(f"{BASE}/api/planner/sessions/", json={
    "title": "Neural Networks Exam Prep",
    "subject": "Computer Science",
    "start_time": "2026-03-28T09:00:00Z",
    "end_time": "2026-03-28T11:00:00Z",
    "status": "scheduled"
}, headers=H)
if r.status_code == 201:
    SESSION_ID = r.json()["id"]
    ok("Create study session", f"id: {SESSION_ID}")
else:
    fail("Create study session", r.text[:100])
    SESSION_ID = None

# Create deadline
r = requests.post(f"{BASE}/api/planner/deadlines/", json={
    "title": "Final Project",
    "subject": "Computer Science",
    "due_date": "2026-03-30T23:59:00Z"
}, headers=H)
if r.status_code == 201:
    ok("Create deadline", f"due in {r.json()['days_until']} days")
else:
    fail("Create deadline", r.text[:100])

# Smart schedule
r = requests.get(f"{BASE}/api/planner/smart-schedule/", headers=H)
if r.status_code == 200:
    ok("Smart schedule (AI)", f"suggestions: {len(r.json()['suggestions'])}")
else:
    fail("Smart schedule", r.text[:100])

# Mark session completed (triggers streak)
if SESSION_ID:
    r = requests.patch(f"{BASE}/api/planner/sessions/{SESSION_ID}/", json={"status": "completed"}, headers=H)
    if r.status_code == 200:
        ok("Complete session (streak tracking)", f"status: {r.json()['status']}")
    else:
        fail("Complete session", r.text[:100])

# ─── Groups ───────────────────────────────────────────────────────────────────
section("GROUPS ENDPOINTS")

r = requests.post(f"{BASE}/api/groups/", json={
    "name": "AI Ethics Study",
    "description": "Deep dive into AI ethics and bias",
    "subject": "Computer Science",
    "is_public": True
}, headers=H)
if r.status_code == 201:
    GROUP_ID = r.json()["id"]
    ok("Create group", f"id: {GROUP_ID} | members: {r.json()['member_count']}")
else:
    fail("Create group", r.text[:100])
    GROUP_ID = None

if GROUP_ID:
    # Create workspace document
    r = requests.post(f"{BASE}/api/groups/{GROUP_ID}/documents/", json={
        "title": "AI Ethics Notes",
        "content": "The ethical implications of LLMs...",
        "group": GROUP_ID
    }, headers=H)
    if r.status_code == 201:
        ok("Create workspace document", f"id: {r.json()['id']}")
    else:
        fail("Create workspace document", r.text[:100])

    # Send group message
    r = requests.post(f"{BASE}/api/groups/{GROUP_ID}/messages/", json={
        "content": "Hey team, let's discuss algorithmic bias tonight!"
    }, headers=H)
    if r.status_code == 201:
        ok("Send group message")
    else:
        fail("Send group message", r.text[:100])

# ─── Community ────────────────────────────────────────────────────────────────
section("COMMUNITY ENDPOINTS")

r = requests.post(f"{BASE}/api/community/posts/", json={
    "content": "Just generated 20 flashcards from my Neural Networks PDF using FlowAI!",
    "tags": ["AI", "MachineLearning", "StudyTips"]
}, headers=H)
if r.status_code == 201:
    POST_ID = r.json()["id"]
    ok("Create post", f"id: {POST_ID}")
else:
    fail("Create post", r.text[:100])
    POST_ID = None

if POST_ID:
    r = requests.post(f"{BASE}/api/community/posts/{POST_ID}/like/", headers=H)
    if r.status_code == 200:
        ok("Like post", f"liked: {r.json()['liked']}")
    else:
        fail("Like post", r.text[:100])

# ─── AI Endpoints ─────────────────────────────────────────────────────────────
section("AI ENDPOINTS (OpenRouter)")

# Study nudge
r = requests.get(f"{BASE}/api/ai/nudge/", headers=H)
if r.status_code == 200:
    nudge = r.json()["nudge"]
    ok("AI Study Nudge", nudge[:80] + "...")
else:
    fail("AI Study Nudge", r.text[:100])

# Create chat session
r = requests.post(f"{BASE}/api/ai/sessions/", json={
    "context_type": "global",
    "title": "Test Chat"
}, headers=H)
if r.status_code == 201:
    AI_SESSION_ID = r.json()["id"]
    ok("Create AI session", f"id: {AI_SESSION_ID}")
else:
    fail("Create AI session", r.text[:100])
    AI_SESSION_ID = None

# Send message — actual OpenRouter call
if AI_SESSION_ID:
    print("\n  Calling OpenRouter API (this may take a few seconds)...")
    r = requests.post(
        f"{BASE}/api/ai/sessions/{AI_SESSION_ID}/message/",
        json={"content": "What is backpropagation in neural networks? Explain in exactly 2 sentences."},
        headers=H,
        timeout=60
    )
    if r.status_code == 200:
        reply = r.json()["content"]
        ok("AI Chat Message (OpenRouter)", f"\n    → {reply[:200]}...")
    else:
        fail("AI Chat Message", r.text[:200])

# Quick ask
r = requests.post(f"{BASE}/api/ai/ask/", json={
    "question": "What is the difference between supervised and unsupervised learning? One sentence."
}, headers=H, timeout=60)
if r.status_code == 200:
    ok("Quick Ask AI", r.json()["answer"][:100] + "...")
else:
    fail("Quick Ask AI", r.text[:100])

# ─── Summary ──────────────────────────────────────────────────────────────────
section("TEST RESULTS")
total = PASS_COUNT + FAIL_COUNT
print(f"\n  \033[92m{PASS_COUNT} passed\033[0m  |  \033[91m{FAIL_COUNT} failed\033[0m  |  {total} total\n")

if FAIL_COUNT == 0:
    print("  \033[92m🎉 All endpoints working!\033[0m\n")
else:
    print("  \033[93m⚠️  Some endpoints need attention.\033[0m\n")
