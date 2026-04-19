import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from workspace.middleware import JWTAuthMiddleware
from workspace.routing import websocket_urlpatterns as workspace_ws
from ai_assistant.routing import websocket_urlpatterns as ai_ws

# ─── ASGI APPLICATION ENTRY ────────────────────────────────────────────────
application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AuthMiddlewareStack(
        JWTAuthMiddleware(
            URLRouter(
                workspace_ws + ai_ws
            )
        )
    ),
})
