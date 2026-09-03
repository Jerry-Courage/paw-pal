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

from .models import EncounterAttempt, LearningPath, ConceptNode, ConceptReview, Unit, TeachingSession, TeachingTurn, LearningArtifact, JourneyMasteryAttempt
from .completion import evaluate_feynman_explanation, evaluate_session_completion, finalize_teaching_session, record_objective_evidence
from .serializers import (LearningPathSerializer, LearningPathListSerializer,
                           ConceptNodeSerializer, ConceptNodeDetailSerializer,
                           ConceptReviewSerializer, UnitSerializer)
from .spaced_repetition import calculate_next_review, get_due_concepts, get_review_stats
from .presentation import classify_presentation, grounded_distractors
from .teaching_plan import get_or_create_teaching_plan, teaching_activities_from_plan
from .player import continue_player_stage, sync_player_state

logger = logging.getLogger(__name__)


def _artifact_data(item):
    return {'id': str(item.id), 'type': item.artifact_type, 'title': item.title,
            'content': item.content, 'provenance': item.provenance,
            'journey_id': str(item.path_id), 'journey_title': item.path.title,
            'objective_id': str(item.concept_id or ''), 'objective_title': item.concept.title if item.concept else '',
            'source_id': item.resource_id, 'source_title': item.resource.title if item.resource else '',
            'created_at': item.created_at.isoformat()}


def _current_objective(session):
    if not session.objectives:
        return {}
    return session.objectives[min(session.current_point, len(session.objectives) - 1)]

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


def _objective_kind(text):
    """Classify what evidence an objective calls for without handing control to the LLM."""
    value = str(text or '').lower()
    if any(word in value for word in ('compare', 'contrast', 'distinguish', 'difference')):
        return 'comparison'
    if any(word in value for word in ('calculate', 'compute', 'solve', 'derive')):
        return 'calculation'
    if any(word in value for word in ('steps', 'sequence', 'procedure', 'process', 'algorithm', 'how ')):
        return 'process'
    if any(word in value for word in ('why ', 'reason', 'cause', 'because')):
        return 'reasoning'
    if any(word in value for word in ('apply', 'use ', 'situation', 'scenario')):
        return 'application'
    return 'definition'


def _meaningful_keywords(text):
    stop = {'about', 'after', 'again', 'because', 'before', 'being', 'could', 'first', 'from',
            'have', 'into', 'itself', 'might', 'other', 'should', 'their', 'there', 'these',
            'thing', 'those', 'through', 'using', 'what', 'when', 'where', 'which', 'while',
            'with', 'would'}
    return list(dict.fromkeys(word for word in re.findall(r'[a-zA-Z]{4,}', str(text).lower()) if word not in stop))[:16]


def _is_non_answer(value):
    normalized = re.sub(r"[^a-z0-9?' ]+", ' ', str(value or '').lower())
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    non_answers = {
        '', '?', 'ok', 'okay', 'alright', 'got it', 'i got it', 'yeah', 'yes', 'yep', 'yh',
        'sure', 'cool', 'continue', 'next', 'go on', 'idk', "i don't know", 'i dont know',
        'no idea', 'makes sense', 'i understand', 'ready', "let's go", 'lets go',
    }
    return normalized in non_answers or (len(normalized) < 3 and not normalized.isdigit())


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
        objective_kind = _objective_kind(main_idea)
        apply_prompt = (f'In your own words, what does {concept.title} help us understand or do? Use this idea in your answer: {main_idea}'
                        if objective_kind == 'definition' else
                        f'Using this idea — {main_idea} — explain the next important step or connection in {concept.title}.')
        apply = base('concept-apply', 'apply', 'short_answer', apply_prompt,
                     objective_id='objective-1', check_level='transfer',
                     accepted_keywords=_meaningful_keywords(f'{concept.title} {main_idea}'),
                     expected_concept=main_idea,
                     explanation=main_idea, hints=[f'Use the idea Flow just taught: {main_idea[:180]}'])
        check = choice('concept-check', 'check', f'{check_lead}which statement best describes {concept.title}?', main_idea,
                       distractors[:2], f'Keep this distinction in mind: {main_idea}', f'Ask what changes first and what follows from it.',
                       misconception_feedback=generic_misconceptions, difficulty='easy',
                       objective_id='objective-1', check_level='recognition', expected_concept=main_idea)

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


def _objective_activities(session, user=None):
    """Single factory for checks belonging to the session's current objective."""
    concept = session.concept
    objective_index = min(session.current_point, max(0, len(session.objectives) - 1))
    objective = session.objectives[objective_index] if session.objectives else {'id': 'objective-1', 'text': concept.title}
    objective_id = objective['id']
    grounding = _grounding(concept)
    plan = get_or_create_teaching_plan(session, grounding)
    presentations = teaching_activities_from_plan(
        concept, {**objective, 'index': objective_index}, plan,
        lambda suffix: _activity_id(concept, f'presentation:{suffix}'),
    )
    base_activities = _concept_activities(concept, user)
    if objective_index == 0:
        scoped = []
        for activity in base_activities:
            if activity.get('purpose') in {'check', 'apply', 'transfer'}:
                activity = {**activity, 'objective_id': objective_id, 'objective_index': objective_index}
                scoped.append(activity)
        return [*presentations, *scoped]

    fact = str(objective.get('text') or '').strip().rstrip('.')
    kind = _objective_kind(fact)
    provenance = {key: value for key, value in grounding.items() if value not in ('', None)}
    keywords = _meaningful_keywords(f'{concept.title} {fact}')
    correct = fact
    nearby = [item.get('text', '') for item in session.objectives if item.get('id') != objective_id]
    distractors = grounded_distractors(fact, nearby)
    prompt_by_kind = {
        'definition': f'Which statement best describes {concept.title}?',
        'process': f'What best explains how {concept.title} works?',
        'application': f'When would this part of {concept.title} be useful?',
        'comparison': f'Which statement gets the distinction right?',
        'calculation': 'What needs to be calculated here?',
        'reasoning': f'Why does this matter for {concept.title}?',
    }

    def objective_base(key, purpose, activity_type, prompt, **extra):
        return {'id': _activity_id(concept, f'{key}:{objective_id}'), 'concept_id': str(concept.id),
                'objective_id': objective_id, 'objective_index': objective_index, 'purpose': purpose,
                'stage': purpose, 'type': activity_type, 'instructions': extra.pop('instructions', ''),
                'prompt': prompt, 'difficulty': extra.pop('difficulty', 'easy'),
                'estimated_seconds': extra.pop('estimated_seconds', 60), 'grounding': provenance,
                'goal_relevance': concept.path.goal or '', **extra}

    options = [correct, *distractors[:2]]
    shift = int(hashlib.sha256(f'{concept.id}:{objective_id}:recognition'.encode()).hexdigest()[:2], 16) % len(options)
    options = options[shift:] + options[:shift]
    recognition = objective_base(
        'objective-recognition', 'check', 'mcq', prompt_by_kind[kind], options=options,
        correct_choice=options.index(correct), feedback_by_choice=[
            f'Exactly. {fact}.' if option == correct else f'That changes the checkpoint into a different claim. The distinction here is: {fact}.'
            for option in options], explanation=f'Exactly. {fact}.', hints=[f'Use the current checkpoint: {fact}.'],
        expected_concept=fact, check_level='recognition',
    )
    transfer = objective_base(
        'objective-transfer', 'apply', 'short_answer',
        f'Put this idea in your own words: why does it matter for {concept.title}?',
        accepted_keywords=keywords, expected_concept=fact, explanation=fact,
        hints=[f'Start with this checkpoint: {fact}.'], check_level='transfer', difficulty='medium',
    )
    return [*presentations, *[activity for activity in (recognition, transfer) if _valid_activity(activity)]]


