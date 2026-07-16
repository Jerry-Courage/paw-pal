from django.urls import re_path
from .consumers_examprep import ExamPrepConsumer
from .consumers_personalized import PersonalisedConsumer

websocket_urlpatterns = [
    re_path(r'^ws/examprep/(?P<resource_id>\d+)/$', ExamPrepConsumer.as_asgi()),
    re_path(r'^ws/personalised/$', PersonalisedConsumer.as_asgi()),
]
