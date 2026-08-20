import json
import logging
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q, Count, Avg

from .models import LearningPath, ConceptNode, ConceptReview
from .serializers import (LearningPathSerializer, LearningPathListSerializer,
                           ConceptNodeSerializer, ConceptNodeDetailSerializer,
                           ConceptReviewSerializer)
from .spaced_repetition import calculate_next_review, get_due_concepts, get_review_stats

logger = logging.getLogger(__name__)


class LearningPathViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return LearningPath.objects.filter(user=self.request.user)

    def get_serializer_class(self):
        if self.action == 'list':
            return LearningPathListSerializer
        return LearningPathSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def generate(self, request, pk=None):
        """AI-generate concept nodes for a learning path from attached resources."""
        path = self.get_object()
        resources = request.data.get('resources', [])

        if not resources:
            return Response({'error': 'Provide resource IDs to generate concepts from'},
                            status=400)

        from library.models import Resource
        resource_objs = Resource.objects.filter(id__in=resources, owner=request.user)
        if not resource_objs.exists():
            return Response({'error': 'No valid resources found'}, status=400)

        all_concepts = []
        for res in resource_objs:
            concepts = res.ai_concepts or []
            notes = (res.ai_notes_json or {}).get('sections', [])

            # If ai_concepts is empty or has < 3 items, fall back to notes sections
            if len(concepts) < 3 and notes:
                concepts = []
                for idx, section in enumerate(notes):
                    # Extract richer info from section — prefer plain_english and deep_dive (fun content)
                    title = section.get('title', f'Section {idx+1}')
                    plain = section.get('plain_english', '')
                    deep = section.get('deep_dive', '')
                    content = section.get('content', '') or deep or plain
                    summary = section.get('quick_summary', '') or plain[:300] if plain else content[:300]
                    key_defs = section.get('key_definitions', [])
                    if not key_defs and section.get('key_question'):
                        key_defs = [{'term': 'Key Concept', 'definition': section.get('key_question')}]

                    concepts.append({
                        'title': title,
                        'description': (plain + '\n\n' + deep)[:800] if plain else content[:500],
                        'summary': summary[:400] if summary else '',
                        'difficulty': section.get('difficulty', 'medium'),
                        'definitions': key_defs if key_defs else [],
                    })

            # If still too few concepts, try to split large content sections
            if len(concepts) < 3 and notes:
                for idx, section in enumerate(notes):
                    content = section.get('content', '') or section.get('deep_dive', '') or ''
                    if len(content) > 800:
                        # Split into sub-concepts based on paragraphs
                        paragraphs = [p.strip() for p in content.split('\n\n') if len(p.strip()) > 100]
                        for pi, para in enumerate(paragraphs[:3]):
                            title = section.get('title', f'Section {idx+1}')
                            concepts.append({
                                'title': f'{title} — Part {pi+1}',
                                'description': para[:500],
                                'summary': para[:300],
                                'difficulty': section.get('difficulty', 'medium'),
                                'definitions': [],
                            })

            for i, concept in enumerate(concepts):
                if isinstance(concept, str):
                    concept = {'title': concept, 'description': ''}
                all_concepts.append({
                    'title': concept.get('title', concept.get('name', f'Concept {i+1}')),
                    'description': concept.get('description', concept.get('summary', '')),
                    'source_resource': res,
                    'source_page': concept.get('page'),
                    'source_section': concept.get('section', ''),
                    'difficulty': concept.get('difficulty', 'medium'),
                    'key_definitions': concept.get('definitions', concept.get('key_definitions', [])),
                    'summary': concept.get('summary', ''),
                })

        if not all_concepts:
            return Response({'error': 'No concepts found. Open each resource and generate study notes first (click the Study Notes tab).'},
                            status=400)

        # Build dependency graph — linear with some branching
        created_nodes = []
        for i, c in enumerate(all_concepts):
            node = ConceptNode.objects.create(
                path=path,
                title=c['title'][:300],
                description=c['description'][:2000],
                source_resource=c['source_resource'],
                source_page=c.get('source_page'),
                source_section=c.get('source_section', ''),
                order_index=i,
                status='current' if i == 0 else 'locked',
                difficulty=c.get('difficulty', 'medium'),
                key_definitions=c.get('key_definitions', []),
                summary=c.get('summary', ''),
                estimated_minutes=15 if c.get('difficulty') != 'hard' else 25,
            )
            # Each concept depends on the previous one
            if created_nodes:
                node.prerequisites.add(created_nodes[-1])
            created_nodes.append(node)

        path.total_concepts = len(created_nodes)
        path.status = 'active'
        path.save(update_fields=['total_concepts', 'status', 'updated_at'])

        return Response({
            'message': f'Generated {len(created_nodes)} concepts',
            'concept_count': len(created_nodes),
        })

    @action(detail=True, methods=['get'])
    def roadmap(self, request, pk=None):
        """Get the full roadmap graph for visualization."""
        path = self.get_object()
        concepts = path.concepts.all().order_by('order_index')

        nodes = []
        edges = []
        for c in concepts:
            nodes.append({
                'id': str(c.id),
                'title': c.title,
                'mastery': c.mastery,
                'status': c.status,
                'difficulty': c.difficulty,
                'order': c.order_index,
                'xp_earned': c.xp_earned,
                'estimated_minutes': c.estimated_minutes,
                'reviews_due': c.reviews.filter(next_review__lte=timezone.now()).count(),
            })
            for prereq in c.prerequisites.all():
                edges.append({'from': str(prereq.id), 'to': str(c.id)})

        return Response({'nodes': nodes, 'edges': edges})

    @action(detail=True, methods=['get'])
    def due_reviews(self, request, pk=None):
        """Get concepts due for review in this path."""
        path = self.get_object()
        now = timezone.now()
        reviews = ConceptReview.objects.filter(
            concept__path=path,
            user=request.user,
            next_review__lte=now
        ).select_related('concept').order_by('next_review')

        data = [{
            'review_id': str(r.id),
            'concept_id': str(r.concept.id),
            'concept_title': r.concept.title,
            'last_score': r.last_score,
            'interval_days': r.interval_days,
            'retention_rate': r.retention_rate,
        } for r in reviews[:20]]

        return Response({'due': data, 'count': reviews.count()})

    @action(detail=True, methods=['get'])
    def analytics(self, request, pk=None):
        """Get analytics for a learning path."""
        path = self.get_object()
        concepts = path.concepts.all()

        status_counts = concepts.values('status').annotate(count=Count('id'))
        difficulty_avg = concepts.values('difficulty').annotate(avg_mastery=Avg('mastery'))

        total_xp = sum(c.xp_earned for c in concepts)
        avg_mastery = int(concepts.aggregate(avg=Avg('mastery'))['avg'] or 0)

        review_stats = get_review_stats(request.user)

        return Response({
            'total_concepts': concepts.count(),
            'status_distribution': {s['status']: s['count'] for s in status_counts},
            'difficulty_mastery': {d['difficulty']: int(d['avg_mastery'] or 0) for d in difficulty_avg},
            'total_xp': total_xp,
            'average_mastery': avg_mastery,
            'reviews_due': review_stats.get('due_count', 0),
            'overall_retention': int(review_stats.get('avg_retention') or 0),
        })


class ConceptNodeViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return ConceptNode.objects.filter(path__user=self.request.user)

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ConceptNodeDetailSerializer
        return ConceptNodeSerializer

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark concept as completed, unlock next concepts."""
        concept = self.get_object()

        if concept.status == 'locked':
            return Response({'error': 'Concept is locked'}, status=400)

        # Check all prerequisites are completed
        unmet = concept.prerequisites.exclude(status='completed')
        if unmet.exists():
            return Response({'error': 'Complete prerequisites first'}, status=400)

        score = int(request.data.get('score', 80))
        concept.status = 'completed'
        concept.mastery = score
        concept.xp_earned = max(concept.xp_earned, score)
        concept.save(update_fields=['status', 'mastery', 'xp_earned', 'updated_at'])

        # Unlock concepts that have this as a prerequisite
        unlocked = ConceptNode.objects.filter(
            prerequisites=concept,
            status='locked'
        ).exclude(
            prerequisites__status='completed'
        ).exclude(id=concept.id)

        newly_unlocked = []
        for node in unlocked:
            # Check if ALL prerequisites are now completed
            remaining = node.prerequisites.exclude(status='completed')
            if not remaining.exists():
                node.status = 'current'
                node.save(update_fields=['status', 'updated_at'])
                newly_unlocked.append(str(node.id))

        # Update path progress
        concept.path.recalculate_progress()

        return Response({
            'message': 'Concept completed',
            'xp_earned': concept.xp_earned,
            'unlocked': newly_unlocked,
        })

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        """Submit a review score and update spaced repetition."""
        concept = self.get_object()
        score = int(request.data.get('score', 0))

        if not (0 <= score <= 100):
            return Response({'error': 'Score must be 0-100'}, status=400)

        review, created = ConceptReview.objects.get_or_create(
            concept=concept,
            user=request.user,
            defaults={'last_score': score}
        )

        result = calculate_next_review(review, score)
        for key, val in result.items():
            setattr(review, key, val)
        review.total_reviews += 1
        if score >= 60:
            review.correct_reviews += 1
        review.save()

        # Update concept mastery
        all_reviews = list(concept.reviews.filter(user=request.user).order_by('last_reviewed'))
        from .spaced_repetition import calculate_mastery
        concept.mastery = calculate_mastery(concept, all_reviews)
        concept.save(update_fields=['mastery', 'updated_at'])

        return Response({
            'message': 'Review recorded',
            'next_review': result['next_review'].isoformat(),
            'interval_days': result['interval_days'],
            'ease_factor': result['ease_factor'],
            'mastery': concept.mastery,
        })

    @action(detail=True, methods=['get'])
    def source_context(self, request, pk=None):
        """Get source material context for this concept (cited answers)."""
        concept = self.get_object()
        if not concept.source_resource:
            return Response({'error': 'No source material linked'}, status=404)

        resource = concept.source_resource
        context = {
            'resource_title': resource.title,
            'source_page': concept.source_page,
            'source_section': concept.source_section,
            'key_definitions': concept.key_definitions,
            'summary': concept.summary,
        }

        # Get relevant notes section if available
        notes = (resource.ai_notes_json or {}).get('sections', [])
        if concept.source_section:
            for section in notes:
                if concept.source_section.lower() in section.get('title', '').lower():
                    context['notes_section'] = section
                    break

        return Response(context)
