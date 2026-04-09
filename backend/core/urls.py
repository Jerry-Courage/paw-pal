from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from .health import health_check
from assignments.views import AssignmentViewSet

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('users.urls')),
    path('api/library/', include('library.urls')),
    path('api/ai/', include('ai_assistant.urls')),
    path('api/groups/', include('groups.urls')),
    path('api/planner/', include('planner.urls')),
    path('api/community/', include('community.urls')),
    path('api/assignments/<int:pk>/export/', AssignmentViewSet.as_view({'get': 'export'})),
    path('api/assignments/', include('assignments.urls')),
    path('api/workspace/', include('workspace.urls')),
    path('health/', health_check, name='health'),
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
