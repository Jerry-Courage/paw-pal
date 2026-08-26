import json
import logging
import re
import hashlib
from collections import OrderedDict
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db import transaction
from django.db.models import Q, Count, Avg, Max

from .models import EncounterAttempt, LearningPath, ConceptNode, ConceptReview, Unit, TeachingSession, TeachingTurn
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


def _activity_id(concept, key):
    return hashlib.sha256(f'{concept.id}:{key}:v2'.encode()).hexdigest()[:24]


def _subject_family(concept):
    label = ' '.join(filter(None, [str(getattr(concept.source_resource, 'subject', '') or ''),
                                  str(getattr(concept.source_resource, 'title', '') or ''), concept.title])).lower()
    if any(word in label for word in ('python', 'code', 'program', 'algorithm', 'javascript')):
        return 'programming'
    if any(word in label for word in ('math', 'algebra', 'calculus', 'equation', 'solver', 'matrix', 'geometry', 'statistic', 'numerical analysis', 'jacobi', 'gauss-seidel', 'sor')):
        return 'mathematics'
    if any(word in label for word in ('biology', 'cell', 'genetic', 'anatomy', 'ecology', 'organism')):
        return 'biology'
    return 'conceptual'


def _goal_mode(concept):
    goal = (concept.path.goal or '').lower()
    if any(word in goal for word in ('exam', 'test', 'quiz')):
        return 'exam'
    if any(word in goal for word in ('revis', 'refresh', 'quickly')):
        return 'revision'
    if any(word in goal for word in ('understand', 'explain')):
        return 'understand'
    return 'mastery'


def _grounding(concept):
    grounding = {'resource_id': concept.source_resource_id, 'resource_title': '',
                 'section': concept.source_section or '', 'page': concept.source_page, 'excerpt': ''}
    resource = concept.source_resource
    if not resource:
        return grounding
    grounding['resource_title'] = resource.title
    sections = (resource.ai_notes_json or {}).get('sections', [])
    selected = None
    if concept.source_section:
        selected = next((item for item in sections if concept.source_section.lower() in str(item.get('title', '')).lower()), None)
    if not selected and sections:
        title_words = set(re.findall(r'[a-z]{4,}', concept.title.lower()))
        selected = max(sections, key=lambda item: len(title_words & set(re.findall(r'[a-z]{4,}', str(item.get('title', '')).lower()))))
    if selected:
        grounding['section'] = grounding['section'] or selected.get('title', '')
        grounding['page'] = grounding['page'] or selected.get('page')
        grounding['excerpt'] = str(selected.get('plain_english') or selected.get('quick_summary') or selected.get('content') or '')[:700]
    return grounding


