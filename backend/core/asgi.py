import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

# Database Integrity Check & Programmatic Migration Runner
try:
    from django.db import connection
    from django.core.management import call_command
    
    cursor = connection.cursor()
    cursor.execute("SELECT 1 FROM information_schema.tables WHERE table_name='library_resourceprogress' LIMIT 1")
    table_exists = bool(cursor.fetchone())
    if not table_exists:
        cursor.execute("SELECT 1 FROM django_migrations WHERE app='library' AND name='0013_resourceprogress' LIMIT 1")
        applied = bool(cursor.fetchone())
        if applied:
            print("Auto-Healing Database: library_resourceprogress table is missing but migration 0013 is marked as applied. Clearing record...")
            cursor.execute("DELETE FROM django_migrations WHERE app='library' AND name='0013_resourceprogress'")
            print("Migration record cleared.")
            
    print("Core ASGI: Running migrations...")
    call_command("migrate", no_input=True, verbosity=1)
    print("Core ASGI: Migrations completed.")
except Exception as e:
    print(f"Core ASGI Integrity/Migration Check Skipped: {e}")

# ── Rescue resources stuck in processing from a previous dyno ─────────────────
# When Render kills a dyno mid-task the background thread dies without running
# the finally block, leaving resources stuck at status='processing' forever.
# On every startup, scan for those and either mark them ready (if they have
# content) or failed (if they have nothing), so the user can reprocess.
try:
    from library.models import Resource
    from django.utils import timezone
    import datetime

    # Only rescue resources that have been processing for > 5 minutes
    # (fresh uploads that just started should be left alone)
    cutoff = timezone.now() - datetime.timedelta(minutes=5)
    stuck = Resource.objects.filter(
        status__in=['processing', 'generating', 'vectorizing'],
        updated_at__lt=cutoff,
    )
    rescued = 0
    for r in stuck:
        if r.has_study_kit or r.ai_notes_json:
            r.status = 'ready'
            r.status_text = 'Study Kit Ready'
        else:
            r.status = 'failed'
            r.status_text = '❌ Processing interrupted — click Reprocess to retry'
        r.processing_progress = 100
        r.save(update_fields=['status', 'status_text', 'processing_progress'])
        rescued += 1
    if rescued:
        print(f"Core ASGI: Rescued {rescued} stuck resource(s) from previous dyno.")
except Exception as e:
    print(f"Core ASGI: Stuck resource rescue skipped: {e}")

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from workspace.middleware import JWTAuthMiddleware
from workspace.routing import websocket_urlpatterns as workspace_ws
from ai_assistant.routing import websocket_urlpatterns as ai_ws
from users.routing import websocket_urlpatterns as users_ws
from groups.routing import websocket_urlpatterns as groups_ws

# ─── ASGI APPLICATION ENTRY ────────────────────────────────────────────────
application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AuthMiddlewareStack(
        JWTAuthMiddleware(
            URLRouter(
                workspace_ws + ai_ws + users_ws + groups_ws
            )
        )
    ),
})
