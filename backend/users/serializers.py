from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import models

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('email', 'username', 'password', 'password2', 'first_name', 'last_name', 'university', 'education_level')

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2', None)
        education_level = validated_data.pop('education_level', 'tertiary')
        university = validated_data.pop('university', '')
        
        user = User.objects.create_user(**validated_data)
        try:
            user.education_level = education_level
            if university:
                user.university = university
            user.save()
        except Exception:
            pass
        return user


class UserSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    is_premium = serializers.SerializerMethodField()
    notes_used = serializers.SerializerMethodField()
    notes_limit = serializers.SerializerMethodField()
    level = serializers.SerializerMethodField()
    xp = serializers.SerializerMethodField()
    notification_preferences = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id', 'email', 'username', 'first_name', 'last_name',
            'avatar_url', 'bio', 'university', 'study_streak',
            'total_study_time', 'weekly_goal_hours', 'onboarding_status',
            'created_at', 'is_premium', 'notes_used', 'notes_limit',
            'xp', 'level', 'education_level', 'notification_preferences',
        )
        read_only_fields = ('id', 'email', 'study_streak', 'total_study_time', 'created_at')

    def get_avatar_url(self, obj):
        request = self.context.get('request')
        if obj.avatar and request:
            return request.build_absolute_uri(obj.avatar.url)
        return None

    def get_is_premium(self, obj):
        return obj.has_active_subscription

    def get_notes_used(self, obj):
        return obj.total_resources_created

    def get_notes_limit(self, obj):
        return obj.FREE_NOTES_LIMIT

    def get_xp(self, obj):
        try:
            from gamification.models import ProgressionProfile
            profile = ProgressionProfile.objects.filter(user=obj).first()
            if profile:
                return profile.lifetime_xp
            # Fallback to legacy calculation
            from library.models import ResourceProgress
            earned = ResourceProgress.objects.filter(user=obj).aggregate(
                total=models.Sum('xp_earned')
            )['total'] or 0
            quiz_xp = int((obj.onboarding_status or {}).get('quiz_xp', 0))
            return earned + quiz_xp
        except Exception:
            return 0

    def get_level(self, obj):
        xp = self.get_xp(obj)
        from gamification.models import calculate_level, calculate_rank, get_level_threshold, MAX_LEVEL
        level_num = calculate_level(xp)
        rank_name = calculate_rank(xp)
        next_threshold = get_level_threshold(level_num + 1) if level_num < MAX_LEVEL else None
        return {
            'num': level_num,
            'rank': rank_name,
            'next_xp': next_threshold,
            'current_xp': xp,
        }

    def get_notification_preferences(self, obj):
        return (obj.onboarding_status or {}).get('notification_preferences', {})


class UpdateProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('username', 'first_name', 'last_name', 'bio', 'university', 'weekly_goal_hours', 'avatar', 'education_level')