def _clear_objective_transient_state(state):
    transient = {
        'last_learning_object', 'pending_remediation', 'retry_state', 'pending_activity_continuation',
        'current_representation', 'current_question', 'pending_intent', 'quick_action_context',
    }
    return {key: value for key, value in state.items() if key not in transient}


def _valid_activity(activity):
    prompt = str(activity.get('prompt', '')).strip()
    learner_copy = json.dumps({key: value for key, value in activity.items() if key not in {'correct_choice', 'correct_order', 'accepted_keywords', 'feedback_by_choice'}}, default=str)
    banned = r'\bkey concept\b|\bplaceholder\b|\bundefined\b|mechanism in the source|relationship in the source|expected relationship|source alignment'
    if not prompt or re.search(banned, learner_copy, re.I):
        return False
    if re.search(r'\b(this|that|the) (?:situation|scenario|diagram|example)\b', prompt, re.I) and not any(
        marker in prompt.lower() for marker in ('imagine', 'suppose', 'for example', 'using this idea', 'an engineer', 'a learner')
    ):
        return False
    if activity.get('type') in {'predict', 'mcq', 'scenario'}:
        options = activity.get('options') or []
        return len(options) >= 2 and all(str(option).strip() for option in options) and activity.get('correct_choice') in range(len(options))
    if activity.get('type') == 'ordering':
        items = (activity.get('content') or {}).get('items') or []
        return len(items) >= 3 and sorted(activity.get('correct_order') or []) == list(range(len(items)))
    if activity.get('type') in {'short_answer', 'reflection'} and not (activity.get('accepted_keywords') or activity.get('expected_concept')):
        return False
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
        return correct, 100 if correct else 25, feedback, 'correct' if correct else 'incorrect'

    if activity['type'] == 'ordering':
        submitted = response.get('order') or []
        correct = submitted == activity.get('correct_order')
        feedback = activity.get('explanation', '') if correct else 'The new value needs to be calculated before it can be reused. Move that reuse step directly after the first calculation.'
        return correct, 100 if correct else 30, feedback, 'correct' if correct else 'incorrect'

    answer = str(response.get('text', '')).strip()
    if _is_non_answer(answer):
        return False, 0, 'Give me your actual answer 👀. One clear thought is enough.', 'insufficient'
    source = f"{concept.title} {concept.summary} {concept.description}".lower()
    keywords = set(activity.get('accepted_keywords') or []) or {word for word in re.findall(r'[a-zA-Z]{4,}', source) if word not in {'that', 'this', 'with', 'from', 'have', 'into'}}
    answer_words = set(re.findall(r'[a-zA-Z]{4,}', answer.lower()))
    overlap = len(keywords & answer_words)
    score = min(100, 35 + overlap * 12) if len(answer_words) >= 5 else 15
    correct = None if activity['type'] == 'reflection' else score >= 60
    if activity['type'] == 'reflection':
        feedback = 'Yes—the main idea comes through clearly.' if score >= 60 else ('Try naming what changes first, then explain what happens because of it.' if overlap == 0 else 'You have part of it. Make the connection between the two ideas more explicit.')
    else:
        expected = str(activity.get('expected_concept') or activity.get('explanation') or concept.summary or concept.title).strip()
        if correct:
            feedback = f'Exactly. {expected[:220]}'
        elif overlap:
            feedback = f"You're close. Your answer mentions part of the idea, but it still needs this distinction: {expected[:220]}"
        else:
            quoted = answer[:90]
            feedback = f'Your answer — “{quoted}” — misses the central distinction. {expected[:220]}'
    outcome = 'correct' if correct is True else ('partial' if score >= 35 else 'incorrect')
    return correct, score, feedback, outcome


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
    payload = dict(turn.payload or {})
    activity = payload.get('activity')
    if activity and activity.get('purpose') in {'learn', 'remediate'}:
        payload.setdefault('learning_objects', [activity])
    return {'id': str(turn.id), 'role': turn.role, 'kind': turn.kind, 'content': turn.content,
            'payload': payload, 'created_at': turn.created_at.isoformat()}


