from rest_framework import serializers
from django.conf import settings
from .models import Resource, Deck, Flashcard, Quiz, ResourceImage


class ResourceImageSerializer(serializers.ModelSerializer):
    image = serializers.SerializerMethodField()

    class Meta:
        model = ResourceImage
        fields = ('id', 'image', 'page_number', 'description', 'created_at')

    def get_image(self, obj):
        if not obj.image: return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.image.url)
        return f"{settings.API_URL}{obj.image.url}" if hasattr(settings, 'API_URL') else obj.image.url


class ResourceSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    owner_name = serializers.SerializerMethodField()
    extracted_images = ResourceImageSerializer(many=True, read_only=True)

    class Meta:
        model = Resource
        fields = (
            'id', 'title', 'resource_type', 'file_url', 'url', 'subject',
            'status', 'file_size', 'ai_summary', 'ai_concepts', 'ai_notes_json',
            'has_study_kit', 'extracted_images', 'owner_name', 'created_at', 'updated_at'
        )
        read_only_fields = ('id', 'status', 'ai_summary', 'ai_concepts', 'has_study_kit', 'created_at', 'updated_at')

    def get_file_url(self, obj):
        request = self.context.get('request')
        if obj.file and request:
            return request.build_absolute_uri(obj.file.url)
        return None

    def get_owner_name(self, obj):
        return obj.owner.get_full_name() or obj.owner.username


class ResourceUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Resource
        fields = ('title', 'resource_type', 'file', 'url', 'subject')


class DeckSerializer(serializers.ModelSerializer):
    total_cards = serializers.IntegerField(read_only=True)
    due_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Deck
        fields = ('id', 'title', 'subject', 'description', 'total_cards', 'due_count', 'created_at', 'updated_at')
        read_only_fields = ('id', 'created_at', 'updated_at')


class FlashcardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Flashcard
        fields = ('id', 'deck', 'resource', 'question', 'answer', 'subject', 'difficulty', 'created_at')
        read_only_fields = ('id', 'created_at')


class QuizSerializer(serializers.ModelSerializer):
    class Meta:
        model = Quiz
        fields = ('id', 'resource', 'title', 'format', 'questions', 'academic_level', 'created_at')
        read_only_fields = ('id', 'created_at')
