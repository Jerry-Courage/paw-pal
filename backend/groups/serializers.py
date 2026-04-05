from rest_framework import serializers
from .models import StudyGroup, GroupMembership, GroupSession, WorkspaceDocument, GroupTask, GroupMessage
from users.serializers import UserSerializer


class GroupMembershipSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = GroupMembership
        fields = ('id', 'user', 'role', 'joined_at')


class StudyGroupSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True)
    is_member = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()

    class Meta:
        model = StudyGroup
        fields = (
            'id', 'name', 'description', 'cover_image', 'subject',
            'is_public', 'is_verified', 'member_count', 'is_member',
            'owner_name', 'created_at'
        )
        read_only_fields = ('id', 'created_at', 'is_verified')

    def get_is_member(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.memberships.filter(user=request.user).exists()
        return False

    def get_owner_name(self, obj):
        return obj.owner.get_full_name() or obj.owner.username


class GroupSessionSerializer(serializers.ModelSerializer):
    attendee_count = serializers.SerializerMethodField()

    class Meta:
        model = GroupSession
        fields = ('id', 'group', 'title', 'description', 'scheduled_at', 'duration_minutes', 'is_active', 'attendee_count', 'created_at')
        read_only_fields = ('id', 'created_at')

    def get_attendee_count(self, obj):
        return obj.attendees.count()


class WorkspaceDocumentSerializer(serializers.ModelSerializer):
    last_edited_by_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceDocument
        fields = ('id', 'group', 'title', 'content', 'last_edited_by_name', 'updated_at', 'created_at')
        read_only_fields = ('id', 'created_at', 'updated_at', 'group')

    def get_last_edited_by_name(self, obj):
        if obj.last_edited_by:
            return obj.last_edited_by.get_full_name() or obj.last_edited_by.username
        return None


class GroupTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = GroupTask
        fields = ('id', 'group', 'title', 'assigned_to', 'is_completed', 'created_at')
        read_only_fields = ('id', 'created_at')


class GroupMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()
    sender_avatar = serializers.SerializerMethodField()

    class Meta:
        model = GroupMessage
        fields = ('id', 'content', 'sender_name', 'sender_avatar', 'is_ai', 'created_at')
        read_only_fields = ('id', 'created_at', 'is_ai')

    def get_sender_name(self, obj):
        if obj.is_ai:
            return 'FlowAI'
        return obj.sender.get_full_name() or obj.sender.username

    def get_sender_avatar(self, obj):
        request = self.context.get('request')
        if not obj.is_ai and obj.sender.avatar and request:
            return request.build_absolute_uri(obj.sender.avatar.url)
        return None
