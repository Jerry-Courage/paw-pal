from rest_framework import serializers
from .models import ChatSession, ChatMessage


class ChatMessageSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()
    diagram = serializers.CharField(source='diagram_code', read_only=True)

    class Meta:
        model = ChatMessage
        fields = ('id', 'role', 'content', 'image', 'diagram', 'diagram_code', 'created_at')
        read_only_fields = ('id', 'created_at')

    def get_image(self, obj):
        if not obj.image:
            return None
        if obj.image.startswith('http') or obj.image.startswith('data:'):
            return obj.image
        # If it's a relative path (local upload), make it absolute
        request = self.context.get('request')
        if request is not None:
            return request.build_absolute_uri(obj.image)
        return obj.image


class ChatSessionSerializer(serializers.ModelSerializer):
    messages = ChatMessageSerializer(many=True, read_only=True)
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = ChatSession
        fields = ('id', 'context_type', 'resource', 'group', 'title', 'messages', 'last_message', 'created_at', 'updated_at')
        read_only_fields = ('id', 'created_at', 'updated_at')

    def get_last_message(self, obj):
        msg = obj.messages.last()
        if msg:
            return {'role': msg.role, 'content': msg.content[:100]}
        return None
