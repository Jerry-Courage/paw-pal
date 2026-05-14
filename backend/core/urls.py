import os
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from .media_server import mediacors_serve
from .health import health_check

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/assignments/', include('assignments.urls')),
    path('api/identity-engine/', include('users.urls')),
    path('api/auth/', include('users.urls')),
    path('api/library/', include('library.urls')),
    path('api/ai/', include('ai_assistant.urls')),
    path('api/groups/', include('groups.urls')),
    path('api/planner/', include('planner.urls')),
    path('api/community/', include('community.urls')),
    path('api/workspace/', include('workspace.urls')),
    path('health/', health_check, name='health'),
    path('', health_check, name='root_health'),
    re_path(r'^media/(?P<path>.*)$', mediacors_serve, {'document_root': settings.MEDIA_ROOT}),
    re_path(r'^agent_responses/(?P<path>.*)$', mediacors_serve, {'document_root': os.path.join(settings.MEDIA_ROOT, 'agent_responses')}),
]
