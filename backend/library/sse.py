import json
import asyncio
import logging
from django.http import StreamingHttpResponse
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, AuthenticationFailed
from rest_framework.renderers import BaseRenderer
from .models import Resource
from .processing_status import status_payload
from asgiref.sync import sync_to_async

logger = logging.getLogger('nitemind')

class EventStreamRenderer(BaseRenderer):
    media_type = 'text/event-stream'
    format = 'event-stream'
    charset = None
    render_style = 'binary'

class QueryParameterJWTAuthentication(JWTAuthentication):
    """
    Custom authentication to allow JWT tokens in the query string.
    Crucial for EventSource (SSE) which doesn't support custom headers.
    """
    def authenticate(self, request):
        token = request.query_params.get('token')
        if not token:
            return None
        
        try:
            validated_token = self.get_validated_token(token)
            return self.get_user(validated_token), validated_token
        except (InvalidToken, AuthenticationFailed):
            return None

class ResourceStatusSSEView(APIView):
    authentication_classes = [JWTAuthentication, QueryParameterJWTAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [EventStreamRenderer]

    def get(self, request):
        user = request.user

        async def event_stream():
            max_duration = 600  # 10 minutes for large documents
            poll_interval = 2   # check DB every 2 seconds
            elapsed = 0
            last_states = {}

            # Initial Snapshot — include has_study_kit so frontend can gate correctly
            try:
                resources = await sync_to_async(list)(
                    Resource.objects.filter(owner=user)
                    .values('id', 'status', 'processing_progress', 'status_text', 'has_study_kit')
                )
                initial_data = [status_payload(r) for r in resources]
                last_states = {
                    r['id']: (r['status'], r['progress'], r['message'], r['ready'])
                    for r in initial_data
                }
                yield f"event: snapshot\ndata: {json.dumps(initial_data)}\n\n"
            except Exception as e:
                logger.error(f'SSE snapshot error: {e}')
                yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
                return

            while elapsed < max_duration:
                await asyncio.sleep(poll_interval)
                elapsed += poll_interval

                try:
                    resources = await sync_to_async(list)(
                        Resource.objects.filter(owner=user)
                        .values('id', 'status', 'processing_progress', 'status_text', 'has_study_kit')
                    )
                    changed = []
                    current_states = {}

                    for r in resources:
                        state_tuple = (r['status'], r['processing_progress'], r['status_text'], r['has_study_kit'])
                        current_states[r['id']] = state_tuple

                        if last_states.get(r['id']) != state_tuple:
                            changed.append(status_payload(r))

                    last_states = current_states

                    if changed:
                        yield f"event: status\ndata: {json.dumps(changed)}\n\n"

                    # Close stream only when every resource is status=ready/error/failed
                    # AND has_study_kit=True (kit was actually written).
                    if current_states and all(
                        s[0] in ['ready', 'error', 'failed']
                        for s in current_states.values()
                    ):
                        all_kits_ready = all(
                            # error/failed resources don't need a kit; ready ones must have it
                            s[0] in ['error', 'failed'] or s[3] is True
                            for s in current_states.values()
                        )
                        if all_kits_ready:
                            yield f"event: done\ndata: {json.dumps({'message': 'All resources ready'})}\n\n"
                            return

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
