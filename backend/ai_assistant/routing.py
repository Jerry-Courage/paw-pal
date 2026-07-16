from django.urls import re_path
from .consumers_examprep import ExamPrepConsumer
from .consumers_personalized import PersonalisedConsumer
from .consumers_vr import VRTutorConsumer

websocket_urlpatterns = [
    re_path(r'^ws/examprep/(?P<resource_id>\d+)/$', ExamPrepConsumer.as_asgi()),
    re_path(r'^ws/personalised/$', PersonalisedConsumer.as_asgi()),
    re_path(r'^ws/vr/(?P<resource_id>\d+)/$', VRTutorConsumer.as_asgi()),
]