def _session_data(session):
    turns = list(session.turns.order_by('-created_at')[:40])
    turns.sort(key=lambda turn: (turn.created_at, 0 if turn.role == 'learner' else 1))
    evaluation = evaluate_session_completion(session)
    current_index = min(session.current_point, max(0, len(session.objectives) - 1))
    current_objective_id = session.objectives[current_index]['id'] if session.objectives else ''
    active = session.state.get('last_learning_object') or {}
    active_activity_id = active.get('activity_id', '') if active.get('objective_id') == current_objective_id else ''
    player_activities = [_public_activity(activity) for activity in _objective_activities(session, session.user)]
    player = sync_player_state(session, player_activities, turns)
    return {
        'id': str(session.id), 'status': session.status, 'current_point': session.current_point,
        'resume_point': session.resume_point, 'objectives': session.objectives,
        'objectives_covered': session.objectives_covered, 'objectives_understood': session.objectives_understood,
        'unresolved_misconceptions': session.unresolved_misconceptions, 'mastery': session.mastery,
        'conversation_summary': session.conversation_summary, 'turns': [_turn_data(turn) for turn in turns],
        'teaching_preferences': session.state.get('teaching_preferences', {}),
        'teaching_plan': (session.state.get('teaching_plans') or {}).get(current_objective_id, {}).get('plan'),
        'teaching_phase': session.state.get('teaching_phase', 'INTRODUCE'),
        'current_objective_id': current_objective_id, 'active_activity_id': active_activity_id,
        'player': player,
        'last_active_at': session.last_active_at.isoformat(), 'completed': session.status == 'completed',
        'completion_evaluation': evaluation,
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
        stable_preferences = (getattr(user, 'onboarding_status', None) or {}).get('teaching_preferences', {})
        session.state = {'learner_type': profile.get('learner_type'), 'difficulty_areas': profile.get('difficulty_areas', []), 'resource_ids': [concept.source_resource_id] if concept.source_resource_id else [], 'teaching_preferences': stable_preferences, 'teaching_phase': 'INTRODUCE'}
        first_objective = session.objectives[0]['id'] if session.objectives else ''
        session.objectives_covered = list(dict.fromkeys([*session.objectives_covered, first_objective]))
        record_objective_evidence(session, first_objective, taught=True)
        activities = _objective_activities(session, user)
        teaching = next((item for item in activities if item.get('purpose') == 'learn'), None)
        check = _next_journey_check(session, activities)
        payload = {'pedagogical_action': 'CHECK'}
        if teaching:
            payload['learning_objects'] = [_public_activity(teaching)]
            session.state = {**session.state, 'recent_representations': [teaching['type']]}
        if check:
            payload.update({'activity': _public_activity(check), 'active_activity_id': check['id'], 'reused': False})
        TeachingTurn.objects.create(
            session=session, role='flow', kind='activity' if check or teaching else 'message',
            content="Start with this idea. Explore it first—then use the quick check when you’re ready.",
            payload=payload,
        )
        session.save()
    return session


def _journey_message_intent(text):
    """Classify conversational intent while the pedagogical controller remains authoritative."""
    normalized = re.sub(r"[^a-z0-9' ]+", ' ', str(text).lower())
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    if re.fullmatch(r"(?:hi|hello|hey|yo|good (?:morning|afternoon|evening))(?: flow)?", normalized):
        return 'SOCIAL'
    if re.search(r"\b(thanks|thank you|cheers)\b", normalized):
        return 'SOCIAL_ACKNOWLEDGEMENT'
    if re.search(r"\b(that(?:'s| is) easy|too easy|make it harder)\b", normalized):
        return 'EASY'
    if re.search(r"\b(show|give) me (?:an?|another) example\b|\bmake (?:it|this) concrete\b", normalized):
        return 'REQUEST_EXAMPLE'
    if re.search(r"\b(explain|say|make) (?:it|that|this)? ?(?:more )?simply\b|\bsimpler\b", normalized):
        return 'REQUEST_SIMPLIFY'
    if re.search(r"\b(ok(?:ay)? )?(?:let'?s|lets) try again\b|\btry again\b", normalized):
        return 'REQUEST_CONTINUE'
    if re.search(r"\b(explain (?:it|that|this) again|re-?explain|another explanation)\b", normalized):
        return 'REEXPLAIN'
    if re.search(r"\b(i (?:do not|don't) (?:understand|get it)|confused|lost me|that makes no sense)\b", normalized):
        return 'REMEDIATE'
    advance = {
        'ok', 'okay', 'alright', 'got it', 'yh', 'yeah', 'sure', 'cool', 'continue', 'next',
        "what's next", 'what is next', 'go on', 'go ahead', 'i see', 'makes sense', 'i understand',
        'move on', "let's move on", "let's go", 'yes', 'is that all', 'can we move on',
    }
    if normalized in advance:
        return 'ACKNOWLEDGEMENT' if normalized in {'ok', 'okay', 'got it', 'yeah', 'i see', 'makes sense', 'i understand'} else 'PROCEED'
    if '?' in str(text) or re.search(r'\b(what|why|how|when|where|can you|could you)\b', normalized):
        return 'QUESTION'
    return 'OPEN'


def _next_journey_check(session, activities):
    shown = session.state.get('shown_activity_ids', [])
    candidates = [item for item in activities if item.get('purpose') in {'check', 'apply', 'transfer'}]
    objective_index = min(session.current_point, max(0, len(session.objectives) - 1))
    objective_id = session.objectives[objective_index]['id'] if session.objectives else ''
    grounded = [item for item in candidates if item.get('objective_id') == objective_id]
    pool = grounded or candidates
    pool = sorted(pool, key=lambda item: 0 if item.get('check_level') == 'recognition' else 1)
    activity = next((item for item in pool if item['id'] not in shown), None) or next(iter(pool), None)
    if activity:
        session.state = {
            **session.state,
            'teaching_phase': 'CHECK',
            'shown_activity_ids': [*shown, activity['id']][-12:],
            'last_learning_object': {'type': 'practice', 'activity_id': activity['id'], 'objective_id': objective_id},
        }
        session.status = 'practicing'
    return activity


def _remediation_activity(concept, objective, attempted_activity, learner_response, feedback, used_modes=None):
    """Build a focused alternate representation from the learner's actual miss."""
    grounding = _grounding(concept)
    source_idea = (grounding.get('excerpt') or concept.summary or concept.description or objective.get('text') or concept.title).strip()
    expected = str(attempted_activity.get('expected_concept') or attempted_activity.get('explanation') or source_idea).strip()
    kind = _objective_kind(objective.get('text'))
    response_words = set(_meaningful_keywords(learner_response))
    used_modes = set(used_modes or [])
    exact_approx = bool(response_words & {'exact', 'approximate', 'approximation'}) or any(
        word in expected.lower() for word in ('exact', 'approximate', 'approximation')
    )
    if exact_approx or kind == 'comparison':
        content = {
            'mode': 'comparison',
            'title': 'Put the two ideas side by side',
            'lead': 'The distinction is easier to see as a choice, not another definition.',
            'columns': ['Exact or symbolic route', 'Numerical route'],
            'rows': [
                ['Aims for a closed-form result when one is practical.', 'Uses repeatable computation to reach a controlled, useful result.'],
                ['May be difficult or unavailable for a real problem.', expected[:320]],
            ],
            'takeaway': expected[:360],
        }
        activity_type = 'comparison'
    elif kind in {'process', 'calculation'} or 'example' in used_modes:
        content = {
            'mode': 'steps', 'title': 'Walk it through one move at a time',
            'lead': 'Focus on the order of the reasoning.',
            'steps': ['Start with the information you have.', expected[:260], 'Check whether the result fits the goal.'],
            'takeaway': expected[:360],
        }
        activity_type = 'worked_example'
    else:
        content = {
            'mode': 'example', 'title': 'Make it concrete',
            'lead': f'Forget the formal wording for a moment. Imagine a real problem where {concept.title.lower()} is needed.',
            'example': source_idea[:420], 'takeaway': expected[:360],
        }
        activity_type = 'worked_example'
    key = f"remediate:{objective.get('id')}:{attempted_activity.get('id')}:{content['mode']}"
    return {
        'id': _activity_id(concept, key), 'concept_id': str(concept.id), 'purpose': 'remediate',
        'stage': 'remediate', 'type': activity_type, 'prompt': content['title'], 'instructions': '',
        'content': content, 'difficulty': 'easy', 'estimated_seconds': 60,
        'grounding': {key: value for key, value in grounding.items() if value not in ('', None)},
        'goal_relevance': concept.path.goal or '', 'objective_id': objective.get('id', ''),
        'feedback_context': feedback[:260],
    }


def _unanswered_journey_check(session, activities):
    active = session.state.get('last_learning_object') or {}
    objective_index = min(session.current_point, max(0, len(session.objectives) - 1))
    objective_id = session.objectives[objective_index]['id'] if session.objectives else ''
    if active.get('type') != 'practice' or active.get('objective_id') != objective_id:
        return None
    activity_id = str(active.get('activity_id') or '')
    if not activity_id or EncounterAttempt.objects.filter(user=session.user, concept=session.concept, activity_id=activity_id).exists():
        return None
    activity = next((item for item in activities if item['id'] == activity_id), None)
    if activity:
        session.state = {**session.state, 'teaching_phase': 'CHECK'}
        session.status = 'practicing'
    return activity


@transaction.atomic
def submit_teaching_activity(concept, user, activity_id, response_data, idempotency_key=''):
    """Evaluate one Activity Engine V2 response and record authoritative Journey evidence once."""
    session = _get_teaching_session(concept, user)
    key = f'activity:{str(idempotency_key).strip()}'[:80] if idempotency_key else ''
    if key:
        existing = TeachingTurn.objects.filter(session=session, role='learner', kind='activity', idempotency_key=key).first()
        if existing:
            return session, existing.payload.get('evaluation', {}), False
    activity = next((item for item in _objective_activities(session, user) if item['id'] == str(activity_id)), None)
    if not activity or activity['type'] in {'comparison', 'worked_example'}:
        raise ValueError('This response cannot be evaluated')
    correct, score, feedback, outcome = _evaluate_activity(concept, activity, response_data)
    objective_index = min(session.current_point, max(0, len(session.objectives) - 1))
    objective = session.objectives[objective_index] if session.objectives else {'id': '', 'text': concept.title}
    objective_id = objective['id']
    if outcome == 'insufficient':
        result = {'correct': False, 'score': 0, 'feedback': feedback, 'attempt_id': '',
                  'objective_id': objective_id, 'outcome': outcome}
        session.state = {**session.state, 'teaching_phase': 'CHECK'}
        session.status = 'practicing'
        TeachingTurn.objects.create(session=session, role='learner', kind='activity', content='', idempotency_key=key,
                                    payload={'activity_id': activity['id'], 'response': response_data, 'evaluation': result})
        TeachingTurn.objects.create(session=session, role='flow', content=feedback,
                                    payload={**result, 'pedagogical_action': 'CHECK', 'active_activity_id': activity['id'], 'reused': True})
        session.save()
        return session, result, True
    attempt = EncounterAttempt.objects.create(user=user, concept=concept, activity_id=activity['id'], activity_type=activity['type'], stage=activity['stage'], response=response_data, correct=correct, score=score, feedback=feedback)
    session.objectives_covered = list(dict.fromkeys([*session.objectives_covered, objective_id]))
    record_objective_evidence(session, objective_id, taught=True, interaction=True, score=score, source='activity', evidence_id=attempt.id, misconception=feedback if correct is False else '')
    if correct is not False:
        session.objectives_understood = list(dict.fromkeys([*session.objectives_understood, objective_id]))
        session.current_point = min(len(session.objectives), session.current_point + 1)
        session.status = 'mastery_check' if session.current_point >= len(session.objectives) - 1 else 'teaching'
        next_objective = session.objectives[session.current_point] if session.current_point < len(session.objectives) else None
        session.state = {**_clear_objective_transient_state(session.state),
                         'teaching_phase': 'INTRODUCE' if next_objective else 'READY_TO_ADVANCE'}
        next_label = str(next_objective['text']).rstrip('.')[:110] if next_objective else ''
        content = (f"Nice. That checkpoint is clear. ✓\n\nNext: {next_label}." if next_objective
                   else f"✓ Checkpoint cleared. {feedback}")
        flow_payload = {'pedagogical_action': 'ADVANCE'}
    else:
        session.status = 'remediation'
        session.resume_point = session.current_point
        session.unresolved_misconceptions = [*session.unresolved_misconceptions[-7:], feedback]
        session.state = {**session.state, 'teaching_phase': 'REMEDIATE'}
        remedial = _remediation_activity(concept, objective, activity, response_data.get('text', ''), feedback,
                                         session.state.get('recent_remediation_modes', []))
        remediation_mode = (remedial.get('content') or {}).get('mode')
        session.state = {**session.state, 'recent_remediation_modes': [*session.state.get('recent_remediation_modes', [])[-3:], remediation_mode]}
        content = f"Close, but that answer mixes up the main distinction. {feedback}\n\nLet’s look at it another way."
        flow_payload = {'pedagogical_action': 'REMEDIATE', **({'activity': _public_activity(remedial)} if remedial else {})}
    session.mastery = _evidence_score(user, concept, score)
    result = {'correct': correct, 'score': score, 'feedback': feedback, 'attempt_id': str(attempt.id), 'objective_id': objective_id, 'outcome': outcome}
    TeachingTurn.objects.create(session=session, role='learner', kind='activity', content='', idempotency_key=key, payload={'activity_id': activity['id'], 'response': response_data, 'evaluation': result})
    TeachingTurn.objects.create(session=session, role='flow', content=content, payload={**result, **flow_payload})
    evaluation = evaluate_session_completion(session)
    session.mastery = evaluation['mastery']
    session.unresolved_misconceptions = evaluation['unresolved_misconceptions']
    if evaluation['complete']:
        session.status = 'mastery_check'
    session.save()
    return session, result, True


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

    @action(detail=True, methods=['post'], url_path='set-active')
    @transaction.atomic
    def set_active(self, request, pk=None):
        path = LearningPath.objects.select_for_update().get(pk=pk, user=request.user)
        if path.status == 'completed':
            return Response({'error': 'A completed Journey cannot become active.'}, status=409)
        LearningPath.objects.select_for_update().filter(user=request.user, status='active').exclude(pk=path.pk).update(status='paused')
        if path.status != 'active':
            path.status = 'active'
            path.save(update_fields=['status', 'updated_at'])
        return Response(LearningPathListSerializer(path).data)

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

    @action(detail=True, methods=['get'], url_path='saved-artifacts')
    def saved_artifacts(self, request, pk=None):
        path = self.get_object()
        items = path.artifacts.filter(user=request.user).select_related('concept', 'resource')
        kind = str(request.query_params.get('type', '')).strip()
        if kind:
            items = items.filter(artifact_type=kind)
        return Response({'results': [_artifact_data(item) for item in items[:200]]})

    @action(detail=False, methods=['get'], url_path='saved-artifacts')
    def all_saved_artifacts(self, request):
        items = LearningArtifact.objects.filter(user=request.user).select_related('path', 'concept', 'resource')
        kind = str(request.query_params.get('type', '')).strip()
        if kind:
            items = items.filter(artifact_type=kind)
        return Response({'results': [_artifact_data(item) for item in items[:300]]})

    @action(detail=True, methods=['get', 'post'], url_path='mastery-challenge')
    @transaction.atomic
    def mastery_challenge(self, request, pk=None):
        path = self.get_object()
        eligible = bool(path.total_concepts and path.concepts_completed == path.total_concepts)
        if not eligible:
            return Response({'journey_id': str(path.id), 'eligible': False, 'challenges': [],
                             'error': 'Complete every required Journey objective before Mastery.'}, status=409)
        concepts = list(path.concepts.order_by('order_index').prefetch_related('teaching_sessions'))
        challenges = []
        for concept in concepts:
            session = concept.teaching_sessions.filter(user=request.user).first()
            objectives = (session.objectives if session else []) or [{'id': f'concept-{concept.id}', 'text': concept.title}]
            evidence = (session.state.get('objective_evidence', {}) if session else {})
            weak_first = sorted(objectives, key=lambda objective: int((evidence.get(objective['id']) or {}).get('best_score', 0)))
            for objective in weak_first[:2]:
                kind = classify_presentation(objective.get('text', ''))
                challenge_type = {'SEQUENCE': 'ordering', 'PROCESS': 'ordering', 'COMPARISON': 'short_answer', 'FORMULA': 'short_answer'}.get(kind, 'short_answer')
                challenges.append({'id': f"mastery:{objective['id']}", 'objective_id': objective['id'], 'concept_id': str(concept.id),
                                   'type': challenge_type, 'prompt': f"Apply this idea in your own words: {objective.get('text')}",
                                   'objective_type': kind, 'source_title': concept.source_resource.title if concept.source_resource else '',
                                   'expected_keywords': _meaningful_keywords(objective.get('text', ''))[:8]})
        # A Journey challenge combines objectives and never replays persisted activity ids.
        challenges = challenges[:max(4, min(8, len(challenges)))]
        if request.method == 'GET':
            prior = path.mastery_attempts.filter(user=request.user).first()
            public_challenges = [{key: value for key, value in item.items() if key != 'expected_keywords'} for item in challenges]
            return Response({'journey_id': str(path.id), 'eligible': True, 'challenge_count': len(challenges), 'estimated_minutes': max(3, len(challenges)),
                             'predicted_mastery': int(path.concepts.aggregate(avg=Avg('mastery'))['avg'] or 0), 'challenges': public_challenges,
                             'latest_result': {'score': prior.score, 'passed': prior.passed, 'review_objective_ids': prior.review_objective_ids} if prior else None})
        key = str(request.data.get('idempotency_key', '')).strip()[:80]
        if not key:
            return Response({'error': 'idempotency_key is required'}, status=400)
        existing = path.mastery_attempts.filter(user=request.user, idempotency_key=key).first()
        if existing:
            review_concept_ids = list(dict.fromkeys(item.get('concept_id') for item in existing.challenges
                                                    if item.get('objective_id') in existing.review_objective_ids and item.get('concept_id')))
            return Response({'id': str(existing.id), 'score': existing.score, 'passed': existing.passed,
                             'review_objective_ids': existing.review_objective_ids,
                             'review_concept_ids': review_concept_ids,
                             'objective_results': existing.objective_results, 'created': False})
        submitted = {str(item.get('challenge_id')): str(item.get('answer', '')).strip() for item in request.data.get('responses', [])}
        objective_results = []
        for challenge in challenges:
            answer = submitted.get(challenge['id'], '')
            expected = set(challenge.get('expected_keywords') or [])
            observed = set(_meaningful_keywords(answer))
            coverage = len(expected & observed) / max(1, min(4, len(expected)))
            score = min(100, round(coverage * 100)) if len(answer.split()) >= 4 and not _is_non_answer(answer) else 0
            objective_results.append({'objective_id': challenge['objective_id'], 'satisfied': score >= 70, 'score': score})
        score = int(sum(item['score'] for item in objective_results) / max(1, len(objective_results)))
        review_ids = list(dict.fromkeys(item['objective_id'] for item in objective_results if not item['satisfied']))
        review_concept_ids = list(dict.fromkeys(challenge['concept_id'] for challenge in challenges if challenge['objective_id'] in review_ids))
        attempt = JourneyMasteryAttempt.objects.create(user=request.user, path=path, idempotency_key=key, challenges=challenges,
                                                       responses=request.data.get('responses', []), objective_results=objective_results,
                                                       score=score, passed=score >= 75 and not review_ids, review_objective_ids=review_ids)
        LearningArtifact.objects.create(user=request.user, path=path, artifact_type='mastery_result', title=f'{path.title} Mastery result',
                                        content={'score': score, 'passed': attempt.passed, 'review_objective_ids': review_ids,
                                                 'review_concept_ids': review_concept_ids, 'objective_results': objective_results},
                                        provenance={'mastery_attempt_id': str(attempt.id)}, external_object_type='journey_mastery', external_object_id=str(attempt.id))
        return Response({'id': str(attempt.id), 'score': score, 'passed': attempt.passed, 'review_objective_ids': review_ids,
                         'review_concept_ids': review_concept_ids, 'objective_results': objective_results,
                         'recommended_next_action': 'finish' if attempt.passed else 'review_weak_areas', 'created': True}, status=201)

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
        journey_intent = _journey_message_intent(text)
        practice_requested = bool(re.search(r'\b(quiz(?: me| on this)?|practice|test me|give me (?:one|two|three|four|five|\d+)?\s*questions?|question on this)\b', lowered))
        activities = _objective_activities(session, request.user)
        flow_text, kind, payload = '', 'message', {}

        preference_updates = {}
        preference_rules = [
            (('keep it short', 'make it shorter', 'be concise'), {'explanation_length': 'short'}, "Got it. Short, clear, useful — no scenic route."),
            (('more examples', 'give me an example', 'give me more examples'), {'example_preference': 'more'}, "Deal. I’ll use more worked examples and fewer abstract speeches."),
            (('ask fewer questions', 'no more questions', 'fewer questions'), {'check_frequency': 'low'}, "Understood. I’ll teach for a while before I check in again."),
            (('use visuals', 'show me visually', 'use diagrams'), {'visual_preference': 'high'}, "Got you. I’ll reach for diagrams and comparisons when they clarify the idea."),
            (('be serious', 'no jokes'), {'tone': 'serious'}, "Absolutely. Straight teaching for this topic."),
            (('challenge me more', 'go harder'), {'challenge': 'high'}, "Alright — gloves off, but I’ll keep it fair."),
            (('slow down', 'make it simpler', 'simpler please'), {'pace': 'slow'}, "Yep. Smaller steps, plain language. The fresh value is the whole trick here."),
            (('go deeper', 'give me the formula'), {'depth_preference': 'deep'}, "Let’s go one layer deeper and connect the intuition to the rule."),
            (("don't use analogies", 'no analogies'), {'analogy_preference': 'off'}, "No analogies. We’ll keep it literal and precise."),
            (('use an analogy',), {'analogy_preference': 'on'}, "Sure. I’ll use an analogy when it earns its place."),
        ]
        preference_reply = ''
        for phrases, update, reply in preference_rules:
            if any(phrase in lowered for phrase in phrases):
                preference_updates.update(update)
                preference_reply = reply
        if preference_updates:
            onboarding = request.user.onboarding_status or {}
            stable = {**onboarding.get('teaching_preferences', {}), **preference_updates}
            onboarding['teaching_preferences'] = stable
            request.user.onboarding_status = onboarding
            request.user.save(update_fields=['onboarding_status'])
            session.state = {**session.state, 'teaching_preferences': stable}

        if preference_updates:
            flow_text = preference_reply
        elif any(phrase in lowered for phrase in ('skip this', 'skip the topic', 'move on without this')):
            session.status = 'paused'
            session.resume_point = session.current_point
            session.state = {**session.state, 'skipped': True}
            flow_text = "We can pause this topic, but I won’t pretend it’s mastered. Your progress is saved and we can return when you’re ready."
        elif journey_intent in {'SOCIAL', 'SOCIAL_ACKNOWLEDGEMENT'}:
            objective_index = min(session.current_point, max(0, len(session.objectives) - 1))
            objective = session.objectives[objective_index] if session.objectives else {'text': concept.title}
            active = _unanswered_journey_check(session, activities)
            returning = bool(session.conversation_summary or session.turns.filter(role='learner').exclude(content=text).exists())
            if active:
                flow_text = (f"Hey 👋 Good to have you back. We’re still on {objective['text'].rstrip('.').lower()}. "
                             "The check above is waiting whenever you’re ready.")
                payload = {'conversational_intent': journey_intent, 'pedagogical_action': 'PRESERVE',
                           'active_activity_id': active['id'], 'reused': True,
                           'quick_replies': ['Answer the check', 'Quick recap']}
            else:
                intro = "You’re back" if returning else "I’m Flow"
                flow_text = f"Hey 👋 {intro}. We’re working on {objective['text'].rstrip('.').lower()}. Ready to pick it up?"
                payload = {'conversational_intent': journey_intent, 'pedagogical_action': 'PRESERVE',
                           'quick_replies': ["Let's go", 'Quick recap']}
        elif any(phrase in lowered for phrase in ('are we done', 'can we move on', 'how much is left', 'am i done', 'is that all', "what's left", 'what is left', 'what else do i need to know', 'what else')):
            evaluation = evaluate_session_completion(session)
            remaining = evaluation['objectives_total'] - evaluation['objectives_satisfied']
            if evaluation['complete']:
                flow_text = "Yes — the evidence is there. I’m locking in your mastery now."
                session.status = 'mastery_check'
            elif evaluation['unresolved_misconceptions']:
                session.state = {**session.state, 'teaching_phase': 'REMEDIATE'}
                flow_text = f"Almost. {remaining} objective{'s' if remaining != 1 else ''} remain, and one misconception still needs clearing. We’ll target only that shaky part."
            else:
                existing_activity = _unanswered_journey_check(session, activities)
                activity = existing_activity or _next_journey_check(session, activities)
                if activity:
                    flow_text = ("That check is still waiting for your answer—give it a go and I’ll use that evidence." if existing_activity
                                 else "That’s the explanation. One quick check before we move on.")
                    kind = 'message' if existing_activity else 'activity'
                    payload = {'completion_evaluation': evaluation, 'pedagogical_action': 'CHECK', 'active_activity_id': activity['id'], 'reused': bool(existing_activity)}
                    if not existing_activity:
                        payload['activity'] = _public_activity(activity)
                else:
                    flow_text = f"Not quite. You’ve secured {evaluation['objectives_satisfied']} of {evaluation['objectives_total']} objectives. We’ll focus only on what’s left."
            payload = {**payload, 'completion_evaluation': evaluation}
        elif practice_requested:
            existing_activity = _unanswered_journey_check(session, activities)
            activity = existing_activity or _next_journey_check(session, activities)
            if activity:
                flow_text = ("The current check is already ready—answer that one and I’ll adapt from the result." if existing_activity
                             else "Let’s check the current objective—one question at a time.")
                kind = 'message' if existing_activity else 'activity'
                payload = {'pedagogical_action': 'CHECK', 'active_activity_id': activity['id'], 'reused': bool(existing_activity)}
                if not existing_activity:
                    payload['activity'] = _public_activity(activity)
            else:
                flow_text = "I couldn’t build a trustworthy check for this objective yet. I can explain it another way, then try again."
        elif any(phrase in lowered for phrase in ('show me a video', 'find a video', 'need to see this', 'video')):
            from ai_assistant.youtube_search import search_youtube
            query = f'{concept.title} {text} {getattr(concept.source_resource, "subject", "")} explained'
            videos = search_youtube(query, max_results=3, duration_limit=1200)
            objective_index = min(session.current_point, max(0, len(session.objectives) - 1))
            objective = session.objectives[objective_index] if session.objectives else {}
            safe_videos = [{**video, 'embed_url': f"https://www.youtube-nocookie.com/embed/{video.get('video_id')}?rel=0", 'why': f"A visual explanation for {objective.get('text', concept.title).rstrip('.').lower()}.", 'objective_id': objective.get('id', '')} for video in videos[:2] if video.get('video_id')]
            kind, payload = 'video', {'videos': safe_videos}
            if safe_videos:
                session.state = {**session.state, 'last_video': {'video_id': safe_videos[0]['video_id'], 'objective_id': objective.get('id', ''), 'why': safe_videos[0]['why']}}
            flow_text = ('I found a focused visual explanation. Watch for the exact distinction we were discussing, then we’ll check whether it clicked.' if videos else "I couldn't find a video I'd trust enough to recommend. No detour—we can keep working through it here.")
        elif any(phrase in lowered for phrase in ('make flashcards', 'create flashcards', 'revise later', 'flash cards')):
            grounding = _grounding(concept)
            cards = [{'question': objective['text'], 'answer': (grounding.get('excerpt') or concept.summary or concept.description)[:420], 'difficulty': concept.difficulty} for objective in session.objectives[:3]]
            kind, payload = 'flashcards', {'cards': cards, 'saved': False}
            flow_text = 'Here are three grounded cards from what we’re learning. Save them if they feel useful for revision.'
        elif journey_intent == 'REQUEST_EXAMPLE':
            objective_index = min(session.current_point, max(0, len(session.objectives) - 1))
            objective_id = session.objectives[objective_index]['id'] if session.objectives else ''
            example = next((item for item in activities if item.get('purpose') == 'learn'
                            and item.get('objective_id') == objective_id
                            and (item.get('content') or {}).get('mode') == 'example'), None)
            if not example:
                attempted = next((item for item in activities if item.get('objective_id') == objective_id
                                  and item.get('purpose') in {'check', 'apply'}), {})
                objective = session.objectives[objective_index] if session.objectives else {'id': objective_id, 'text': concept.title}
                example = _remediation_activity(concept, objective, attempted, text, '', ['comparison', 'steps'])
                example = {**example, 'purpose': 'learn', 'stage': 'learn'}
            session.status = 'teaching'
            session.state = {**session.state, 'teaching_phase': 'TEACH', 'current_representation': 'example'}
            flow_text = "Yep. Let’s make this checkpoint concrete."
            kind, payload = 'activity', {'activity': _public_activity(example), 'pedagogical_action': 'EXAMPLE',
                                         'objective_id': objective_id}
        elif journey_intent in {'REEXPLAIN', 'REQUEST_SIMPLIFY'}:
            session.state = {**session.state, 'teaching_phase': 'TEACH'}
            teaching = next((item for item in activities if item.get('purpose') == 'learn'), None)
            flow_text = ("Yep. Let’s strip it back to one idea." if journey_intent == 'REQUEST_SIMPLIFY'
                         else "Absolutely. Let’s rebuild it from a different angle.")
            if teaching:
                kind, payload = 'activity', {'activity': _public_activity(teaching), 'pedagogical_action': 'EXPLAIN'}
        elif journey_intent == 'REMEDIATE' or any(phrase in lowered for phrase in ('wait', 'why?', 'slow down')):
            session.resume_point = session.current_point
            session.status = 'remediation'
            session.state = {**session.state, 'teaching_phase': 'REMEDIATE'}
            misconception = text[:240]
            issues = list(session.unresolved_misconceptions)
            if misconception not in issues:
                issues.append(misconception)
            session.unresolved_misconceptions = issues[-8:]
            objective_index = min(session.current_point, max(0, len(session.objectives) - 1))
            objective = session.objectives[objective_index] if session.objectives else {'id': '', 'text': concept.title}
            active_id = (session.state.get('last_learning_object') or {}).get('activity_id')
            attempted = next((item for item in activities if item['id'] == active_id), None) or next((item for item in activities if item.get('purpose') in {'check', 'apply'}), {})
            remedial = _remediation_activity(concept, objective, attempted, text, '', session.state.get('recent_remediation_modes', []))
            remediation_mode = (remedial.get('content') or {}).get('mode')
            session.state = {**session.state, 'recent_remediation_modes': [*session.state.get('recent_remediation_modes', [])[-3:], remediation_mode]}
            flow_text = ("Got you. The definition isn’t helping, so let’s use an actual situation."
                         if journey_intent == 'REMEDIATE' else "Yeah, I jumped too fast there. Here’s the missing piece.")
            kind, payload = 'activity', {'activity': _public_activity(remedial), 'pedagogical_action': 'REMEDIATE'}
        elif session.status == 'remediation' and (journey_intent == 'REQUEST_CONTINUE' or any(word in lowered for word in ('okay', 'continue', 'got it', 'makes sense', 'yes'))):
            session.current_point = session.resume_point
            existing_activity = _unanswered_journey_check(session, activities)
            next_activity = existing_activity or _next_journey_check(session, activities)
            flow_text = ("Yep. Let’s run it back. Use the check that’s already waiting—we’ll read your answer through the new angle." if existing_activity
                         else "Yep. Let’s run it back with one small check.")
            if next_activity:
                kind = 'message' if existing_activity else 'activity'
                payload = {'pedagogical_action': 'CHECK', 'active_activity_id': next_activity['id'], 'reused': bool(existing_activity)}
                if not existing_activity:
                    payload['activity'] = _public_activity(next_activity)
        elif session.state.get('last_video') and any(phrase in lowered for phrase in ('cool continue', 'continue', 'that helped', 'finished the video')):
            video = session.state.pop('last_video')
            session.state = {**session.state, 'used_video_ids': [*session.state.get('used_video_ids', [])[-7:], video['video_id']]}
            flow_text = "Nice. That visual did the heavy lifting; now let’s make sure the idea is yours. The fresh value is still the deciding clue."
            next_activity = next((item for item in activities if item['purpose'] in {'check', 'apply'}), None)
            if next_activity:
                kind, payload = 'activity', {'activity': _public_activity(next_activity), 'supported_by_video': video['video_id']}
        elif journey_intent in {'PROCEED', 'ACKNOWLEDGEMENT', 'REQUEST_CONTINUE', 'EASY'}:
            completion_state = evaluate_session_completion(session)
            if completion_state['normal_requirements_met']:
                session.status = 'mastery_check'
                flow_text = "Nice — the lesson pieces are locked in. One final boss: teach the idea back to me in your own words. 👀"
                payload = {'transition': 'feynman', 'completion_evaluation': completion_state}
            else:
                unresolved = completion_state['unresolved_objectives']
                current_result = next((item for item in completion_state['objectives'] if item['id'] == (session.objectives[min(session.current_point, len(session.objectives) - 1)]['id'] if session.objectives else '')), None)
                if current_result and not current_result['satisfied']:
                    existing_activity = _unanswered_journey_check(session, activities)
                    activity = existing_activity or _next_journey_check(session, activities)
                    if activity:
                        if journey_intent == 'EASY':
                            flow_text = ("😂 Fair. The current check still needs your answer; then I’ll raise the difficulty." if existing_activity
                                         else "Fair. Let’s make the check a little sharper.")
                        elif journey_intent == 'ACKNOWLEDGEMENT':
                            flow_text = ("Nice. Let’s make sure it sticks—the check above is still yours." if existing_activity
                                         else "Nice. Let’s make sure it sticks with one small check.")
                        else:
                            flow_text = ("That check is still the next step—answer it when you’re ready." if existing_activity
                                         else "Good. One quick check before we move on.")
                        kind = 'message' if existing_activity else 'activity'
                        payload = {'pedagogical_action': 'CHECK', 'active_activity_id': activity['id'], 'reused': bool(existing_activity)}
                        if not existing_activity:
                            payload['activity'] = _public_activity(activity)
                    else:
                        flow_text = "Before we move on, explain that bit back in one sentence so I can check it landed."
                else:
                    session.current_point = min(session.current_point + 1, max(0, len(session.objectives) - 1))
                    objective = unresolved[0] if unresolved else None
                    session.state = {**session.state, 'teaching_phase': 'ADVANCE'}
                    flow_text = f"Yep, that part’s locked in 🔥. Next up: {objective['text']}" if objective else "Nice. Let’s build on it."
        elif session.status == 'not_started':
            session.current_point = 0
            first_objective = session.objectives[0]['id'] if session.objectives else ''
            session.objectives_covered = list(dict.fromkeys([*session.objectives_covered, first_objective]))
            record_objective_evidence(session, first_objective, taught=True)
            teaching = next((item for item in activities if item.get('purpose') == 'learn'), None)
            flow_text = "Perfect. Start with this—then we’ll build on it."
            if teaching:
                session.state = {**session.state, 'teaching_phase': 'TEACH'}
                session.state = {**session.state,
                                 'recent_representations': [*session.state.get('recent_representations', [])[-3:], teaching['type']]}
                kind, payload = 'activity', {'activity': _public_activity(teaching), 'learning_objects': [_public_activity(teaching)],
                                             'pedagogical_action': 'TEACH'}
        elif journey_intent == 'REQUEST_EXAMPLE' or any(phrase in lowered for phrase in ('example', 'show me an example')):
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
            preferences = session.state.get('teaching_preferences') or (request.user.onboarding_status or {}).get('teaching_preferences', {})
            completion_state = evaluate_session_completion(session)
            prompt = ("You are Flow, a brilliant, warm, slightly cheeky personal tutor. Default to under 100 words. "
                      "Teach naturally; do not ask a question after every response. Humor must make the idea easier to remember, never replace it. "
                      "Never say 'based on the provided context', 'the mechanism described', 'the learner should', or expose evaluation/generation language. "
                      f"Concept: {concept.title}\nGoal: {concept.path.goal}\nDepth: {concept.path.depth}\n"
                      f"Teaching preferences: {preferences}\n"
                      f"Unresolved objectives: {completion_state['unresolved_objectives']}\nRecommended next action: {completion_state['recommended_next_action']}\n"
                      f"Teaching point: {session.current_point}\nResume point: {session.resume_point}\nMisconceptions: {session.unresolved_misconceptions}\n"
                      f"Grounding: {_grounding(concept)}\nRecent turns: {recent}\nLearner: {text}")
            try:
                from ai_assistant.services import AIService
                flow_text = AIService().ask_about_resource(concept.source_resource, prompt, task='REMEDIATION' if action == 'REMEDIATE' else 'CONVERSATION') if concept.source_resource else AIService().chat_sync([{'role': 'user', 'content': prompt}], task='REMEDIATION' if action == 'REMEDIATE' else 'CONVERSATION')
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
        try:
            session, evaluation, created = submit_teaching_activity(
                concept, request.user, request.data.get('activity_id', ''),
                request.data.get('response') or {}, request.data.get('idempotency_key', ''),
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)
        return Response({**_session_data(session), 'evaluation': evaluation}, status=201 if created else 200)

    @action(detail=True, methods=['post'], url_path='teaching-flashcards/save')
    def save_teaching_flashcards(self, request, pk=None):
        concept = self.get_object()
        if not concept.source_resource:
            return Response({'error': 'A source resource is required to save these cards'}, status=400)
        from library.models import Flashcard
        cards = request.data.get('cards') or []
        saved = []
        created_count = 0
        for card in cards[:10]:
            question, answer = str(card.get('question', ''))[:1000].strip(), str(card.get('answer', ''))[:3000].strip()
            if not question or not answer:
                continue
            flashcard, created = Flashcard.objects.get_or_create(
                resource=concept.source_resource, owner=request.user, question=question, answer=answer,
                defaults={'subject': getattr(concept.source_resource, 'subject', '') or concept.path.title,
                          'difficulty': card.get('difficulty', 'medium')},
            )
            saved.append(flashcard)
            created_count += int(created)
        for card in saved:
            LearningArtifact.objects.get_or_create(user=request.user, path=concept.path, external_object_type='flashcard', external_object_id=str(card.id), defaults={
                'concept': concept, 'resource': concept.source_resource, 'artifact_type': 'flashcard', 'title': card.question[:300],
                'content': {'front': card.question, 'back': card.answer, 'difficulty': card.difficulty},
                'provenance': {'journey_title': concept.path.title, 'objective_id': _current_objective(_get_teaching_session(concept, request.user)).get('id', ''), 'concept_title': concept.title},
            })
        return Response({'saved': len(saved), 'created': created_count, 'ids': [card.id for card in saved]}, status=201 if created_count else 200)

    @action(detail=True, methods=['post'], url_path='save-artifact')
    def save_artifact(self, request, pk=None):
        concept = self.get_object()
        artifact_type = str(request.data.get('type', '')).strip()
        allowed = {'note', 'podcast', 'video_reference', 'saved_example', 'saved_diagram'}
        if artifact_type not in allowed:
            return Response({'error': 'Unsupported saved artifact type'}, status=400)
        content = request.data.get('content') if isinstance(request.data.get('content'), dict) else {'text': str(request.data.get('content', ''))}
        external_id = str(request.data.get('external_object_id', '')).strip()[:80]
        defaults = {'concept': concept, 'resource': concept.source_resource, 'artifact_type': artifact_type,
                    'title': str(request.data.get('title') or concept.title)[:300], 'content': content,
                    'provenance': {'journey_title': concept.path.title, 'concept_title': concept.title,
                                   'objective_id': _current_objective(_get_teaching_session(concept, request.user)).get('id', '')},
                    'external_object_type': artifact_type}
        if external_id:
            artifact, created = LearningArtifact.objects.get_or_create(user=request.user, path=concept.path,
                                                                       external_object_type=artifact_type, external_object_id=external_id,
                                                                       defaults=defaults)
        else:
            artifact, created = LearningArtifact.objects.create(user=request.user, path=concept.path, **defaults), True
        return Response({**_artifact_data(artifact), 'created': created}, status=201 if created else 200)

    @action(detail=True, methods=['get'], url_path='teaching-voice-context')
    def teaching_voice_context(self, request, pk=None):
        concept = self.get_object()
        session = _get_teaching_session(concept, request.user)
        recent = [_turn_data(turn) for turn in session.turns.order_by('-created_at')[:8]][::-1]
        completion = evaluate_session_completion(session)
        return Response({'teaching_session_id': str(session.id), 'journey_id': str(concept.path_id), 'journey_title': concept.path.title, 'unit_id': str(concept.unit_id) if concept.unit_id else None, 'unit_title': concept.unit.title if concept.unit else '', 'concept_id': str(concept.id), 'concept_title': concept.title, 'current_teaching_point': session.current_point, 'resume_point': session.resume_point, 'resource_ids': session.state.get('resource_ids', []), 'source_context': _grounding(concept), 'goal': concept.path.goal, 'depth': concept.path.depth, 'mastery': session.mastery, 'objectives': session.objectives, 'objective_evidence': session.state.get('objective_evidence', {}), 'completion_evaluation': completion, 'unresolved_misconceptions': session.unresolved_misconceptions, 'recent_context': recent, 'conversation_summary': session.conversation_summary, 'teaching_preferences': session.state.get('teaching_preferences', {})})

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
        valid_objective_ids = {item['id'] for item in session.objectives}
        if objective_id and objective_id not in valid_objective_ids:
            return Response({'error': 'Unknown teaching objective'}, status=400)
        if event == 'point_covered' and objective_id:
            session.objectives_covered = list(dict.fromkeys([*session.objectives_covered, objective_id]))
            record_objective_evidence(session, objective_id, taught=True, interaction=True, source='voice')
        elif event == 'point_understood' and objective_id:
            session.objectives_covered = list(dict.fromkeys([*session.objectives_covered, objective_id]))
            evidence_id = str(request.data.get('evidence_id', '')).strip()
            voice_turn = TeachingTurn.objects.filter(id=evidence_id, session=session, kind='voice').first() if evidence_id else None
            verified = (voice_turn.payload or {}).get('verified_evidence', {}) if voice_turn else {}
            evidence_type = str(verified.get('evidence_type', ''))
            evidence_score = int(verified.get('score', 0) or 0)
            valid_demonstration = (
                bool(verified.get('server_verified'))
                and str(verified.get('objective_id', '')) == objective_id
                and evidence_type in {'explanation', 'application', 'calculation', 'prediction'}
                and evidence_score >= 70
            )
            record_objective_evidence(session, objective_id, taught=True, interaction=True, score=evidence_score if valid_demonstration else 0, source='voice', evidence_id=evidence_id)
            if valid_demonstration:
                session.objectives_understood = list(dict.fromkeys([*session.objectives_understood, objective_id]))
        elif event == 'misconception' and misconception:
            session.unresolved_misconceptions = [*session.unresolved_misconceptions[-7:], misconception]
            session.status = 'remediation'
            session.resume_point = session.current_point
            if objective_id:
                record_objective_evidence(session, objective_id, taught=True, interaction=True, source='voice', misconception=misconception)
        elif event == 'misconception_resolved' and misconception:
            session.unresolved_misconceptions = [item for item in session.unresolved_misconceptions if item != misconception]
            session.status = 'teaching'
            if objective_id:
                existing_score = session.state.get('objective_evidence', {}).get(objective_id, {}).get('best_score', 0)
                record_objective_evidence(session, objective_id, taught=True, interaction=True, score=existing_score, source='voice')
        elif event == 'paused':
            session.resume_point = session.current_point
            session.status = 'paused'
        summary = str(request.data.get('summary', '')).strip()[:1000]
        if summary:
            session.conversation_summary = summary
        completion_state = evaluate_session_completion(session)
        session.mastery = completion_state['mastery']
        session.unresolved_misconceptions = completion_state['unresolved_misconceptions']
        if completion_state['complete']:
            session.status = 'mastery_check'
        TeachingTurn.objects.create(session=session, role='system', kind='voice', content=summary, payload={'event': event, 'objective_id': objective_id, 'misconception': misconception})
        session.save()
        return Response(_session_data(session))

    @action(detail=True, methods=['post'], url_path='teaching-stage/continue')
    @transaction.atomic
    def teaching_stage_continue(self, request, pk=None):
        """Advance presentation only. This endpoint never writes evidence or mastery."""
        concept = self.get_object()
        session = _get_teaching_session(concept, request.user)
        # Sync first so an old objective/stage can never be reactivated.
        _session_data(session)
        player = session.state.get('player') or {}
        current_id = str(request.data.get('stage_id') or '')
        if not current_id or current_id != player.get('current_stage_id'):
            return Response({'error': 'This learning stage is no longer active.'}, status=409)
        active_activity_id = player.get('active_activity_id', '')
        if active_activity_id:
            return Response({'error': 'Complete the active Practice before continuing.', **_session_data(session)}, status=409)
        continue_player_stage(session)
        return Response(_session_data(session))

    @action(detail=True, methods=['get', 'post'], url_path='teaching-completion')
    def teaching_completion(self, request, pk=None):
        concept = self.get_object()
        session = _get_teaching_session(concept, request.user)
        if request.method == 'GET':
            return Response(evaluate_session_completion(session))
        session, concept, evaluation, reward, unlocked = finalize_teaching_session(session.id, request.user)
        if not evaluation['complete']:
            return Response({'error': 'More learning evidence is required', **evaluation}, status=409)
        next_node = ConceptNode.objects.filter(path=concept.path, status='current').exclude(id=concept.id).order_by('order_index').first()
        return Response({'message': 'Concept completed', 'mastery': concept.mastery, 'reward': reward, 'unlocked': unlocked, 'next_node': str(next_node.id) if next_node else None, 'completion_evaluation': evaluation})

    @action(detail=True, methods=['post'], url_path='feynman-evaluation')
    @transaction.atomic
    def feynman_evaluation(self, request, pk=None):
        concept = self.get_object()
        session = _get_teaching_session(concept, request.user)
        explanation = str(request.data.get('explanation', '')).strip()
        source = str(request.data.get('source', 'text')).strip().lower()
        key = str(request.data.get('idempotency_key', '')).strip()[:80]
        if source not in {'text', 'voice'}:
            return Response({'error': 'Unknown Feynman evidence source'}, status=400)
        if len(explanation.split()) < 5:
            return Response({'error': 'Explain the idea in at least one complete thought.'}, status=400)
        if key:
            existing = TeachingTurn.objects.filter(session=session, idempotency_key=key).first()
            if existing:
                return Response({'result': existing.payload.get('feynman_evaluation', {}), **_session_data(session)})
        prerequisites = evaluate_session_completion(session)
        if not prerequisites['normal_requirements_met']:
            return Response({'error': 'Required lesson evidence is still incomplete', **prerequisites}, status=409)
        result = evaluate_feynman_explanation(session, explanation)
        attempt = TeachingTurn.objects.create(session=session, role='learner', kind='voice' if source == 'voice' else 'message', content=explanation[:4000], idempotency_key=key, payload={'feynman_evaluation': result, 'server_verified': True, 'source': source})
        previous = session.state.get('feynman_evidence', {})
        if int(result['score']) >= int(previous.get('score', -1)):
            session.state = {**session.state, 'feynman_evidence': {**result, 'evidence_id': str(attempt.id), 'source': source}}
        session.status = 'mastery_check' if result['passed'] else 'remediation'
        session.resume_point = session.current_point
        TeachingTurn.objects.create(session=session, role='flow', content=result['feedback'], payload={'feynman_result': result})
        session.save()
        LearningArtifact.objects.update_or_create(user=request.user, path=concept.path, external_object_type='feynman_turn', external_object_id=str(attempt.id), defaults={
            'concept': concept, 'resource': concept.source_resource, 'artifact_type': 'feynman_result', 'title': f'{concept.title} teach-back',
            'content': {'score': result['score'], 'passed': result['passed'], 'feedback': result['feedback'],
                        'critical_misconceptions': result.get('critical_misconceptions', []), 'source': source},
            'provenance': {'journey_title': concept.path.title, 'objective_id': _current_objective(session).get('id', ''), 'date': timezone.now().isoformat()},
        })
        completion_state = evaluate_session_completion(session)
        response_status = 409 if result['critical_misconceptions'] else 201
        return Response({'result': result, **completion_state, **_session_data(session)}, status=response_status)

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
        correct, score, feedback, _outcome = _evaluate_activity(concept, activity, response_data)
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
                answer = AIService().ask_about_resource(concept.source_resource, context, task='SOURCE_REASONING')
            else:
                answer = AIService().chat_sync([{'role': 'user', 'content': context}], task='CONVERSATION')
        except Exception:
            logger.exception('Contextual Flow failed for concept %s', concept.id)
            return Response({'error': 'Flow could not answer right now'}, status=503)
        return Response({'answer': answer})

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark concept as completed, unlock next concepts."""
        concept = self.get_object()

        teaching_session = TeachingSession.objects.filter(user=request.user, concept=concept).first()
        if teaching_session:
            teaching_session, concept, evaluation, reward, unlocked = finalize_teaching_session(teaching_session.id, request.user)
            if not evaluation['complete']:
                return Response({'error': 'More learning evidence is required', **evaluation}, status=409)
            next_node = ConceptNode.objects.filter(path=concept.path, status='current').exclude(id=concept.id).order_by('order_index').first()
            return Response({'message': 'Concept completed', 'mastery': concept.mastery, 'reward': reward, 'unlocked': unlocked, 'next_node': str(next_node.id) if next_node else None, 'completion_evaluation': evaluation})

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