def _concept_activities(concept, user=None):
    """Activity Engine V2: deterministic, grounded, depth-aware learning sequence."""
    subject = _subject_family(concept)
    goal_mode = _goal_mode(concept)
    goal_text = concept.path.goal or goal_mode
    check_lead = {'exam': 'Exam check — ', 'revision': 'Retrieval check — ',
                  'understand': 'Concept check — ', 'mastery': 'Mastery check — '}[goal_mode]
    depth = concept.path.depth or 'standard'
    grounding = _grounding(concept)
    summary = (grounding['excerpt'] or concept.summary or concept.description or '').strip()
    for internal_phrase, learner_phrase in {
        'key concept': 'main idea', 'mechanism in the source': 'way it works',
        'relationship in the source': 'connection between the ideas',
        'expected relationship': 'important connection', 'source alignment': 'fit with the material',
    }.items():
        summary = re.sub(re.escape(internal_phrase), learner_phrase, summary, flags=re.I)
    if not summary:
        summary = f'{concept.title} is the focus of this part of the Journey.'
    main_idea = re.split(r'(?<=[.!?])\s+', summary)[0][:360]
    provenance = {key: value for key, value in grounding.items() if value not in ('', None)}

    def base(key, purpose, activity_type, prompt, **extra):
        return {'id': _activity_id(concept, key), 'concept_id': str(concept.id), 'purpose': purpose,
                'stage': purpose, 'type': activity_type, 'instructions': extra.pop('instructions', ''),
                'prompt': prompt, 'difficulty': extra.pop('difficulty', concept.difficulty),
                'estimated_seconds': extra.pop('estimated_seconds', 60), 'grounding': provenance,
                'goal_relevance': goal_text, **extra}

    def choice(key, purpose, prompt, correct, distractors, explanation, hint, activity_type='mcq', misconception_feedback=None, **extra):
        options = [correct, *distractors]
        feedback = [explanation, *(misconception_feedback or [hint] * len(distractors))]
        shift = int(hashlib.sha256(f'{concept.id}:{key}'.encode()).hexdigest()[:2], 16) % len(options)
        options = options[shift:] + options[:shift]
        feedback = feedback[shift:] + feedback[:shift]
        return base(key, purpose, activity_type, prompt, options=options,
                    correct_choice=options.index(correct), feedback_by_choice=feedback,
                    explanation=explanation, hints=[hint], **extra)

    title_lower = concept.title.lower()
    iterative = any(word in title_lower for word in ('jacobi', 'gauss-seidel', 'gauss seidel', 'sor', 'iterative technique'))
    if iterative:
        hook = choice('iterative-hook', 'diagnose', 'During one sweep, which method calculates every new value using only values from the previous sweep?',
                      'Jacobi', ['Gauss–Seidel', 'Successive over-relaxation (SOR)'],
                      'Jacobi keeps the whole previous iterate fixed while it computes the next one. Gauss–Seidel reuses new values immediately.',
                      'Ask whether a newly calculated value can be reused before the sweep ends.', activity_type='predict',
                      misconception_feedback=[
                          'Gauss–Seidel is the tempting choice, but it immediately reuses each new value during the same sweep. Jacobi waits until the next sweep.',
                          'SOR also starts from a Gauss–Seidel-style update, so it can reuse new values immediately. Jacobi alone keeps every update tied to the previous sweep.',
                      ])
        lesson = base('iterative-compare', 'learn', 'comparison', 'Follow one sweep across the three methods.', content={
            'columns': ['Method', 'Values used during a sweep', 'What changes'],
            'rows': [
                ['Jacobi', 'Only values from the previous iterate', 'All components update together'],
                ['Gauss–Seidel', 'Newest available values', 'Components update in sequence'],
                ['SOR', 'Gauss–Seidel update plus relaxation ω', 'ω controls how far the update moves'],
            ]}, explanation='The key distinction is when newly computed values become available.')
        apply = choice('iterative-apply', 'apply', 'A solver computes x₁⁽ᵏ⁺¹⁾, then immediately uses it while computing x₂⁽ᵏ⁺¹⁾. Which method is it using?',
                       'Gauss–Seidel', ['Jacobi', 'A direct factorization method'],
                       'Immediate reuse within the same sweep is the defining update behavior of Gauss–Seidel.',
                       'Track whether x₂ uses x₁ from iteration k or k+1.', activity_type='scenario',
                       misconception_feedback=[
                           'Jacobi would use x₁ from iteration k, not the newly calculated x₁ from k+1. Immediate reuse points to Gauss–Seidel.',
                           'Direct factorization solves through a decomposition rather than repeated sweeps. This scenario describes an iterative Gauss–Seidel update.',
                       ])
        order_items = [
            'Use the current iterate as the starting point',
            'Compute the first new component',
            'Reuse that new component in the next calculation',
            'Finish the sweep with the newest available values',
        ]
        order_shift = 1 + int(hashlib.sha256(f'{concept.id}:iterative-order'.encode()).hexdigest()[:2], 16) % (len(order_items) - 1)
        shuffled_items = order_items[order_shift:] + order_items[:order_shift]
        correct_order = [shuffled_items.index(item) for item in order_items]
        ordering = base('iterative-order', 'apply', 'ordering', 'Put one Gauss–Seidel sweep in the order it happens.',
                        instructions='Move the steps until the new value is reused at the right moment.',
                        content={'items': shuffled_items}, correct_order=correct_order,
                        explanation='Gauss–Seidel moves component by component, immediately feeding each new value into the next calculation.',
                        hints=['The key moment comes just after the first new component is calculated.'])
        check = choice('iterative-check', 'check', f'{check_lead}what does the relaxation factor ω change in SOR?',
                       'How far the method moves from the old value toward or beyond the Gauss–Seidel update',
                       ['Which equation is updated first during a sweep', 'Whether new values can be reused during the same sweep'],
                       'SOR blends the old value with a Gauss–Seidel-style update. The factor ω controls the size of that move.',
                       'ω modifies an update; it does not rewrite the original system.', difficulty='hard' if depth == 'deep' else 'medium',
                       misconception_feedback=[
                           'The equation order comes from the chosen sweep. The relaxation factor controls the size of the move after that update is calculated.',
                           'Reusing new values is a Gauss–Seidel feature that SOR builds on. The relaxation factor controls how far the estimate moves.',
                       ])
    else:
        definitions = [item for item in (concept.key_definitions or []) if isinstance(item, dict)]
        useful = [(str(item.get('term') or item.get('name') or '').strip(), str(item.get('definition') or item.get('value') or '').strip()) for item in definitions]
        useful = [(term, definition) for term, definition in useful if term.lower() not in {'key concept', 'concept', 'definition'} and definition]
        focus = useful[0][0] if useful else concept.title
        definition = useful[0][1] if useful else main_idea
        distractors = [value for _, value in useful[1:3] if value != definition]
        while len(distractors) < 2:
            distractors.append((f'{focus} changes the final outcome directly, without affecting the steps that produce it.' if len(distractors) else f'{focus} only becomes relevant after the process is complete.'))
        generic_misconceptions = [
            f'That answer gives {focus} the wrong job. Start with what changes first, then follow its effect through the process.',
            f'The timing is off in that answer. {focus} matters while the process is happening, not only after it finishes.',
        ]
        hook = choice('concept-hook', 'diagnose', f'Before we begin, which explanation best describes what {focus} does?', definition, distractors[:2],
                      f'{focus} is best understood this way: {definition}', f'Focus on what {focus} changes and when it acts.', activity_type='predict',
                      misconception_feedback=generic_misconceptions)
        lesson = base('concept-model', 'learn', 'worked_example', f'Let’s work through {concept.title} once.',
                      content={'idea': main_idea, 'example': summary[:600]}, explanation='Connect the main idea to the example, one step at a time.')
        prompts = {'mathematics': 'What quantity or relationship would you determine first, and why?',
                   'programming': 'Trace one input through the code or process. What output or state change should occur?',
                   'biology': 'Name the structure or process that acts first, then explain its effect.',
                   'conceptual': 'Give a concrete example and explain why it fits rather than merely naming it.'}
        apply = base('concept-apply', 'apply', 'short_answer', prompts[subject], accepted_keywords=list(set(re.findall(r'[A-Za-z]{4,}', f'{concept.title} {main_idea}'.lower())))[:12],
                     explanation=main_idea, hints=[f'Use the relationship described here: {main_idea[:180]}'])
        check = choice('concept-check', 'check', f'{check_lead}which statement best explains how {concept.title} works?', main_idea,
                       distractors[:2], f'Keep this distinction in mind: {main_idea}', f'Ask what changes first and what follows from it.',
                       misconception_feedback=generic_misconceptions, difficulty='hard' if depth == 'deep' else 'medium')

    reflection_prompt = ('In your own words, explain the one difference that separates Jacobi from Gauss–Seidel, then say what SOR adds.' if iterative else f'Explain {concept.title} to Flow in your own words, including one important relationship or example.')
    reflection = base('reflection', 'reflect', 'reflection', reflection_prompt,
                      accepted_keywords=list(set(re.findall(r'[A-Za-z]{4,}', f'{concept.title} {summary}'.lower())))[:16],
                      hints=['Name the idea, describe how it works, then give one consequence or example.'], explanation=main_idea)
    remedial = base('remedial', 'remediate', 'worked_example', 'Pause and rebuild the distinction before trying again.',
                    content={'idea': main_idea, 'example': summary[:600]}, explanation='Focus on one relationship at a time.', difficulty='easy')

    attempts = EncounterAttempt.objects.filter(user=user, concept=concept) if user and getattr(user, 'is_authenticated', False) else EncounterAttempt.objects.none()
    struggling = attempts.filter(correct=False).count() >= 2
    sequence = [hook, lesson, apply, check, reflection]
    if iterative and depth != 'quick':
        sequence = [hook, lesson, ordering, apply, check, reflection]
    if depth == 'quick':
        sequence = [hook, lesson, check, reflection]
    elif depth == 'deep':
        transfer_prompt = ('You want many processors to calculate components at the same time. Which method would you start with, and what update tradeoff are you accepting?' if iterative else f'Apply {concept.title} in a new situation and justify the choice you make.')
        transfer = base('transfer', 'transfer', 'short_answer', transfer_prompt,
                        accepted_keywords=reflection['accepted_keywords'], hints=['State the new situation, choose the relevant idea, and justify the connection.'], explanation=main_idea, difficulty='hard')
        sequence = [hook, lesson, ordering, apply, check, transfer, reflection] if iterative else [hook, lesson, apply, check, transfer, reflection]
    elif goal_mode == 'revision':
        sequence = [hook, apply, check, reflection]
    elif goal_mode == 'mastery':
        transfer_prompt = ('You want many processors to calculate components at the same time. Which method would you start with, and what update tradeoff are you accepting?' if iterative else f'Apply {concept.title} in a new situation and justify the choice you make.')
        transfer = base('transfer', 'transfer', 'short_answer', transfer_prompt,
                        accepted_keywords=reflection['accepted_keywords'], hints=['State the new situation, choose the relevant idea, and justify the connection.'], explanation=main_idea, difficulty='hard')
        sequence = [hook, lesson, ordering, apply, check, transfer, reflection] if iterative else [hook, lesson, apply, check, transfer, reflection]
    if struggling:
        sequence.insert(max(1, len(sequence) - 2), remedial)
    return [item for item in sequence if _valid_activity(item)] or [reflection]


