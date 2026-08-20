from rest_framework import serializers
from .models import LearningPath, ConceptNode, ConceptReview


class ConceptReviewSerializer(serializers.ModelSerializer):
    retention_rate = serializers.ReadOnlyField()

    class Meta:
        model = ConceptReview
        fields = ['id', 'concept', 'ease_factor', 'interval_days', 'repetitions',
                  'last_reviewed', 'next_review', 'last_score', 'total_reviews',
                  'correct_reviews', 'retention_rate', 'created_at']


class ConceptNodeSerializer(serializers.ModelSerializer):
    prerequisites = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    source_resource_title = serializers.CharField(source='source_resource.title', read_only=True, default='')
    reviews_due = serializers.SerializerMethodField()

    class Meta:
        model = ConceptNode
        fields = ['id', 'path', 'title', 'description', 'source_resource', 'source_resource_title',
                  'source_page', 'source_section', 'order_index', 'prerequisites', 'mastery',
                  'status', 'xp_earned', 'difficulty', 'estimated_minutes', 'key_definitions',
                  'summary', 'reviews_due', 'created_at', 'updated_at']

    def get_reviews_due(self, obj):
        from django.utils import timezone
        return obj.reviews.filter(next_review__lte=timezone.now()).count()


class ConceptNodeDetailSerializer(serializers.ModelSerializer):
    prerequisites = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    source_resource_title = serializers.CharField(source='source_resource.title', read_only=True, default='')
    reviews = ConceptReviewSerializer(many=True, read_only=True)
    reviews_due = serializers.SerializerMethodField()

    class Meta:
        model = ConceptNode
        fields = ['id', 'path', 'title', 'description', 'source_resource', 'source_resource_title',
                  'source_page', 'source_section', 'order_index', 'prerequisites', 'mastery',
                  'status', 'xp_earned', 'difficulty', 'estimated_minutes', 'key_definitions',
                  'summary', 'reviews', 'reviews_due', 'created_at', 'updated_at']

    def get_reviews_due(self, obj):
        from django.utils import timezone
        return obj.reviews.filter(next_review__lte=timezone.now()).count()


class LearningPathSerializer(serializers.ModelSerializer):
    concepts = ConceptNodeSerializer(many=True, read_only=True)
    mastery_percent = serializers.ReadOnlyField()
    concept_count = serializers.SerializerMethodField()
    due_reviews = serializers.SerializerMethodField()

    class Meta:
        model = LearningPath
        fields = ['id', 'user', 'title', 'description', 'subject', 'status', 'deadline',
                  'total_xp', 'concepts_completed', 'total_concepts', 'mastery_percent',
                  'daily_review_goal', 'concept_count', 'due_reviews', 'concepts',
                  'created_at', 'updated_at']
        read_only_fields = ['user', 'total_xp', 'concepts_completed', 'total_concepts']

    def get_concept_count(self, obj):
        return obj.concepts.count()

    def get_due_reviews(self, obj):
        from django.utils import timezone
        return ConceptReview.objects.filter(
            concept__path=obj,
            next_review__lte=timezone.now()
        ).count()


class LearningPathListSerializer(serializers.ModelSerializer):
    mastery_percent = serializers.ReadOnlyField()
    concept_count = serializers.SerializerMethodField()
    due_reviews = serializers.SerializerMethodField()

    class Meta:
        model = LearningPath
        fields = ['id', 'title', 'description', 'subject', 'status', 'deadline',
                  'total_xp', 'concepts_completed', 'total_concepts', 'mastery_percent',
                  'daily_review_goal', 'concept_count', 'due_reviews', 'created_at', 'updated_at']

    def get_concept_count(self, obj):
        return obj.concepts.count()

    def get_due_reviews(self, obj):
        from django.utils import timezone
        return ConceptReview.objects.filter(
            concept__path=obj,
            next_review__lte=timezone.now()
        ).count()
