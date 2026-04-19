from django.urls import re_path
from . import consumers_live

websocket_urlpatterns = [
    re_path(r'^ws/ai/live/$', consumers_live.GeminiLiveConsumer.as_asgi()),
]