def _valid_activity(activity):
    prompt = str(activity.get('prompt', '')).strip()
    learner_copy = json.dumps({key: value for key, value in activity.items() if key not in {'correct_choice', 'correct_order', 'accepted_keywords', 'feedback_by_choice'}}, default=str)
    banned = r'\bkey concept\b|\bplaceholder\b|\bundefined\b|mechanism in the source|relationship in the source|expected relationship|source alignment'
    if not prompt or re.search(banned, learner_copy, re.I):
        return False
    if activity.get('type') in {'predict', 'mcq', 'scenario'}:
        options = activity.get('options') or []
        return len(options) >= 2 and all(str(option).strip() for option in options) and activity.get('correct_choice') in range(len(options))
    if activity.get('type') == 'ordering':
        items = (activity.get('content') or {}).get('items') or []
        return len(items) >= 3 and sorted(activity.get('correct_order') or []) == list(range(len(items)))
    return True


def _evaluate_activity(concept, activity, response):
    if activity['type'] in {'predict', 'mcq', 'scenario'}:
        try:
            correct = int(response.get('choice')) == activity['correct_choice']
        except (TypeError, ValueError):
            correct = False
        choice_index = int(response.get('choice')) if str(response.get('choice', '')).isdigit() else -1
        feedback_options = activity.get('feedback_by_choice') or []
        feedback = activity.get('explanation', '') if correct else (feedback_options[choice_index] if 0 <= choice_index < len(feedback_options) else activity.get('hints', ['Try the distinction again.'])[0])
        return correct, 100 if correct else 25, feedback

    if activity['type'] == 'ordering':
        submitted = response.get('order') or []
        correct = submitted == activity.get('correct_order')
        feedback = activity.get('explanation', '') if correct else 'The new value needs to be calculated before it can be reused. Move that reuse step directly after the first calculation.'
        return correct, 100 if correct else 30, feedback

    answer = str(response.get('text', '')).strip()
    source = f"{concept.title} {concept.summary} {concept.description}".lower()
    keywords = set(activity.get('accepted_keywords') or []) or {word for word in re.findall(r'[a-zA-Z]{4,}', source) if word not in {'that', 'this', 'with', 'from', 'have', 'into'}}
    answer_words = set(re.findall(r'[a-zA-Z]{4,}', answer.lower()))
    overlap = len(keywords & answer_words)
    score = min(100, 35 + overlap * 12) if len(answer_words) >= 5 else 15
    correct = None if activity['type'] == 'reflection' else score >= 60
    if activity['type'] == 'reflection':
        feedback = 'Yes—the main idea comes through clearly.' if score >= 60 else ('Try naming what changes first, then explain what happens because of it.' if overlap == 0 else 'You have part of it. Make the connection between the two ideas more explicit.')
    else:
        feedback = 'Yes—the main idea comes through clearly.' if correct else 'Start with the most important change, then explain why it matters in this situation.'
    return correct, score, feedback


