import json
import logging
import re
from collections import OrderedDict
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q, Count, Avg

from .models import LearningPath, ConceptNode, ConceptReview, Unit
from .serializers import (LearningPathSerializer, LearningPathListSerializer,
                           ConceptNodeSerializer, ConceptNodeDetailSerializer,
                           ConceptReviewSerializer, UnitSerializer)
from .spaced_repetition import calculate_next_review, get_due_concepts, get_review_stats

logger = logging.getLogger(__name__)

# ── Depth limits ──
DEPTH_LIMITS = {
    'quick': {'min_concepts': 5, 'max_concepts': 8, 'min_units': 2, 'max_units': 3},
    'standard': {'min_concepts': 8, 'max_concepts': 15, 'min_units': 3, 'max_units': 5},
    'deep': {'min_concepts': 15, 'max_concepts': 25, 'min_units': 5, 'max_units': 8},
}


def _normalize_title(title: str) -> str:
    """Normalize a concept title for dedup comparison."""
    t = title.lower().strip()
    t = re.sub(r'[^a-z0-9\s]', '', t)
    t = re.sub(r'\s+', ' ', t)
    return t


def _titles_overlap(a: str, b: str) -> bool:
    """Check if two normalized titles refer to the same concept."""
    if a == b:
        return True
    # Check if one is a substring of the other
    if a in b or b in a:
        return True
    # Word overlap: if >70% of words in the shorter title appear in the longer
    words_a = set(a.split())
    words_b = set(b.split())
    if not words_a or not words_b:
        return False
    shorter = words_a if len(words_a) <= len(words_b) else words_b
    longer = words_b if len(words_a) <= len(words_b) else words_a
    overlap = len(shorter & longer) / len(shorter)
    return overlap >= 0.7


def _dedup_concepts(raw_concepts: list) -> list:
    """Remove duplicate concepts by normalized title matching."""
    seen = []  # list of (normalized_title, original_concept)
    for concept in raw_concepts:
        title = concept.get('title', '')
        norm = _normalize_title(title)
        is_dup = False
        for seen_title, _ in seen:
            if _titles_overlap(norm, seen_title):
                is_dup = True
                break
        if not is_dup:
            seen.append((norm, concept))
    return [c for _, c in seen]


def _extract_resource_concepts(resource) -> list:
    """Extract real concepts from a single resource. Returns list of concept dicts."""
    raw_concepts = resource.ai_concepts or []
    # Filter: only keep actual concept objects with a title
    real_concepts = [
        c for c in raw_concepts
        if isinstance(c, dict) and (c.get('title') or c.get('name'))
        and not any(k in c for k in ('extracted_text', 'practice_questions', 'transcript', 'concepts', 'study_notes', 'mind_map', 'chapters'))
    ]
    notes = (resource.ai_notes_json or {}).get('sections', [])

    concepts = []
    if len(real_concepts) >= 3:
        concepts = real_concepts
    elif notes:
        for idx, section in enumerate(notes):
            title = section.get('title', f'Section {idx+1}')
            plain = section.get('plain_english', '')
            deep = section.get('deep_dive', '')
            content = section.get('content', '') or deep or plain
            summary = section.get('quick_summary', '') or (plain[:300] if plain else content[:300])
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

    # Normalize concept format
    normalized = []
    for i, concept in enumerate(concepts):
        if isinstance(concept, str):
            concept = {'title': concept, 'description': ''}
        normalized.append({
            'title': concept.get('title', concept.get('name', f'Concept {i+1}')),
            'description': concept.get('description', concept.get('summary', '')),
            'source_resource': resource,
            'source_page': concept.get('page'),
            'source_section': concept.get('section', ''),
            'difficulty': concept.get('difficulty', 'medium'),
            'key_definitions': concept.get('definitions', concept.get('key_definitions', [])),
            'summary': concept.get('summary', ''),
        })

    return normalized


