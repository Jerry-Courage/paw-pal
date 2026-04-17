from rest_framework import serializers
from .models import StudySession, Deadline


class StudySessionSerializer(serializers.ModelSerializer):
    resource_title = serializers.SerializerMethodField()
    resource_type = serializers.SerializerMethodField()
    assignment_title = serializers.SerializerMethodField()

    class Meta:
        model = StudySession
        fields = (
            'id', 'title', 'subject', 'session_type', 'start_time', 'end_time', 
            'duration_minutes', 'location', 'notes', 'status', 'is_ai_suggested',
            'recurrence_id', 'resource', 'resource_title', 'resource_type',
            'assignment', 'assignment_title',
            'group', 'created_at'
        )
        read_only_fields = ('id', 'duration_minutes', 'created_at')

    def get_resource_title(self, obj):
        return obj.resource.title if obj.resource else None

    def get_resource_type(self, obj):
        return obj.resource.resource_type if obj.resource else None

    def get_assignment_title(self, obj):
        return obj.assignment.title if obj.assignment else None


class DeadlineSerializer(serializers.ModelSerializer):
    days_until = serializers.SerializerMethodField()
    assignment_id = serializers.SerializerMethodField()

    class Meta:
        model = Deadline
        fields = ('id', 'title', 'subject', 'due_date', 'is_completed', 'days_until', 'assignment_id', 'created_at')
        read_only_fields = ('id', 'created_at')

    def get_days_until(self, obj):
        from django.utils import timezone
        delta = obj.due_date - timezone.now()
        return max(0, delta.days)

    def get_assignment_id(self, obj):
        return obj.assignment.id if obj.assignment else None
