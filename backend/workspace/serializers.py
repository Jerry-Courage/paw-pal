from rest_framework import serializers
from .models import Workspace, WorkspaceMember, WorkspaceBlock, WorkspaceMessage, WorkspaceTask, DocumentVersion, WorkspaceFile
from users.serializers import UserSerializer


class WorkspaceMemberSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = ('id', 'user', 'role', 'joined_at', 'last_seen')


class WorkspaceTaskSerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceTask
        fields = ('id', 'title', 'description', 'status', 'assigned_to', 'assigned_to_name', 'created_by_name', 'order', 'created_at')
        read_only_fields = ('id', 'created_at')

    def get_assigned_to_name(self, obj):
        return obj.assigned_to.get_full_name() or obj.assigned_to.username if obj.assigned_to else None

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username


class WorkspaceMessageSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    author_initials = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceMessage
        fields = ('id', 'author_name', 'author_initials', 'content', 'is_ai', 'created_at')
        read_only_fields = ('id', 'created_at', 'is_ai')

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


class DocumentVersionSerializer(serializers.ModelSerializer):
    saved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DocumentVersion
        fields = ('id', 'version', 'saved_by_name', 'created_at')

    def get_saved_by_name(self, obj):
        return obj.saved_by.get_full_name() or obj.saved_by.username if obj.saved_by else 'Unknown'


class WorkspaceBlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkspaceBlock
        fields = ('id', 'block_type', 'content', 'metadata', 'order', 'updated_at')


class WorkspaceFileSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceFile
        fields = ('id', 'name', 'file_url', 'file_size', 'uploaded_by_name', 'created_at')
        read_only_fields = ('id', 'created_at', 'file_size')

    def get_uploaded_by_name(self, obj):
        return obj.uploaded_by.get_full_name() or obj.uploaded_by.username if obj.uploaded_by else 'Unknown'

    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None


class WorkspaceSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()
    my_role = serializers.SerializerMethodField()
    assignment_title = serializers.SerializerMethodField()
    resource_titles = serializers.SerializerMethodField()
    blocks = WorkspaceBlockSerializer(many=True, read_only=True)
    group_name = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = (
            'id', 'name', 'subject', 'description', 'invite_code',
            'assignment', 'assignment_title', 'resources', 'resource_titles',
            'member_count', 'is_owner', 'my_role', 'blocks', 'group', 'group_name',
            'is_active', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'invite_code', 'created_at', 'updated_at')

    def get_member_count(self, obj):
        return obj.memberships.count()

    def get_is_owner(self, obj):
        request = self.context.get('request')
        return request and obj.owner_id == request.user.id

    def get_my_role(self, obj):
        request = self.context.get('request')
        if not request:
            return None
        m = obj.memberships.filter(user=request.user).first()
        return m.role if m else None

    def get_assignment_title(self, obj):
        return obj.assignment.title if obj.assignment else None

    def get_resource_titles(self, obj):
        return [{'id': r.id, 'title': r.title, 'type': r.resource_type} for r in obj.resources.all()]

    def get_group_name(self, obj):
        return obj.group.name if obj.group else None
