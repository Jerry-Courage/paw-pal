from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from .health import health_check
def mediacors_serve(request, path, document_root=None, show_indexes=False):
    response = serve(request, path, document_root, show_indexes)
    response["Access-Control-Allow-Origin"] = "*"
    response["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
    response["X-Content-Type-Options"] = "nosniff"
    
    # Disguise the file type to bypass Download Manager interceptors (IDM, etc.)
    # We serve as octet-stream so IDM doesn't "recognize" it as a PDF
    if path.lower().endswith('.pdf'):
        response["Content-Type"] = "application/octet-stream"
        # Remove Content-Disposition which can also trigger downloaders
        if "Content-Disposition" in response:
            del response["Content-Disposition"]
            
    return response

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/assignments/', include('assignments.urls')),
    path('api/identity-engine/', include('users.urls')),
    path('api/library/', include('library.urls')),
    path('api/ai/', include('ai_assistant.urls')),
    path('api/groups/', include('groups.urls')),
    path('api/planner/', include('planner.urls')),
    path('api/community/', include('community.urls')),
    path('api/workspace/', include('workspace.urls')),
    path('health/', health_check, name='health'),
    re_path(r'^media/(?P<path>.*)$', mediacors_serve, {'document_root': settings.MEDIA_ROOT}),
]
