from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Workspace, WorkspaceMember, WorkspaceMessage
from library.serializers import ResourceSerializer
from assignments.models import Assignment

User = get_user_model()

class UserMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'avatar']


class WorkspaceMemberSerializer(serializers.ModelSerializer):
    user = UserMinimalSerializer(read_only=True)
    
    class Meta:
        model = WorkspaceMember
        fields = ['id', 'user', 'role', 'joined_at', 'last_seen']


class MinimalAssignmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Assignment
        fields = ['id', 'title', 'subject']


class WorkspaceMessageSerializer(serializers.ModelSerializer):
    author = UserMinimalSerializer(read_only=True)
    pinned_resource_data = ResourceSerializer(source='pinned_resource', read_only=True)
    shared_assignment_data = MinimalAssignmentSerializer(source='shared_assignment', read_only=True)
    author_name = serializers.SerializerMethodField()
    author_initials = serializers.SerializerMethodField()
    parent_data = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceMessage
        fields = ['id', 'author', 'author_name', 'author_initials', 'content', 'is_ai', 'pinned_resource', 'pinned_resource_data', 'shared_assignment', 'shared_assignment_data', 'audio_file', 'parent', 'parent_data', 'created_at']

    def get_parent_data(self, obj):
        if obj.parent:
            parent = obj.parent
            author_name = 'FlowAI' if parent.is_ai else (parent.author.get_full_name() or parent.author.username if parent.author else 'Unknown')
            return {
                'id': parent.id,
                'author_name': author_name,
                'content': parent.content[:100] + ('...' if len(parent.content) > 100 else '')
            }
        return None

    def get_author_name(self, obj):
        if obj.is_ai:
            return 'FlowAI'
        return obj.author.get_full_name() or obj.author.username if obj.author else 'Unknown'

    def get_author_initials(self, obj):
        if obj.is_ai:
            return 'AI'
        if obj.author:
            name = obj.author.get_full_name() or obj.author.username
            parts = name.split()
            return ''.join(p[0].upper() for p in parts[:2])
        return '?'


class WorkspaceDetailSerializer(serializers.ModelSerializer):
    members = WorkspaceMemberSerializer(source='memberships', many=True, read_only=True)
    messages = serializers.SerializerMethodField()

    def get_messages(self, obj):
        # Optimization: Only return the latest 50 messages to prevent loading lag
        msgs = obj.messages.all().order_by('-created_at')[:50]
        # Return in chronological order
        return WorkspaceMessageSerializer(reversed(msgs), many=True, context=self.context).data
    resources = ResourceSerializer(many=True, read_only=True)
    is_owner = serializers.SerializerMethodField()
    my_role = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = [
            'id', 'name', 'subject', 'description', 
            'owner', 'members', 'invite_code', 
            'resources', 'messages', 'is_active', 
            'is_owner', 'my_role', 'created_at', 'updated_at'
        ]

    def get_is_owner(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.owner == request.user
        return False

    def get_my_role(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        m = obj.memberships.filter(user=request.user).first()
        return m.role if m else None


class WorkspaceSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(source='members.count', read_only=True)
    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = [
            'id', 'name', 'subject', 'description', 
            'is_active', 'member_count', 'is_owner', 
            'created_at', 'updated_at'
        ]

    def get_is_owner(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.owner == request.user
        return False
