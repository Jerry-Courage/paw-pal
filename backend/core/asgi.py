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

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from workspace.middleware import JWTAuthMiddleware
from workspace.routing import websocket_urlpatterns as workspace_ws
from ai_assistant.routing import websocket_urlpatterns as ai_ws
from users.routing import websocket_urlpatterns as users_ws

# ─── ASGI APPLICATION ENTRY ────────────────────────────────────────────────
application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AuthMiddlewareStack(
        JWTAuthMiddleware(
            URLRouter(
                workspace_ws + ai_ws + users_ws
            )
        )
    ),
})
