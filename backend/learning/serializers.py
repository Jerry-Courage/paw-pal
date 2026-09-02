from rest_framework import serializers
from .models import LearningPath, ConceptNode, ConceptReview, Unit


class ConceptReviewSerializer(serializers.ModelSerializer):
    retention_rate = serializers.ReadOnlyField()

    class Meta:
        model = ConceptReview
        fields = ['id', 'concept', 'ease_factor', 'interval_days', 'repetitions',
                  'last_reviewed', 'next_review', 'last_score', 'total_reviews',
                  'correct_reviews', 'retention_rate', 'created_at']


class UnitSerializer(serializers.ModelSerializer):
    concept_count = serializers.SerializerMethodField()
    completed_count = serializers.SerializerMethodField()

    class Meta:
        model = Unit
        fields = ['id', 'path', 'title', 'description', 'order_index',
                  'concept_count', 'completed_count', 'created_at']

    def get_concept_count(self, obj):
        return obj.concepts.count()

    def get_completed_count(self, obj):
        return obj.concepts.filter(status='completed').count()


class ConceptNodeSerializer(serializers.ModelSerializer):
    prerequisites = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    source_resource_title = serializers.CharField(source='source_resource.title', read_only=True, default='')
    reviews_due = serializers.SerializerMethodField()
    unit_title = serializers.CharField(source='unit.title', read_only=True, default='')

    class Meta:
        model = ConceptNode
        fields = ['id', 'path', 'unit', 'unit_title', 'title', 'description', 'source_resource',
                  'source_resource_title', 'source_page', 'source_section', 'order_index',
                  'prerequisites', 'mastery', 'status', 'xp_earned', 'difficulty',
                  'estimated_minutes', 'key_definitions', 'summary', 'reviews_due',
                  'created_at', 'updated_at']

    def get_reviews_due(self, obj):
        from django.utils import timezone
        return obj.reviews.filter(next_review__lte=timezone.now()).count()


class ConceptNodeDetailSerializer(serializers.ModelSerializer):
    prerequisites = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    source_resource_title = serializers.CharField(source='source_resource.title', read_only=True, default='')
    reviews = ConceptReviewSerializer(many=True, read_only=True)
    reviews_due = serializers.SerializerMethodField()
    unit_title = serializers.CharField(source='unit.title', read_only=True, default='')

    class Meta:
        model = ConceptNode
        fields = ['id', 'path', 'unit', 'unit_title', 'title', 'description', 'source_resource',
                  'source_resource_title', 'source_page', 'source_section', 'order_index',
                  'prerequisites', 'mastery', 'status', 'xp_earned', 'difficulty',
                  'estimated_minutes', 'key_definitions', 'summary', 'reviews',
                  'reviews_due', 'created_at', 'updated_at']

    def get_reviews_due(self, obj):
        from django.utils import timezone
        return obj.reviews.filter(next_review__lte=timezone.now()).count()


class LearningPathSerializer(serializers.ModelSerializer):
    concepts = ConceptNodeSerializer(many=True, read_only=True)
    units = UnitSerializer(many=True, read_only=True)
    mastery_percent = serializers.ReadOnlyField()
    concept_count = serializers.SerializerMethodField()
    due_reviews = serializers.SerializerMethodField()
    mastery_state = serializers.SerializerMethodField()

    class Meta:
        model = LearningPath
        fields = ['id', 'user', 'title', 'description', 'subject', 'goal', 'depth',
                  'status', 'start_date', 'deadline',
                  'total_xp', 'concepts_completed', 'total_concepts', 'mastery_percent',
                  'daily_review_goal', 'concept_count', 'due_reviews', 'mastery_state', 'concepts', 'units',
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

    def get_mastery_state(self, obj):
        request = self.context.get('request')
        attempt = obj.mastery_attempts.filter(user=request.user).first() if request and request.user.is_authenticated else None
        eligible = bool(obj.total_concepts and obj.concepts_completed == obj.total_concepts)
        return {
            'eligible': eligible,
            'started': bool(attempt),
            'passed': bool(attempt and attempt.passed),
            'score': attempt.score if attempt else None,
            'review_objective_ids': attempt.review_objective_ids if attempt else [],
        }


class LearningPathListSerializer(serializers.ModelSerializer):
    mastery_percent = serializers.ReadOnlyField()
    concept_count = serializers.SerializerMethodField()
    due_reviews = serializers.SerializerMethodField()
    unit_count = serializers.SerializerMethodField()
    mastery_state = serializers.SerializerMethodField()

    class Meta:
        model = LearningPath
        fields = ['id', 'title', 'description', 'subject', 'goal', 'depth',
                  'status', 'start_date', 'deadline',
                  'total_xp', 'concepts_completed', 'total_concepts', 'mastery_percent',
                  'daily_review_goal', 'concept_count', 'due_reviews', 'unit_count', 'mastery_state',
                  'created_at', 'updated_at']

    def get_concept_count(self, obj):
        return obj.concepts.count()

    def get_due_reviews(self, obj):
        from django.utils import timezone
        return ConceptReview.objects.filter(
            concept__path=obj,
            next_review__lte=timezone.now()
        ).count()

    def get_unit_count(self, obj):
        return obj.units.count()

    def get_mastery_state(self, obj):
        request = self.context.get('request')
        attempt = obj.mastery_attempts.filter(user=request.user).first() if request and request.user.is_authenticated else None
        eligible = bool(obj.total_concepts and obj.concepts_completed == obj.total_concepts)
        return {'eligible': eligible, 'started': bool(attempt), 'passed': bool(attempt and attempt.passed),
                'score': attempt.score if attempt else None,
                'review_objective_ids': attempt.review_objective_ids if attempt else []}
