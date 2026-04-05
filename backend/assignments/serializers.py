from rest_framework import serializers
from .models import Assignment


class AssignmentSerializer(serializers.ModelSerializer):
    resource_titles = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()
    deadline_id = serializers.SerializerMethodField()
    deadline_date = serializers.SerializerMethodField()
    session_count = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = (
            'id', 'title', 'subject', 'instructions', 'file', 'file_name',
            'resources', 'resource_titles', 'status',
            'ai_response', 'ai_overview', 'ai_outline',
            'due_date', 'deadline_id', 'deadline_date', 'session_count',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'status', 'ai_response', 'ai_overview', 'ai_outline', 'created_at', 'updated_at')
        extra_kwargs = {
            'instructions': {'required': False, 'allow_blank': True},
            'file': {'required': False},
        }

    def get_resource_titles(self, obj):
        return [{'id': r.id, 'title': r.title, 'type': r.resource_type} for r in obj.resources.all()]

    def get_file_name(self, obj):
        if obj.file:
            import os
            return os.path.basename(obj.file.name)
        return None

    def get_deadline_id(self, obj):
        try:
            return obj.deadline.id
        except Exception:
            return None

    def get_deadline_date(self, obj):
        try:
            return obj.deadline.due_date.isoformat()
        except Exception:
            return None

    def get_session_count(self, obj):
        return obj.sessions.count()

    def validate(self, data):
        instructions = data.get('instructions', '').strip()
        file = data.get('file')
        if self.instance is None and not instructions and not file:
            raise serializers.ValidationError('Provide either instructions or upload a file.')
        return data
