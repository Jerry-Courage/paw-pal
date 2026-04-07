import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Workspace, WorkspaceBlock, WorkspaceMessage
from .serializers import WorkspaceBlockSerializer, WorkspaceMessageSerializer

class WorkspaceConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.workspace_id = self.scope['url_route']['kwargs']['workspace_id']
        self.room_group_name = f'workspace_{self.workspace_id}'
        self.user = self.scope['user']

        if self.user.is_anonymous:
            await self.close()
        else:
            # Join room group
            await self.channel_layer.group_add(
                self.room_group_name,
                self.channel_name
            )
            await self.accept()

            # Notify others of presence
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
        # Notify others of presence
        if not self.user.is_anonymous:
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'presence_update',
                    'user_id': self.user.id,
                    'status': 'offline'
                }
            )

        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    # Receive message from WebSocket
    async def receive(self, text_data):
        data = json.loads(text_data)
        message_type = data.get('type')

        if message_type == 'block_update':
            await self.handle_block_update(data)
        elif message_type == 'chat_message':
            await self.handle_chat_message(data)
        elif message_type == 'presence_focus':
            await self.handle_presence_focus(data)
        elif message_type == 'block_lock':
            await self.handle_block_lock(data)
        elif message_type == 'block_unlock':
            await self.handle_block_unlock(data)

    async def handle_block_lock(self, data):
        block_id = data.get('block_id')
        # Broadcast that this block is now locked by this user
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_block_lock',
                'block_id': block_id,
                'user_id': self.user.id,
                'user_name': self.user.username
            }
        )

    async def handle_block_unlock(self, data):
        block_id = data.get('block_id')
        # Broadcast that this block is now unlocked
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_block_unlock',
                'block_id': block_id,
                'user_id': self.user.id
            }
        )

    async def handle_block_update(self, data):
        block_id = data.get('block_id')
        content = data.get('content')
        
        # Broadcast to others (don't save to DB here for max performance, 
        # assume the REST API call handles the persistent save)
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_block_update',
                'block_id': block_id,
                'content': content,
                'sender_id': self.user.id
            }
        )

    async def handle_chat_message(self, data):
        content = data.get('content')
        
        # Broadcast to others
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_chat_message',
                'content': content,
                'author_name': self.user.username,
                'author_id': self.user.id,
                'is_ai': False, # Manual messages are not AI
                'created_at': data.get('created_at')
            }
        )

    async def handle_presence_focus(self, data):
        block_id = data.get('block_id')
        
        # Notify others which block this user is focusing on
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_presence_focus',
                'user_id': self.user.id,
                'user_name': self.user.username,
                'block_id': block_id
            }
        )

    # ─── BROADCAST HANDLERS ──────────────────────────────────────────────────

    async def broadcast_block_update(self, event):
        if self.user.id != event['sender_id']:
            await self.send(text_data=json.dumps(event))

    async def broadcast_chat_message(self, event):
        if self.user.id != event['author_id']:
            await self.send(text_data=json.dumps(event))

    async def broadcast_presence_focus(self, event):
        if self.user.id != event['user_id']:
            await self.send(text_data=json.dumps(event))

    async def broadcast_block_lock(self, event):
        if self.user.id != event['user_id']:
            await self.send(text_data=json.dumps(event))

    async def broadcast_block_unlock(self, event):
        if self.user.id != event['user_id']:
            await self.send(text_data=json.dumps(event))

    async def presence_update(self, event):
        if self.user.id != event.get('user_id'):
            await self.send(text_data=json.dumps(event))