def _evidence_score(user, concept, fallback=0):
    """Use the learner's strongest persisted result per mastery activity."""
    best = EncounterAttempt.objects.filter(
        user=user, concept=concept, stage__in=['check', 'reflect', 'transfer']
    ).values('activity_id').annotate(best=Max('score'))
    scores = [item['best'] for item in best]
    return int(sum(scores) / len(scores)) if scores else int(fallback)


def _teaching_objectives(concept):
    title = concept.title.lower()
    if any(term in title for term in ('jacobi', 'gauss-seidel', 'gauss seidel', 'sor')):
        return [
            {'id': 'iterative-purpose', 'text': 'Explain why iterative methods improve an estimate over repeated sweeps.'},
            {'id': 'jacobi-update', 'text': 'Explain how Jacobi uses values from the previous iterate.'},
            {'id': 'seidel-update', 'text': 'Explain how Gauss–Seidel reuses newly calculated values.'},
            {'id': 'compare-reuse', 'text': 'Compare old-value and new-value reuse.'},
            {'id': 'sor-role', 'text': 'Explain what the SOR relaxation factor changes.'},
            {'id': 'transfer', 'text': 'Apply the distinctions in a new situation.'},
        ]
    summary = (_grounding(concept).get('excerpt') or concept.summary or concept.description or '').strip()
    sentences = [sentence.strip() for sentence in re.split(r'(?<=[.!?])\s+', summary) if sentence.strip()]
    objectives = [{'id': f'objective-{index + 1}', 'text': sentence[:220]} for index, sentence in enumerate(sentences[:4])]
    objectives.append({'id': 'apply', 'text': f'Apply {concept.title} in a concrete situation.'})
    return objectives


def _public_activity(activity):
    hidden = {'correct_choice', 'correct_order', 'accepted_keywords', 'feedback_by_choice', 'explanation', 'hints'}
    return {key: value for key, value in activity.items() if key not in hidden}


