import logging
import re
import threading
from django.shortcuts import get_object_or_404
from django.conf import settings
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.views import APIView
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from .models import Workspace, WorkspaceMember, WorkspaceMessage
from .serializers import (
    WorkspaceSerializer, WorkspaceDetailSerializer, WorkspaceMemberSerializer,
    WorkspaceMessageSerializer
)
from library.models import Resource
from ai_assistant.services import AIService, FLOWAI_SYSTEM_PROMPT

logger = logging.getLogger('flowstate')

class WorkspaceViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Workspace.objects.filter(members=self.request.user, is_active=True)

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return WorkspaceDetailSerializer
        return WorkspaceSerializer

    def perform_create(self, serializer):
        ws = serializer.save(owner=self.request.user)
        WorkspaceMember.objects.create(workspace=ws, user=self.request.user, role='owner')

    @action(detail=False, methods=['post'])
    def join(self, request):
        code = request.data.get('invite_code', '').strip().upper()
        ws = get_object_or_404(Workspace, invite_code=code, is_active=True)
        member, created = WorkspaceMember.objects.get_or_create(
            workspace=ws, user=request.user,
            defaults={'role': 'editor'}
        )
        return Response(WorkspaceSerializer(ws, context={'request': request}).data)

    def destroy(self, request, *args, **kwargs):
        """Owner-only Deletion Protocol."""
        instance = self.get_object()
        if instance.owner != request.user:
            return Response(
                {"error": "Only the creator can decommission this Collab Space."}, 
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def leave(self, request, pk=None):
        """Member departure protocol."""
        ws = self.get_object()
        if ws.owner == request.user:
            return Response(
                {"error": "Creators cannot leave. Use 'Delete' to decommission the space."}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        member = WorkspaceMember.objects.filter(workspace=ws, user=request.user).first()
        if not member:
            return Response({"error": "You are not a member of this space."}, status=status.HTTP_404_NOT_FOUND)
            
        member.delete()
        return Response({"message": "You have left the Collab Space."})

    @action(detail=True, methods=['post'])
    def share_resource(self, request, pk=None):
        workspace = self.get_object()
        resource_id = request.data.get('resource_id')
        resource = get_object_or_404(Resource, id=resource_id, owner=request.user)
        
        workspace.resources.add(resource)
        
        # Create a "System" message about the shared resource
        msg = WorkspaceMessage.objects.create(
            workspace=workspace,
            author=request.user,
            content=f"shared a note: **{resource.title}**",
            pinned_resource=resource
        )
        
        # Broadcast via WebSocket (Handled in Consumer usually, but we can trigger it here)
        self._broadcast_message(workspace.id, msg)
        
        return Response(WorkspaceMessageSerializer(msg).data)

    def _broadcast_message(self, workspace_id, msg):
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        layer = get_channel_layer()
        async_to_sync(layer.group_send)(
            f'workspace_{workspace_id}',
            {
                'type': 'broadcast_chat_message',
                'message': WorkspaceMessageSerializer(msg).data
            }
        )


class WorkspaceMessageView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        ws = get_object_or_404(Workspace, id=workspace_id, members=request.user)
        msgs = ws.messages.all().order_by('created_at')
        return Response(WorkspaceMessageSerializer(msgs, many=True).data)

    def post(self, request, workspace_id):
        ws = get_object_or_404(Workspace, id=workspace_id, members=request.user)
        content = request.data.get('content', '').strip()
        audio_file = request.FILES.get('audio')
        
        if not content and not audio_file:
            return Response({'error': 'Content or audio required.'}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Save user message
        parent_id = request.data.get('parent_id')
        msg = WorkspaceMessage.objects.create(
            workspace=ws, 
            author=request.user, 
            content=content or "Voice Note",
            audio_file=audio_file,
            parent_id=parent_id
        )

        # 2. Neural Transcription (Background Transcription)
        if audio_file:
            ai = AIService()
            transcript = ai.transcribe_audio(msg.audio_file.path)
            if transcript:
                msg.content = transcript
                msg.save()
                content = transcript # Update local content for AI trigger check
        
        # 3. Broadcast user message (with transcript if available)
        self._broadcast(ws.id, msg)

        # 4. AI Name Check & Thread Intelligence
        # We listen for wake words OR if the user is replying to an AI message
        is_reply_to_ai = False
        if parent_id:
            try:
                parent_msg = WorkspaceMessage.objects.get(id=parent_id)
                if parent_msg.is_ai:
                    is_reply_to_ai = True
            except: pass

        wake_words = r'\b(flow|flo|flowai|flowstate|assistant|hey flow|hey flo|yo flow|yo flo)\b'
        if is_reply_to_ai or re.search(wake_words, content, re.IGNORECASE):
            self._trigger_ai_response(ws, content, request.user, is_audio_trigger=bool(audio_file), msg=msg)

        return Response(WorkspaceMessageSerializer(msg, context={'request': request}).data)

    def _broadcast(self, workspace_id, msg):
        """Helper to send message data to all workspace subscribers via Channels."""
        layer = get_channel_layer()
        # Manually serialize to ensure absolute URLs in broadcast
        data = WorkspaceMessageSerializer(msg).data
        if msg.audio_file:
            data['audio_file'] = f"{settings.API_URL}{msg.audio_file.url}"
        
        try:
            async_to_sync(layer.group_send)(
                f'workspace_{workspace_id}',
                {
                    'type': 'broadcast_chat_message',
                    'message': data
                }
            )
        except Exception as e:
            logger.debug(f"Broadcast failed (likely client disconnected): {e}")

    def _trigger_ai_response(self, workspace, content, user, is_audio_trigger=False, msg=None):
        import threading
        from django.db import close_old_connections
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        from django.conf import settings
        from django.utils import timezone

        def ai_task():
            layer = get_channel_layer()
            try:
                # 1. Thread safety for database
                close_old_connections()
                
                # 2. Typing Indicator Start
                async_to_sync(layer.group_send)(
                    f'workspace_{workspace.id}',
                    {'type': 'broadcast_typing', 'is_typing': True, 'user': 'FlowAI'}
                )

                ai = AIService()
                
                # 3. Knowledge Retrieval & Chat
                ws_library_context = ai.get_workspace_library_context(workspace)
                
                system_prompt = (
                    f"{FLOWAI_SYSTEM_PROMPT}\n\n"
                    f"WORKSPACE CONTEXT: You are in the '{workspace.name}' collab space. "
                )
                
                if ws_library_context:
                    system_prompt += (
                        f"\n\nSHARED KNOWLEDGE BASE:\n{ws_library_context}\n\n"
                        "Use the above shared library context as your ground truth for this space. "
                        "When students ask about 'our notes' or 'shared resources', refer to this data."
                    )
                
                # Get history
                recent = workspace.messages.all().order_by('-created_at')[:10]
                history = [{'role': 'assistant' if m.is_ai else 'user', 'content': m.content} for m in reversed(recent)]
                
                reply = ai.collab_chat([{'role': 'system', 'content': system_prompt}] + history)
                
                # 4. Mode Mirroring (Voice Decision)
                should_vocalize = is_audio_trigger
                audio_path = None
                
                if should_vocalize:
                    from ai_assistant.podcast import generate_tts_file
                    import os
                    voice = "en-US-AndrewNeural"
                    filename = f"flow_vn_{workspace.id}_{int(timezone.now().timestamp())}.mp3"
                    rel_path = os.path.join('workspace_audio', filename)
                    full_path = os.path.join(settings.MEDIA_ROOT, rel_path)
                    
                    # Ensure directory exists
                    os.makedirs(os.path.dirname(full_path), exist_ok=True)
                    
                    tts_text = reply if len(reply) < 300 else reply[:297] + "..."
                    if generate_tts_file(tts_text, voice, full_path):
                        audio_path = rel_path

                # 5. Save & Broadcast Real Response
                ai_msg = WorkspaceMessage.objects.create(
                    workspace=workspace,
                    content=reply,
                    is_ai=True,
                    audio_file=audio_path,
                    parent_id=msg.id if msg else None
                )
                
                # Use class method for clean broadcast
                self._broadcast(workspace.id, ai_msg)

            except Exception as e:
                logger.error(f"AI Workspace Task failed: {e}")
            finally:
                # 6. Housekeeping
                try:
                    async_to_sync(layer.group_send)(
                        f'workspace_{workspace.id}',
                        {'type': 'broadcast_typing', 'is_typing': False, 'user': 'FlowAI'}
                    )
                except: pass
                close_old_connections()

        try:
            thread = threading.Thread(target=ai_task)
            thread.daemon = True
            thread.start()
        except Exception as e:
            logger.error(f"Failed to start AI thread: {e}")
