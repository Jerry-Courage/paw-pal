import json
import asyncio
import logging
from django.http import StreamingHttpResponse
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, AuthenticationFailed
from .models import Resource
from asgiref.sync import sync_to_async

logger = logging.getLogger('flowstate')

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

    def get(self, request):
        user = request.user

        async def event_stream():
            max_duration = 600  # 10 minutes for large documents
            poll_interval = 2   # check DB every 2 seconds
            elapsed = 0
            last_states = {} # key: resource_id, value: (status, progress)

            # Initial Snapshot
            try:
                resources = await sync_to_async(list)(Resource.objects.filter(owner=user).values('id', 'status', 'title', 'processing_progress', 'status_text'))
                initial_data = [{'id': r['id'], 'status': r['status'], 'title': r['title'], 'progress': r['processing_progress'], 'text': r['status_text']} for r in resources]
                last_states = {r['id']: (r['status'], r['progress'], r['text']) for r in initial_data}
                yield f"event: snapshot\ndata: {json.dumps(initial_data)}\n\n"
            except Exception as e:
                logger.error(f'SSE snapshot error: {e}')
                yield f"event: error\ndata: {json.dumps({'message': str(e)})}\n\n"
                return

            while elapsed < max_duration:
                await asyncio.sleep(poll_interval)
                elapsed += poll_interval

                try:
                    resources = await sync_to_async(list)(Resource.objects.filter(owner=user).values('id', 'status', 'title', 'processing_progress', 'status_text'))
                    changed = []
                    current_states = {}
                    
                    for r in resources:
                        # Map DB field names to short stream names
                        state_tuple = (r['status'], r['processing_progress'], r['status_text'])
                        current_states[r['id']] = state_tuple
                        
                        if last_states.get(r['id']) != state_tuple:
                            changed.append({
                                'id': r['id'], 
                                'status': r['status'], 
                                'title': r['title'], 
                                'progress': r['processing_progress'],
                                'text': r['status_text']
                            })
                    
                    last_states = current_states

                    if changed:
                        yield f"event: status\ndata: {json.dumps(changed)}\n\n"

                    # Close if everything is idle
                    if current_states and all(s[0] in ['ready', 'error'] for s in current_states.values()):
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
