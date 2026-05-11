from django.urls import re_path
from .consumers_examprep import ExamPrepConsumer

websocket_urlpatterns = [
    re_path(r'^ws/examprep/(?P<resource_id>\d+)/$', ExamPrepConsumer.as_asgi()),
]
