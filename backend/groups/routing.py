from django.urls import re_path
from .consumers import QuizConsumer

websocket_urlpatterns = [
    re_path(r'^ws/quiz/(?P<pin>[0-9]{6})/$', QuizConsumer.as_asgi()),
]
