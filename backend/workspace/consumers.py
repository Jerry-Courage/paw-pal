import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Workspace, WorkspaceMember, WorkspaceMessage
from .serializers import WorkspaceMessageSerializer

class WorkspaceConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.workspace_id = self.scope['url_route']['kwargs']['workspace_id']
        self.room_group_name = f'workspace_{self.workspace_id}'
        self.user = self.scope['user']

        if self.user.is_anonymous:
            await self.close()
        else:
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )
            await self.accept()

            # Broadcast JOIN
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'presence_update',
                    'user_id': self.user.id,
                    'user_name': self.user.username,
                    'status': 'online'
                }
            )

    async def disconnect(self, close_code):
        if not self.user.is_anonymous:
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'presence_update',
                    'user_id': self.user.id,
                    'status': 'offline'
                }
            )

        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        data = json.loads(text_data)
        message_type = data.get('type')

        if message_type == 'chat_message':
            await self.handle_chat_message(data)
        elif message_type == 'typing_status':
            await self.handle_typing(data)

    async def handle_typing(self, data):
        # Broadcast typing status to everyone else in the group
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_typing',
                'user': f"{self.user.first_name} {self.user.last_name}" if self.user.first_name else self.user.username,
                'is_typing': data.get('is_typing', False)
            }
        )

    async def handle_chat_message(self, data):
        # In a real app, we might save to DB here, 
        # but our View handles the save, so we just broadcast.
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_chat_message',
                'message': data.get('message') # Full serialized message from View
            }
        )

    async def broadcast_chat_message(self, event):
        # Send to all workers in the room
        await self.send(text_data=json.dumps(event))

    async def broadcast_typing(self, event):
        await self.send(text_data=json.dumps(event))

    async def presence_update(self, event):
        await self.send(text_data=json.dumps(event))
