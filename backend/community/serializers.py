from rest_framework import serializers
from .models import Post, Comment, StudyEvent, StudyRoom
from users.serializers import UserSerializer


class CommentSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    like_count = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()

    class Meta:
        model = Comment
        fields = ('id', 'author', 'content', 'is_ai_answer', 'like_count', 'is_liked', 'created_at')
        read_only_fields = ('id', 'created_at', 'is_ai_answer')

    def get_like_count(self, obj):
        return obj.likes.count()

    def get_is_liked(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.likes.filter(id=request.user.id).exists()
        return False


class PostSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)
    like_count = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()
    comments = CommentSerializer(many=True, read_only=True)
    resource_title = serializers.SerializerMethodField()
    resource_type = serializers.SerializerMethodField()

    class Meta:
        model = Post
        fields = (
            'id', 'author', 'post_type', 'content', 'resource', 'resource_title', 'resource_type',
            'tags', 'like_count', 'comment_count', 'is_liked', 'is_answered',
            'comments', 'created_at',
        )
        read_only_fields = ('id', 'created_at', 'is_answered')

    def get_like_count(self, obj):
        return obj.likes.count()

    def get_comment_count(self, obj):
        return obj.comments.count()

    def get_is_liked(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.likes.filter(id=request.user.id).exists()
        return False

    def get_resource_title(self, obj):
        return obj.resource.title if obj.resource else None

    def get_resource_type(self, obj):
        return obj.resource.resource_type if obj.resource else None


class StudyRoomSerializer(serializers.ModelSerializer):
    host = UserSerializer(read_only=True)
    participant_count = serializers.SerializerMethodField()
    is_joined = serializers.SerializerMethodField()
    resource_title = serializers.SerializerMethodField()

    class Meta:
        model = StudyRoom
        fields = (
            'id', 'host', 'title', 'subject', 'resource', 'resource_title',
            'participant_count', 'is_joined', 'max_participants', 'is_active', 'created_at',
        )
        read_only_fields = ('id', 'created_at')

    def get_participant_count(self, obj):
        return obj.participants.count()

    def get_is_joined(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.participants.filter(id=request.user.id).exists()
        return False

    def get_resource_title(self, obj):
        return obj.resource.title if obj.resource else None


class StudyEventSerializer(serializers.ModelSerializer):
    host_name = serializers.SerializerMethodField()
    host_avatar = serializers.SerializerMethodField()
    registration_count = serializers.SerializerMethodField()
    is_registered = serializers.SerializerMethodField()

    class Meta:
        model = StudyEvent
        fields = (
            'id', 'title', 'description', 'event_type', 'host_name', 'host_avatar',
            'group', 'scheduled_at', 'max_participants',
            'registration_count', 'is_registered', 'created_at',
        )
        read_only_fields = ('id', 'created_at')

    def get_host_name(self, obj):
        return obj.host.get_full_name() or obj.host.username

    def get_host_avatar(self, obj):
        request = self.context.get('request')
        if obj.host.avatar and request:
            return request.build_absolute_uri(obj.host.avatar.url)
        return None

    def get_registration_count(self, obj):
        return obj.registrations.count()

    def get_is_registered(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.registrations.filter(id=request.user.id).exists()
        return False
