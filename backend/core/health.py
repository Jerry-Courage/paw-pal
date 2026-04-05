from django.http import JsonResponse
from django.db import connection
from django.utils import timezone


def health_check(request):
    """Health check endpoint for load balancers and monitoring."""
    try:
        connection.ensure_connection()
        db_ok = True
    except Exception:
        db_ok = False

    status = 'healthy' if db_ok else 'degraded'
    code = 200 if db_ok else 503

    return JsonResponse({
        'status': status,
        'timestamp': timezone.now().isoformat(),
        'database': 'ok' if db_ok else 'error',
        'version': '1.0.0',
    }, status=code)