def _turn_data(turn):
    return {'id': str(turn.id), 'role': turn.role, 'kind': turn.kind, 'content': turn.content,
            'payload': turn.payload, 'created_at': turn.created_at.isoformat()}


def _session_data(session):
    turns = list(session.turns.order_by('-created_at')[:40])
    turns.reverse()
    return {
        'id': str(session.id), 'status': session.status, 'current_point': session.current_point,
        'resume_point': session.resume_point, 'objectives': session.objectives,
        'objectives_covered': session.objectives_covered, 'objectives_understood': session.objectives_understood,
        'unresolved_misconceptions': session.unresolved_misconceptions, 'mastery': session.mastery,
        'conversation_summary': session.conversation_summary, 'turns': [_turn_data(turn) for turn in turns],
        'last_active_at': session.last_active_at.isoformat(), 'completed': session.status == 'completed',
    }


def _get_teaching_session(concept, user):
    objectives = _teaching_objectives(concept)
    session, created = TeachingSession.objects.get_or_create(user=user, concept=concept, defaults={'objectives': objectives})
    if not session.objectives:
        session.objectives = objectives
        session.save(update_fields=['objectives', 'last_active_at'])
    if created:
        profile = (getattr(user, 'onboarding_status', None) or {}).get('onboarding_v2', {})
        learner_name = (getattr(user, 'first_name', '') or getattr(user, 'username', '') or 'there').split()[0]
        TeachingTurn.objects.create(session=session, role='flow', content=f"Hey {learner_name} 👋 Ready to learn {concept.title}?")
        session.state = {'learner_type': profile.get('learner_type'), 'difficulty_areas': profile.get('difficulty_areas', []), 'resource_ids': [concept.source_resource_id] if concept.source_resource_id else []}
        session.save(update_fields=['state', 'last_active_at'])
    return session


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
    @transaction.atomic
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

    @action(detail=True, methods=['get'], url_path='teaching-session')
    def teaching_session(self, request, pk=None):
        concept = self.get_object()
        return Response(_session_data(_get_teaching_session(concept, request.user)))

    @action(detail=True, methods=['post'], url_path='teaching-message')
    @transaction.atomic
    def teaching_message(self, request, pk=None):
        concept = self.get_object()
        session = _get_teaching_session(concept, request.user)
        text = str(request.data.get('message', '')).strip()
        key = str(request.data.get('idempotency_key', '')).strip()[:80]
        if not text:
            return Response({'error': 'Message is required'}, status=400)
        if key and TeachingTurn.objects.filter(session=session, idempotency_key=key).exists():
            return Response(_session_data(session))
        TeachingTurn.objects.create(session=session, role='learner', content=text, idempotency_key=key)
        lowered = text.lower()
        activities = _concept_activities(concept, request.user)
        flow_text, kind, payload = '', 'message', {}

        if any(phrase in lowered for phrase in ('show me a video', 'find a video', 'need to see this', 'video')):
            from ai_assistant.youtube_search import search_youtube
            query = f'{concept.title} {text} {getattr(concept.source_resource, "subject", "")} explained'
            videos = search_youtube(query, max_results=3, duration_limit=1200)
            kind, payload = 'video', {'videos': videos[:2]}
            flow_text = ('I found a focused visual explanation. Watch for the exact distinction we were discussing, then we’ll check whether it clicked.' if videos else "I couldn't find a video I'd trust enough to recommend. No detour—we can keep working through it here.")
        elif any(phrase in lowered for phrase in ('make flashcards', 'create flashcards', 'revise later', 'flash cards')):
            grounding = _grounding(concept)
            cards = [{'question': objective['text'], 'answer': (grounding.get('excerpt') or concept.summary or concept.description)[:420], 'difficulty': concept.difficulty} for objective in session.objectives[:3]]
            kind, payload = 'flashcards', {'cards': cards, 'saved': False}
            flow_text = 'Here are three grounded cards from what we’re learning. Save them if they feel useful for revision.'
        elif any(phrase in lowered for phrase in ("don't understand", 'do not understand', "don't get", 'wait', 'why?', 'explain that', 'slow down', 'confused')):
            session.resume_point = session.current_point
            session.status = 'remediation'
            misconception = text[:240]
            issues = list(session.unresolved_misconceptions)
            if misconception not in issues:
                issues.append(misconception)
            session.unresolved_misconceptions = issues[-8:]
            main = (_grounding(concept).get('excerpt') or concept.summary or concept.description or concept.title)
            flow_text = f"Let’s slow it down. **Key distinction:** {main[:360]}\n\nTry picturing one value being updated, then ask: can the next calculation use it immediately? Tell me when that part feels clearer."
        elif session.status == 'remediation' and any(word in lowered for word in ('okay', 'continue', 'got it', 'makes sense', 'yes')):
            session.status = 'teaching'
            session.current_point = session.resume_point
            flow_text = "Good. Back to the exact point we paused: the timing of when a fresh value becomes available changes the method’s behavior. Let’s use that in the next example."
            next_activity = next((item for item in activities if item['purpose'] in {'apply', 'check'}), None)
            if next_activity:
                kind, payload = 'activity', {'activity': _public_activity(next_activity)}
        elif session.status == 'not_started' or session.current_point == 0:
            session.status = 'teaching'
            session.current_point = 1
            first_objective = session.objectives[0]['id'] if session.objectives else ''
            session.objectives_covered = list(dict.fromkeys([*session.objectives_covered, first_objective]))
            teaching = next((item for item in activities if item['type'] in {'comparison', 'worked_example'}), None)
            flow_text = "Perfect. We’ll build this one distinction at a time—no formula avalanche. **Key distinction:** iterative methods improve a current estimate through repeated sweeps."
            if teaching:
                kind, payload = 'activity', {'activity': _public_activity(teaching)}
        elif any(phrase in lowered for phrase in ('practice', 'quiz me', 'question', 'test me', 'example')):
            activity = next((item for item in activities if item['purpose'] in {'apply', 'check', 'transfer'} and item['id'] not in session.state.get('shown_activity_ids', [])), None)
            if activity:
                shown = [*session.state.get('shown_activity_ids', []), activity['id']]
                session.state = {**session.state, 'shown_activity_ids': shown[-12:]}
                session.status = 'practicing'
                flow_text, kind, payload = "Let’s test the idea with one useful move—not a question barrage.", 'activity', {'activity': _public_activity(activity)}
            else:
                flow_text = "You’ve worked through the useful checks here. Let’s explain the distinction once in your own words."
        else:
            recent = list(session.turns.order_by('-created_at')[:8].values('role', 'content'))
            prompt = ("You are Flow, a warm, witty, concise personal tutor. Answer the learner in under 100 words. "
                      "Teach before assessing, use at most one light joke, and end with a natural continuation only when useful. "
                      f"Concept: {concept.title}\nGoal: {concept.path.goal}\nDepth: {concept.path.depth}\n"
                      f"Teaching point: {session.current_point}\nResume point: {session.resume_point}\nMisconceptions: {session.unresolved_misconceptions}\n"
                      f"Grounding: {_grounding(concept)}\nRecent turns: {recent}\nLearner: {text}")
            try:
                from ai_assistant.services import AIService
                flow_text = AIService().ask_about_resource(concept.source_resource, prompt) if concept.source_resource else AIService().chat_sync([{'role': 'user', 'content': prompt}])
            except Exception:
                logger.exception('Teaching conversation failed for %s', concept.id)
                flow_text = "I lost the thread for a second, but your progress is safe. Try that question once more and I’ll pick it up from here."

        turn = TeachingTurn.objects.create(session=session, role='flow', kind=kind, content=flow_text, payload=payload)
        session.conversation_summary = f"At teaching point {session.current_point}. Latest learner need: {text[:180]}. Latest Flow response: {flow_text[:260]}"
        session.save()
        data = _session_data(session)
        data['new_turn_id'] = str(turn.id)
        return Response(data, status=201)

    @action(detail=True, methods=['post'], url_path='teaching-response')
    @transaction.atomic
    def teaching_response(self, request, pk=None):
        concept = self.get_object()
        session = _get_teaching_session(concept, request.user)
        activity_id = str(request.data.get('activity_id', ''))
        activity = next((item for item in _concept_activities(concept, request.user) if item['id'] == activity_id), None)
        if not activity or activity['type'] in {'comparison', 'worked_example'}:
            return Response({'error': 'This response cannot be evaluated'}, status=400)
        response_data = request.data.get('response') or {}
        correct, score, feedback = _evaluate_activity(concept, activity, response_data)
        attempt = EncounterAttempt.objects.create(user=request.user, concept=concept, activity_id=activity_id, activity_type=activity['type'], stage=activity['stage'], response=response_data, correct=correct, score=score, feedback=feedback)
        objective_index = min(session.current_point, max(0, len(session.objectives) - 1))
        objective_id = session.objectives[objective_index]['id'] if session.objectives else ''
        session.objectives_covered = list(dict.fromkeys([*session.objectives_covered, objective_id]))
        if correct is not False:
            session.objectives_understood = list(dict.fromkeys([*session.objectives_understood, objective_id]))
            session.current_point = min(len(session.objectives), session.current_point + 1)
            session.status = 'mastery_check' if session.current_point >= len(session.objectives) - 1 else 'teaching'
            content = f"Yep. You caught the useful distinction. {feedback}"
        else:
            session.status = 'remediation'
            session.resume_point = session.current_point
            session.unresolved_misconceptions = [*session.unresolved_misconceptions[-7:], feedback]
            content = feedback
        session.mastery = _evidence_score(request.user, concept, score)
        TeachingTurn.objects.create(session=session, role='learner', kind='activity', content='', payload={'activity_id': activity_id, 'response': response_data})
        TeachingTurn.objects.create(session=session, role='flow', content=content, payload={'correct': correct, 'score': score, 'attempt_id': str(attempt.id)})
        session.save()
        return Response({**_session_data(session), 'evaluation': {'correct': correct, 'score': score, 'feedback': feedback, 'attempt_id': str(attempt.id)}} , status=201)

    @action(detail=True, methods=['post'], url_path='teaching-flashcards/save')
    def save_teaching_flashcards(self, request, pk=None):
        concept = self.get_object()
        if not concept.source_resource:
            return Response({'error': 'A source resource is required to save these cards'}, status=400)
        from library.models import Flashcard
        cards = request.data.get('cards') or []
        saved = [Flashcard.objects.create(resource=concept.source_resource, owner=request.user, question=str(card.get('question', ''))[:1000], answer=str(card.get('answer', ''))[:3000], subject=getattr(concept.source_resource, 'subject', '') or concept.path.title, difficulty=card.get('difficulty', 'medium')) for card in cards[:10] if card.get('question') and card.get('answer')]
        return Response({'saved': len(saved), 'ids': [card.id for card in saved]}, status=201)

    @action(detail=True, methods=['get'], url_path='teaching-voice-context')
    def teaching_voice_context(self, request, pk=None):
        concept = self.get_object()
        session = _get_teaching_session(concept, request.user)
        recent = [_turn_data(turn) for turn in session.turns.order_by('-created_at')[:8]][::-1]
        return Response({'teaching_session_id': str(session.id), 'journey_id': str(concept.path_id), 'unit_id': str(concept.unit_id) if concept.unit_id else None, 'concept_id': str(concept.id), 'current_teaching_point': session.current_point, 'resume_point': session.resume_point, 'resource_ids': session.state.get('resource_ids', []), 'goal': concept.path.goal, 'depth': concept.path.depth, 'mastery': session.mastery, 'unresolved_misconceptions': session.unresolved_misconceptions, 'recent_context': recent, 'conversation_summary': session.conversation_summary})

    @action(detail=True, methods=['post'], url_path='teaching-voice-event')
    @transaction.atomic
    def teaching_voice_event(self, request, pk=None):
        """Merge meaningful voice-tutor events into the persistent teaching state."""
        concept = self.get_object()
        session = _get_teaching_session(concept, request.user)
        event = str(request.data.get('event', '')).strip().lower()
        if event not in {'point_covered', 'point_understood', 'misconception', 'misconception_resolved', 'paused'}:
            return Response({'error': 'Unknown voice teaching event'}, status=400)
        objective_id = str(request.data.get('objective_id', '')).strip()
        misconception = str(request.data.get('misconception', '')).strip()[:500]
        if event == 'point_covered' and objective_id:
            session.objectives_covered = list(dict.fromkeys([*session.objectives_covered, objective_id]))
        elif event == 'point_understood' and objective_id:
            session.objectives_covered = list(dict.fromkeys([*session.objectives_covered, objective_id]))
            session.objectives_understood = list(dict.fromkeys([*session.objectives_understood, objective_id]))
        elif event == 'misconception' and misconception:
            session.unresolved_misconceptions = [*session.unresolved_misconceptions[-7:], misconception]
            session.status = 'remediation'
            session.resume_point = session.current_point
        elif event == 'misconception_resolved' and misconception:
            session.unresolved_misconceptions = [item for item in session.unresolved_misconceptions if item != misconception]
            session.status = 'teaching'
        elif event == 'paused':
            session.resume_point = session.current_point
            session.status = 'paused'
        summary = str(request.data.get('summary', '')).strip()[:1000]
        if summary:
            session.conversation_summary = summary
        TeachingTurn.objects.create(session=session, role='system', kind='voice', content=summary, payload={'event': event, 'objective_id': objective_id, 'misconception': misconception})
        session.save()
        return Response(_session_data(session))

    @action(detail=True, methods=['get'])
    def activities(self, request, pk=None):
        concept = self.get_object()
        activities = _concept_activities(concept, request.user)
        private_keys = {'correct_choice', 'correct_order', 'accepted_keywords', 'feedback_by_choice'}
        public_activities = []
        for item in activities:
            hidden = private_keys | ({'explanation'} if item['type'] in {'predict', 'mcq', 'scenario'} else set())
            public_activities.append({key: value for key, value in item.items() if key not in hidden})
        return Response({'activities': public_activities, 'subject_family': _subject_family(concept),
                         'goal_mode': _goal_mode(concept), 'depth': concept.path.depth,
                         'attempt_count': EncounterAttempt.objects.filter(user=request.user, concept=concept).count()})

    @action(detail=True, methods=['post'])
    def attempt(self, request, pk=None):
        concept = self.get_object()
        activity_id = request.data.get('activity_id', '')
        activity = next((item for item in _concept_activities(concept, request.user) if item['id'] == activity_id), None)
        if not activity:
            return Response({'error': 'Unknown or expired activity'}, status=400)
        if activity['type'] in {'comparison', 'worked_example'}:
            return Response({'error': 'This learning activity does not accept an answer'}, status=400)
        response_data = request.data.get('response') or {}
        correct, score, feedback = _evaluate_activity(concept, activity, response_data)
        attempt = EncounterAttempt.objects.create(
            user=request.user, concept=concept, activity_id=activity_id,
            activity_type=activity['type'], stage=activity['stage'],
            response=response_data, correct=correct, score=score, feedback=feedback,
        )
        evidence_score = _evidence_score(request.user, concept, score)
        activity_attempts = EncounterAttempt.objects.filter(user=request.user, concept=concept, activity_id=activity_id).count()
        hints = activity.get('hints') or ['']
        hint = hints[min(max(activity_attempts - 1, 0), len(hints) - 1)]
        return Response({'attempt_id': str(attempt.id), 'correct': correct, 'score': score,
                         'feedback': feedback, 'explanation': activity.get('explanation', ''),
                         'hint': hint,
                         'evidence_score': evidence_score, 'attempt_number': activity_attempts,
                         'recommend_flow': correct is False and activity_attempts >= 2}, status=201)

    @action(detail=True, methods=['post'], url_path='ask-flow')
    def ask_flow(self, request, pk=None):
        concept = self.get_object()
        question = str(request.data.get('question') or request.data.get('action') or '').strip()
        if not question:
            return Response({'error': 'Question is required'}, status=400)
        from ai_assistant.services import AIService
        activity_id = str(request.data.get('activity_id', ''))
        activity = next((item for item in _concept_activities(concept, request.user) if item['id'] == activity_id), None)
        recent = list(EncounterAttempt.objects.filter(user=request.user, concept=concept).order_by('-created_at')[:5]
                      .values('activity_id', 'stage', 'response', 'correct', 'feedback'))
        learner_response = request.data.get('learner_response')
        context = (
            "Respond like a patient human tutor in at most 80 words unless the learner explicitly asks for depth. "
            "Begin with '**Key distinction:**' followed by one crisp sentence. Use clean Markdown. "
            "For a hint, guide the next thought without revealing the answer. Never mention rubrics, evaluation, source alignment, generation, or internal activity terminology.\n"
            f"Journey: {concept.path.title}\nGoal: {concept.path.goal}\nUnit: {concept.unit.title if concept.unit else ''}\n"
            f"Depth: {concept.path.depth}\nConcept: {concept.title}\nStage: {request.data.get('stage', '')}\n"
            f"Activity: {activity.get('prompt') if activity else ''}\nActivity type: {activity.get('type') if activity else ''}\n"
            f"Learner response: {learner_response}\nCorrectness: {request.data.get('correct')}\nRecent attempts: {recent}\n"
            f"Mastery: {concept.mastery}\nSource: {_grounding(concept)}\nSummary: {concept.summary}\n"
            f"Learner request: {question}"
        )
        try:
            if concept.source_resource:
                answer = AIService().ask_about_resource(concept.source_resource, context)
            else:
                answer = AIService().chat_sync([{'role': 'user', 'content': context}])
        except Exception:
            logger.exception('Contextual Flow failed for concept %s', concept.id)
            return Response({'error': 'Flow could not answer right now'}, status=503)
        return Response({'answer': answer})

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

        score = _evidence_score(request.user, concept, request.data.get('score', 80))

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

        teaching_session = TeachingSession.objects.filter(user=request.user, concept=concept).first()
        if teaching_session and teaching_session.status != 'completed':
            teaching_session.status = 'completed'
            teaching_session.mastery = score
            teaching_session.current_point = len(teaching_session.objectives)
            teaching_session.objectives_covered = [item['id'] for item in teaching_session.objectives]
            teaching_session.objectives_understood = [item['id'] for item in teaching_session.objectives]
            TeachingTurn.objects.create(session=teaching_session, role='flow', kind='completion', content='You did it. This concept is complete, and your Journey is ready for the next step.', payload={'mastery': score})
            teaching_session.save()

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
            'mastery': concept.mastery,
            'xp_earned': concept.xp_earned,
            'unlocked': newly_unlocked,
            'reward': reward,
        })

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        """Submit a review score and update spaced repetition."""
        concept = self.get_object()
        score = _evidence_score(request.user, concept, request.data.get('score', 0))

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
