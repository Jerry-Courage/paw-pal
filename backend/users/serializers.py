from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('email', 'username', 'password', 'password2', 'first_name', 'last_name')

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({'password': 'Passwords do not match.'})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')
        user = User.objects.create_user(**validated_data)
        return user


class UserSerializer(serializers.ModelSerializer):
    avatar_url = serializers.SerializerMethodField()
    is_premium = serializers.SerializerMethodField()
    notes_used = serializers.SerializerMethodField()
    notes_limit = serializers.SerializerMethodField()
    level = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id', 'email', 'username', 'first_name', 'last_name',
            'avatar_url', 'bio', 'university', 'study_streak',
            'total_study_time', 'weekly_goal_hours', 'onboarding_status',
            'created_at', 'is_premium', 'notes_used', 'notes_limit',
            'xp', 'level',
        )
        read_only_fields = ('id', 'email', 'study_streak', 'total_study_time', 'created_at', 'xp')

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

    def get_level(self, obj):
        """Derive level name and number from XP."""
        xp = obj.xp or 0
        if xp < 500:    return {'num': 1, 'name': 'Freshman',  'next_xp': 500,  'current_xp': xp}
        if xp < 1500:   return {'num': 2, 'name': 'Sophomore', 'next_xp': 1500, 'current_xp': xp}
        if xp < 3500:   return {'num': 3, 'name': 'Junior',    'next_xp': 3500, 'current_xp': xp}
        if xp < 7000:   return {'num': 4, 'name': 'Senior',    'next_xp': 7000, 'current_xp': xp}
        return             {'num': 5, 'name': 'Graduate',  'next_xp': None, 'current_xp': xp}


class UpdateProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('username', 'first_name', 'last_name', 'bio', 'university', 'weekly_goal_hours', 'avatar')
