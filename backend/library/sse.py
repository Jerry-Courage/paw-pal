"""
Server-Sent Events endpoint for real-time resource processing status.
The frontend subscribes once and receives push updates as resources move
from 'processing' → 'ready' (or 'error'), replacing polling entirely.
"""
import json
import time
import logging
from django.http import StreamingHttpResponse
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.exceptions import AuthenticationFailed
from .models import Resource

logger = logging.getLogger('flowstate')


class ResourceStatusSSEView(APIView):
    """
    GET /api/library/resources/status-stream/
    Streams resource status changes as SSE events.
    Clients receive a 'status' event whenever any of their resources
    change state. Connection closes automatically after 5 minutes.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        def event_stream():
            max_duration = 300  # 5 minutes
            poll_interval = 3   # check DB every 3 seconds
            elapsed = 0
            last_states = {}

            # Send initial snapshot
            try:
                resources = Resource.objects.filter(owner=user).values('id', 'status', 'title')
                initial_data = [{'id': r['id'], 'status': r['status'], 'title': r['title']} for r in resources]
                last_states = {r['id']: r['status'] for r in initial_data}
                yield f"event: snapshot\ndata: {json.dumps(initial_data)}\n\n"
            except Exception as e:
                logger.error(f'SSE snapshot error: {e}')
                yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
                return

            while elapsed < max_duration:
                time.sleep(poll_interval)
                elapsed += poll_interval

                try:
                    resources = Resource.objects.filter(owner=user).values('id', 'status', 'title')
                    changed = []
                    current_states = {}
                    for r in resources:
                        current_states[r['id']] = r['status']
                        if last_states.get(r['id']) != r['status']:
                            changed.append({'id': r['id'], 'status': r['status'], 'title': r['title']})
                    last_states = current_states

                    if changed:
                        yield f"event: status\ndata: {json.dumps(changed)}\n\n"

                    # If no resources are still processing, close the stream
                    if all(s == 'ready' or s == 'error' for s in current_states.values()):
                        yield f"event: done\ndata: {json.dumps({'message': 'All resources ready'})}\n\n"
                        return

                    # Heartbeat to keep connection alive
                    yield f"event: heartbeat\ndata: {json.dumps({'t': elapsed})}\n\n"

                except Exception as e:
                    logger.error(f'SSE stream error: {e}')
                    yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
                    return

            yield f"event: timeout\ndata: {json.dumps({'message': 'Stream timeout'})}\n\n"

        response = StreamingHttpResponse(event_stream(), content_type='text/event-stream')
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response
