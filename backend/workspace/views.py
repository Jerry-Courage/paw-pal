import logging
import os
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

logger = logging.getLogger('nitemind')

class WorkspaceViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Workspace.objects.filter(members=self.request.user, is_active=True)

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return WorkspaceDetailSerializer
        return WorkspaceSerializer

    def retrieve(self, request, *args, **kwargs):
        """Mark workspace as read when user opens it."""
        instance = self.get_object()
        # Update last_seen to now — clears unread badge
        WorkspaceMember.objects.filter(workspace=instance, user=request.user).update(last_seen=timezone.now())
        return super().retrieve(request, *args, **kwargs)

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
        if instance.owner_id != request.user.id:
            return Response(
                {"error": "Only the creator can decommission this Collab Space."}, 
                status=status.HTTP_403_FORBIDDEN
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def leave(self, request, pk=None):
        """Member departure protocol."""
        ws = self.get_object()
        if ws.owner_id == request.user.id:
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
        
        # Mark as Read: Update last_seen for the current user
        member = ws.memberships.filter(user=request.user).first()
        if member:
            member.last_seen = timezone.now()
            member.save(update_fields=['last_seen'])
            
        msgs = ws.messages.all().order_by('created_at')
        return Response(WorkspaceMessageSerializer(msgs, many=True).data)

    def post(self, request, workspace_id):
        ws = get_object_or_404(Workspace, id=workspace_id, members=request.user)
        content = request.data.get('content', '').strip()
        audio_file = request.FILES.get('audio')
        attachment_file = request.FILES.get('attachment')
        attachment_type = request.data.get('attachment_type')
        
        if not content and not audio_file and not attachment_file:
            return Response({'error': 'Content, audio, or attachment required.'}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Save user message
        parent_id = request.data.get('parent_id')
        msg = WorkspaceMessage.objects.create(
            workspace=ws, 
            author=request.user, 
            content=content or ("Voice Note" if audio_file else "Attachment"),
            audio_file=audio_file,
            attachment=attachment_file,
            attachment_type=attachment_type,
            parent_id=parent_id
        )

        # 4. Neural Transcription (Background Transcription)
        if audio_file:
            ai = AIService()
            transcript = ai.transcribe_audio(msg.audio_file.path)
            if transcript:
                msg.content = transcript
                msg.save()
                content = transcript # Update local content for AI trigger check
        
        # 5. MENTIONS & NOTIFICATIONS
        from users.notifications import create_notification
        from django.contrib.auth import get_user_model
        User = get_user_model()
        
        # A. Handle @Mentions
        mentioned_usernames = re.findall(r'@(\w+)', content)
        for username in mentioned_usernames:
            mentioned_user = User.objects.filter(username=username).first()
            if mentioned_user and mentioned_user.id != request.user.id:
                create_notification(
                    mentioned_user, 'group',
                    f"Mentioned in {ws.name}",
                    f"{request.user.username} mentioned you in the {ws.name} collab space.",
                    f"/workspace/{ws.id}"
                )
        
        # B. Handle Replies
        if parent_id:
            try:
                parent_msg = WorkspaceMessage.objects.get(id=parent_id)
                if parent_msg.author_id and parent_msg.author_id != request.user.id:
                    create_notification(
                        parent_msg.author, 'group',
                        f"Reply in {ws.name}",
                        f"{request.user.username} replied to your message in {ws.name}.",
                        f"/workspace/{ws.id}"
                    )
            except: pass

        # 6. Broadcast user message (with transcript if available)
        self._broadcast(ws.id, msg)

        # 7. AI Name Check & Thread Intelligence
        is_reply_to_ai = False
        if parent_id:
            try:
                parent_msg = WorkspaceMessage.objects.get(id=parent_id)
                if parent_msg.is_ai:
                    is_reply_to_ai = True
            except: pass

        # Wake word detection — covers both typed and STT-transcribed variants.
        # STT commonly transcribes "NITE" as: night, knight, ignite, unite, etc.
        # We only trigger when used as a direct address/name, not in normal sentences
        # like "good night", "last night", "knight in armor", etc.
        wake_words = (
            r'\b(flow(?:ai|state)?|flow\s+ai|flow\s+state)\b'         # typed: flow, flowai, flowstate
            r'|(?:^|[\s,!?])(?:hey|yo|ok|okay|hi)\s+(flow|flowai|flowstate)\b'  # hey/yo flow
            r'|\b(nite(?:ai|mind)?|nite\s+ai|nite\s+mind)\b'           # legacy/brand: nite
            r'|(?:^|[\s,!?])(?:hey|yo|ok|okay|hi)\s+(nite|night|niteai|nitemind)\b'
            r'|\b(night\s*ai|night\s*mind|nightmind)\b'                # STT
            r'|\bflow[,!?]'                                             # flow followed by punctuation
            r'|\bassistant\b'                                           # generic
        )
        if is_reply_to_ai or re.search(wake_words, content, re.IGNORECASE):
            self._trigger_ai_response(ws, content, request.user, is_audio_trigger=bool(audio_file), msg=msg)

        return Response(WorkspaceMessageSerializer(msg, context={'request': request}).data)

    def _broadcast(self, workspace_id, msg):
        """Helper to send message data to all workspace subscribers via Channels."""
        layer = get_channel_layer()
        # Manually serialize to ensure absolute URLs in broadcast
        data = WorkspaceMessageSerializer(msg).data
        if msg.audio_file:
            # Build absolute URL using the configured backend URL
            # Fall back to BACKEND_URL → API_URL → relative path
            backend_url = (
                os.environ.get('BACKEND_URL') or
                os.environ.get('RENDER_EXTERNAL_URL') or
                getattr(settings, 'API_URL', 'http://localhost:8000')
            ).rstrip('/')
            data['audio_file'] = f"{backend_url}{msg.audio_file.url}"
            
        if msg.attachment:
            backend_url = (
                os.environ.get('BACKEND_URL') or
                os.environ.get('RENDER_EXTERNAL_URL') or
                getattr(settings, 'API_URL', 'http://localhost:8000')
            ).rstrip('/')
            data['attachment'] = f"{backend_url}{msg.attachment.url}"
        
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
                    {'type': 'broadcast_typing', 'is_typing': True, 'user': 'Flow AI'}
                )

                ai = AIService()
                
                # 3. Knowledge Retrieval & Chat
                ws_library_context = ai.get_workspace_library_context(workspace)
                
                system_prompt = (
                    f"{FLOWAI_SYSTEM_PROMPT}\n\n"
                    f"TEAMMATE MODE (CRITICAL):\n"
                    f"- You are a peer in the '{workspace.name}' study group. Talk like a real person, not a bot.\n"
                    f"- NO UNPROMPTED SUMMARIES: Never summarize or 'recap' previous messages unless explicitly asked to 'summarize' or 'give a recap'.\n"
                    f"- BE EXTREMELY BRIEF: Keep responses to 1 snappy sentence if possible. Maximum 2. \n"
                    f"- NO MONOLOGUES: If the user just says 'Flow' or mentions you without a specific question, just give a quick, witty acknowledgement like 'I'm here, what's up?' or 'Ready to crush this. What do you need?'"
                )
                
                if ws_library_context:
                    system_prompt += (
                        f"\n\nSHARED KNOWLEDGE BASE:\n{ws_library_context}\n\n"
                        "Refer to this shared context ONLY if the group asks about their shared notes or resources."
                    )
                
                # Get history
                recent = workspace.messages.all().order_by('-created_at')[:10]
                history = [{'role': 'assistant' if m.is_ai else 'user', 'content': m.content} for m in reversed(recent)]
                
                reply = ai.collab_chat_sync([{'role': 'system', 'content': system_prompt}] + history)
                
                # 4. Mode Mirroring (Voice Decision)
                should_vocalize = is_audio_trigger
                audio_path = None

                if should_vocalize:
                    from ai_assistant.podcast import generate_tts_file
                    import os, tempfile, base64

                    voice = "en-US-AndrewNeural"
                    tts_text = reply if len(reply) < 300 else reply[:297] + "..."
                    try:
                        # Write to a temp file, read back as base64, store as data URI
                        with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as tmp:
                            tmp_path = tmp.name

                        if generate_tts_file(tts_text, voice, tmp_path):
                            with open(tmp_path, 'rb') as f:
                                encoded = base64.b64encode(f.read()).decode('utf-8')
                            os.unlink(tmp_path)
                            # Save as data URI — no filesystem dependency
                            audio_path = f"data:audio/mpeg;base64,{encoded}"
                            logger.info(f"[Workspace TTS] Generated voice note as data URI for workspace {workspace.id}")
                        else:
                            logger.error(f"[Workspace TTS] generate_tts_file returned False")
                    except Exception as tts_err:
                        logger.error(f"[Workspace TTS] Failed: {tts_err}")

                # 5. Save & Broadcast Real Response
                ai_msg = WorkspaceMessage.objects.create(
                    workspace=workspace,
                    content=reply,
                    is_ai=True,
                    audio_data=audio_path if audio_path and audio_path.startswith('data:') else None,
                    audio_file=audio_path if audio_path and not audio_path.startswith('data:') else None,
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
                        {'type': 'broadcast_typing', 'is_typing': False, 'user': 'Flow AI'}
                    )
                except: pass
                close_old_connections()

        try:
            thread = threading.Thread(target=ai_task)
            thread.daemon = True
            thread.start()
        except Exception as e:
            logger.error(f"Failed to start AI thread: {e}")

class WorkspaceMessageDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, workspace_id, pk):
        ws = get_object_or_404(Workspace, id=workspace_id, members=request.user)
        msg = get_object_or_404(WorkspaceMessage, id=pk, workspace=ws, author=request.user)
        
        content = request.data.get('content', '').strip()
        if not content:
            return Response({'error': 'Content required.'}, status=status.HTTP_400_BAD_REQUEST)
            
        msg.content = content
        msg.save()
        
        self._broadcast_edit(ws.id, msg)
        return Response(WorkspaceMessageSerializer(msg, context={'request': request}).data)

    def delete(self, request, workspace_id, pk):
        ws = get_object_or_404(Workspace, id=workspace_id, members=request.user)
        msg = get_object_or_404(WorkspaceMessage, id=pk, workspace=ws)
        
        if msg.author_id != request.user.id and ws.owner_id != request.user.id:
             return Response({'error': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
             
        msg_id = msg.id
        msg.delete()
        
        self._broadcast_delete(ws.id, msg_id)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _broadcast_edit(self, workspace_id, msg):
        layer = get_channel_layer()
        async_to_sync(layer.group_send)(
            f'workspace_{workspace_id}',
            {
                'type': 'broadcast_chat_message_edit',
                'message': WorkspaceMessageSerializer(msg).data
            }
        )

    def _broadcast_delete(self, workspace_id, message_id):
        layer = get_channel_layer()
        async_to_sync(layer.group_send)(
            f'workspace_{workspace_id}',
            {
                'type': 'broadcast_chat_message_delete',
                'message_id': message_id
            }
        )
