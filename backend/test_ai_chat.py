# Test the exact flow the frontend uses for global chat
import requests

BASE = "http://127.0.0.1:8000"

# Login as your actual user
email = input("Your email: ").strip()
password = input("Your password: ").strip()

r = requests.post(f"{BASE}/api/auth/login/", json={"email": email, "password": password})
if r.status_code != 200:
    print(f"Login failed: {r.text}")
    exit(1)

TOKEN = r.json()["access"]
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}
print(f"Logged in as: {email}")

# Step 1: Create a global session (exactly what frontend does)
print("\n1. Creating global AI session...")
s = requests.post(f"{BASE}/api/ai/sessions/", json={
    "context_type": "global",
    "title": "test chat"
}, headers=H)
print(f"   Status: {s.status_code}")
if s.status_code != 201:
    print(f"   Error: {s.text}")
    exit(1)
session_id = s.json()["id"]
print(f"   Session ID: {session_id}")

# Step 2: Send a message (exactly what frontend does)
print("\n2. Sending message to AI...")
m = requests.post(f"{BASE}/api/ai/sessions/{session_id}/message/", json={
    "content": "Hello! What is 2+2? Reply in one word."
}, headers=H, timeout=60)
print(f"   Status: {m.status_code}")
if m.status_code == 200:
    reply = m.json().get("content", "")
    print(f"   AI Reply: {reply[:200]}")
    if "error" in reply.lower() or "402" in reply or "unavailable" in reply.lower():
        print("\n   ⚠️  AI returned an error message. Checking model...")
        # Check what model is loaded
        import os, sys
        sys.path.insert(0, '.')
        os.environ['DJANGO_SETTINGS_MODULE'] = 'core.settings'
        import django
        django.setup()
        from django.conf import settings
        print(f"   Current model: {settings.OPENROUTER_MODEL}")
    else:
        print("\n   ✓ AI is working correctly!")
else:
    print(f"   Error: {m.text[:300]}")
