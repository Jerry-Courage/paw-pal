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

# ─── START DJANGO-Q WORKER IN BACKGROUND THREAD ──────────────────────────
# Runs qcluster inside the backend process so it shares the same filesystem
# (required on Render free tier where services don't share disk)
import threading
import logging
logger = logging.getLogger('flowstate')

def _start_qcluster():
    try:
        from django_q.cluster import Cluster
        cluster = Cluster()
        logger.info('[QCluster] Starting embedded worker cluster...')
        cluster.start()
    except Exception as e:
        logger.error(f'[QCluster] Failed to start embedded cluster: {e}')

_qthread = threading.Thread(target=_start_qcluster, daemon=True, name='qcluster')
_qthread.start()
logger.info('[QCluster] Background worker thread launched.')

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