def _generate_preview_structure(goal: str, all_concepts: list, depth: str) -> dict:
    """
    Organize raw concepts into units with bounded count.
    Returns {units: [{title, concepts: [...]}], total_concepts, estimated_minutes}.
    """
    limits = DEPTH_LIMITS.get(depth, DEPTH_LIMITS['standard'])

    # Dedup across all resources
    deduped = _dedup_concepts(all_concepts)

    # Clamp to depth limits
    max_concepts = limits['max_concepts']
    if len(deduped) > max_concepts:
        # Take the first N (they're already ordered by resource/page)
        deduped = deduped[:max_concepts]

    total = len(deduped)
    if total == 0:
        return {'units': [], 'total_concepts': 0, 'estimated_minutes': 0}

    # Group into units
    max_units = limits['max_units']
    min_units = limits['min_units']

    # Calculate concepts per unit
    concepts_per_unit = max(1, total // max(min_units, 2))
    units = []
    remaining = list(deduped)

    unit_idx = 0
    while remaining and len(units) < max_units:
        # Last unit gets all remaining if we're at min_units
        if len(units) >= min_units - 1 and len(remaining) <= concepts_per_unit + 2:
            chunk = remaining
            remaining = []
        else:
            chunk = remaining[:concepts_per_unit]
            remaining = remaining[concepts_per_unit:]

        if chunk:
            # Generate a unit title from the concepts
            unit_title = _generate_unit_title(goal, chunk, unit_idx)
            units.append({
                'title': unit_title,
                'concepts': chunk,
            })
            unit_idx += 1

    # Calculate estimated time
    total_minutes = sum(
        15 if c.get('difficulty') != 'hard' else 25
        for u in units for c in u['concepts']
    )

    return {
        'units': units,
        'total_concepts': total,
        'estimated_minutes': total_minutes,
    }


def _generate_unit_title(goal: str, concepts: list, unit_idx: int) -> str:
    """Generate a short unit title from the concepts it contains."""
    # Use the most common words across concept titles to infer a theme
    titles = [c.get('title', '') for c in concepts]
    # Simple heuristic: use the first concept's topic area
    if titles:
        # Try to find a shared theme word
        words = {}
        for t in titles:
            for w in t.lower().split():
                if len(w) > 3 and w not in ('the', 'and', 'for', 'with', 'that', 'this', 'from'):
                    words[w] = words.get(w, 0) + 1
        if words:
            theme = max(words, key=words.get)
            return theme.title() + ' Fundamentals' if unit_idx == 0 else theme.title()
    return f'Unit {unit_idx + 1}'


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

    @action(detail=False, methods=['post'])
    def generate_preview(self, request):
        """
        Generate a preview of the learning path structure WITHOUT persisting.
        POST /learning/paths/generate-preview/
        Body: {goal, resources: [id...], depth: quick|standard|deep}
        Returns: {units: [...], total_concepts, estimated_minutes}
        """
        goal = request.data.get('goal', '').strip()
        resource_ids = request.data.get('resources', [])
        depth = request.data.get('depth', 'standard')

        if not goal:
            return Response({'error': 'Goal is required'}, status=400)
        if not resource_ids:
            return Response({'error': 'Select at least one resource'}, status=400)
        if depth not in DEPTH_LIMITS:
            return Response({'error': 'Depth must be quick, standard, or deep'}, status=400)

        from library.models import Resource
        resource_objs = Resource.objects.filter(id__in=resource_ids, owner=request.user)
        if not resource_objs.exists():
            return Response({'error': 'No valid resources found'}, status=400)

        # Extract concepts from selected resources only
        all_concepts = []
        for res in resource_objs:
            all_concepts.extend(_extract_resource_concepts(res))

        if not all_concepts:
            return Response({
                'error': 'No concepts found in selected resources. Generate study notes first.',
                'units': [],
                'total_concepts': 0,
            }, status=400)

        # Build preview structure
        preview = _generate_preview_structure(goal, all_concepts, depth)

        return Response({
            'goal': goal,
            'depth': depth,
            'resource_count': resource_objs.count(),
            'units': [
                {
                    'title': u['title'],
                    'concept_count': len(u['concepts']),
                    'concepts': [
                        {
                            'title': c['title'],
                            'difficulty': c.get('difficulty', 'medium'),
                            'estimated_minutes': 15 if c.get('difficulty') != 'hard' else 25,
                        }
                        for c in u['concepts']
                    ],
                }
                for u in preview['units']
            ],
            'total_concepts': preview['total_concepts'],
            'estimated_minutes': preview['estimated_minutes'],
        })

    @action(detail=False, methods=['post'])
    def build(self, request):
        """
        Build a learning path from a previewed structure.
        POST /learning/paths/build/
        Body: {goal, title, resources: [id...], depth}
        Persists Units + ConceptNodes. Returns the created path.
        """
        goal = request.data.get('goal', '').strip()
        title = request.data.get('title', '').strip() or goal
        resource_ids = request.data.get('resources', [])
        depth = request.data.get('depth', 'standard')

        if not goal:
            return Response({'error': 'Goal is required'}, status=400)
        if not resource_ids:
            return Response({'error': 'Select at least one resource'}, status=400)
        if depth not in DEPTH_LIMITS:
            return Response({'error': 'Depth must be quick, standard, or deep'}, status=400)

        from library.models import Resource
        resource_objs = Resource.objects.filter(id__in=resource_ids, owner=request.user)
        if not resource_objs.exists():
            return Response({'error': 'No valid resources found'}, status=400)

        # Extract and structure
        all_concepts = []
        for res in resource_objs:
            all_concepts.extend(_extract_resource_concepts(res))

        if not all_concepts:
            return Response({'error': 'No concepts found in selected resources'}, status=400)

        preview = _generate_preview_structure(goal, all_concepts, depth)

        if not preview['units']:
            return Response({'error': 'Could not generate a valid structure'}, status=400)

        # Create the path
        path = LearningPath.objects.create(
            user=request.user,
            title=title[:300],
            goal=goal[:300],
            depth=depth,
            subject=goal[:200],
            status='active',
        )

        # Create units and concepts
        global_order = 0
        first_concept = None
        prev_concept = None

        for unit_idx, unit_data in enumerate(preview['units']):
            unit = Unit.objects.create(
                path=path,
                title=unit_data['title'][:300],
                order_index=unit_idx,
            )

            for concept_data in unit_data['concepts']:
                node = ConceptNode.objects.create(
                    path=path,
                    unit=unit,
                    title=concept_data['title'][:300],
                    description=concept_data.get('description', '')[:2000],
                    source_resource=concept_data.get('source_resource'),
                    source_page=concept_data.get('source_page'),
                    source_section=concept_data.get('source_section', ''),
                    order_index=global_order,
                    status='current' if global_order == 0 else 'locked',
                    difficulty=concept_data.get('difficulty', 'medium'),
                    key_definitions=concept_data.get('key_definitions', []),
                    summary=concept_data.get('summary', ''),
                    estimated_minutes=15 if concept_data.get('difficulty') != 'hard' else 25,
                )

                if global_order == 0:
                    first_concept = node

                # Linear prerequisite chain
                if prev_concept:
                    node.prerequisites.add(prev_concept)

                prev_concept = node
                global_order += 1

        path.total_concepts = global_order
        path.save(update_fields=['total_concepts', 'status', 'updated_at'])

        return Response({
            'id': str(path.id),
            'title': path.title,
            'goal': path.goal,
            'depth': path.depth,
            'total_concepts': path.total_concepts,
            'units': UnitSerializer(path.units.all(), many=True).data,
        }, status=201)

    @action(detail=True, methods=['post'])
    def generate(self, request, pk=None):
        """Legacy generate — kept for backward compat. Redirects to build logic."""
        return self.build(request)

    @action(detail=True, methods=['post'])
    def condense(self, request, pk=None):
        """
        Condense an oversized path: archive old concepts, generate bounded structure.
        POST /learning/paths/{id}/condense/
        Body: {depth: quick|standard|deep} (optional, defaults to current)
        """
        path = self.get_object()
        depth = request.data.get('depth', path.depth or 'standard')
        if depth not in DEPTH_LIMITS:
            return Response({'error': 'Invalid depth'}, status=400)

        limits = DEPTH_LIMITS[depth]
        existing_concepts = list(path.concepts.all().order_by('order_index'))

        if len(existing_concepts) <= limits['max_concepts']:
            return Response({
                'message': f'Path already within {depth} bounds ({len(existing_concepts)} concepts)',
                'concept_count': len(existing_concepts),
            })

        # Collect source resources from existing concepts
        resource_ids = set()
        for c in existing_concepts:
            if c.source_resource_id:
                resource_ids.add(c.source_resource_id)

        if not resource_ids:
            return Response({'error': 'No source resources found to regenerate from'}, status=400)

        from library.models import Resource
        resource_objs = Resource.objects.filter(id__in=resource_ids, owner=request.user)

        # Extract fresh concepts
        all_concepts = []
        for res in resource_objs:
            all_concepts.extend(_extract_resource_concepts(res))

        if not all_concepts:
            return Response({'error': 'No concepts extractable from source materials'}, status=400)

        # Build new preview
        goal = path.goal or path.title
        preview = _generate_preview_structure(goal, all_concepts, depth)

        if not preview['units']:
            return Response({'error': 'Could not generate a condensed structure'}, status=400)

        # Archive existing concepts (set status to 'locked', reduce order)
        max_order = max(c.order_index for c in existing_concepts) + 1
        for c in existing_concepts:
            c.order_index = c.order_index + max_order
            c.save(update_fields=['order_index'])

        # Create new units and concepts
        global_order = 0
        prev_concept = None

        for unit_idx, unit_data in enumerate(preview['units']):
            unit = Unit.objects.create(
                path=path,
                title=unit_data['title'][:300],
                order_index=unit_idx,
            )

            for concept_data in unit_data['concepts']:
                node = ConceptNode.objects.create(
                    path=path,
                    unit=unit,
                    title=concept_data['title'][:300],
                    description=concept_data.get('description', '')[:2000],
                    source_resource=concept_data.get('source_resource'),
                    source_page=concept_data.get('source_page'),
                    source_section=concept_data.get('source_section', ''),
                    order_index=global_order,
                    status='current' if global_order == 0 else 'locked',
                    difficulty=concept_data.get('difficulty', 'medium'),
                    key_definitions=concept_data.get('key_definitions', []),
                    summary=concept_data.get('summary', ''),
                    estimated_minutes=15 if concept_data.get('difficulty') != 'hard' else 25,
                )
                if prev_concept:
                    node.prerequisites.add(prev_concept)
                prev_concept = node
                global_order += 1

        path.depth = depth
        path.total_concepts = path.concepts.count()
        path.save(update_fields=['depth', 'total_concepts', 'updated_at'])

        return Response({
            'message': f'Condensed to {global_order} concepts ({depth})',
            'concept_count': global_order,
            'archived_count': len(existing_concepts),
        })

    @action(detail=True, methods=['get'])
    def roadmap(self, request, pk=None):
        """Get the full roadmap graph for visualization — includes unit structure."""
        path = self.get_object()
        units = path.units.all().order_by('order_index')
        concepts = path.concepts.all().order_by('order_index')

        unit_nodes = []
        for u in units:
            unit_concepts = concepts.filter(unit=u)
            unit_nodes.append({
                'id': str(u.id),
                'type': 'unit',
                'title': u.title,
                'order': u.order_index,
                'concept_count': unit_concepts.count(),
                'completed_count': unit_concepts.filter(status='completed').count(),
            })

        concept_nodes = []
        edges = []
        for c in concepts:
            concept_nodes.append({
                'id': str(c.id),
                'type': 'concept',
                'unit_id': str(c.unit_id) if c.unit_id else None,
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

        return Response({'units': unit_nodes, 'nodes': concept_nodes, 'edges': edges})

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

        # RewardEngine is the authoritative, idempotent reward source. Reusing
        # the concept id means retries can never double-award XP/FlowCoins.
        from gamification.services import RewardEngine
        reward = RewardEngine.process(
            user=request.user,
            activity_type='concept_completion',
            source_id=str(concept.id),
            context={'score': score, 'path_id': str(concept.path_id)},
        )

        concept.status = 'completed'
        concept.mastery = score
        concept.xp_earned = max(concept.xp_earned, reward['xp'])
        concept.save(update_fields=['status', 'mastery', 'xp_earned', 'updated_at'])

        # Unlock concepts that have this as a prerequisite
        unlocked = ConceptNode.objects.filter(
            prerequisites=concept,
            status='locked'
        ).exclude(id=concept.id)

        newly_unlocked = []
        for node in unlocked:
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
            'reward': reward,
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

        notes = (resource.ai_notes_json or {}).get('sections', [])
        if concept.source_section:
            for section in notes:
                if concept.source_section.lower() in section.get('title', '').lower():
                    context['notes_section'] = section
                    break

        return Response(context)
