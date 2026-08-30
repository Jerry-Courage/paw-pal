"""Deterministic capability routing for native Flow learning objects."""
from __future__ import annotations

import re
import threading
import uuid
import json
from dataclasses import dataclass
from typing import Callable

from django.core import signing
from django.db.models import Q
from library.models import PodcastSession, Resource


OBJECT_TYPES = {
    'video', 'podcast', 'flashcards', 'practice', 'active_recall', 'feynman',
    'source', 'worked_example', 'comparison', 'math', 'assignment_context',
}


def flow_object(kind: str, payload: dict, *, state: str = 'ready', provenance: dict | None = None) -> dict:
    if kind not in OBJECT_TYPES:
        raise ValueError(f'Unsupported Flow object type: {kind}')
    if state not in {'loading', 'ready', 'error'}:
        raise ValueError(f'Unsupported Flow object state: {state}')
    return {
        'type': kind,
        'id': str(uuid.uuid4()),
        'state': state,
        'payload': payload,
        'provenance': provenance or {},
    }


@dataclass(frozen=True)
class Capability:
    name: str
    aliases: tuple[str, ...]
    requires_source: bool
    handler: Callable
    result_type: str
    fallback: str


ACKNOWLEDGEMENT_RE = re.compile(r"^\s*((okay|ok)[,\s]+)?(got it|makes sense|cool|understood|i see|alright|okay|ok)[.!\s]*$", re.I)


def _explicit_source_id(context: str) -> int | None:
    match = re.search(r'\bSOURCE\s+(\d+)\b', context or '', re.I)
    return int(match.group(1)) if match else None


def _resource(user, context: str) -> Resource | None:
    source_id = _explicit_source_id(context)
    if not source_id:
        return None
    return Resource.objects.filter(id=source_id).filter(Q(owner=user) | Q(is_public=True)).first()


def _topic(query: str, resource: Resource | None) -> str:
    cleaned = re.sub(
        r'\b(find|show|give|make|create|generate|let|teach|you|test|quiz|practice|questions?|quick|some|active|recall|feynman|explain|explains|that|me|a|an|the|on|about|this|please|podcast|video|flashcards?|deck|understand|want|can|we|do|see|if|know)\b',
        ' ', query, flags=re.I,
    )
    cleaned = re.sub(r'\s+', ' ', cleaned).strip(' .?!')
    return cleaned or (resource.title if resource else '')


def _requested_count(query: str) -> int:
    match = re.search(r'\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:quick\s+|hard\s+|easy\s+)?questions?\b', query, re.I)
    words = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10}
    raw = match.group(1).lower() if match else ''
    return max(1, min(10, words.get(raw, int(raw) if raw.isdigit() else 1)))


def _practice_concept(user, query: str, context: str):
    from learning.models import ConceptNode, TeachingSession
    concept_match = re.search(r'\bCONCEPT\s+([0-9a-f-]{36})\b', context or '', re.I)
    if concept_match:
        concept = ConceptNode.objects.filter(id=concept_match.group(1), path__user=user).first()
        if concept:
            return concept
    journey_match = re.search(r'\bJOURNEY\s+([0-9a-f-]{36})\b', context or '', re.I)
    if journey_match:
        concept = ConceptNode.objects.filter(path_id=journey_match.group(1), path__user=user, status='current').first()
        if concept:
            return concept
    topic = _topic(query, _resource(user, context))
    if topic:
        words = [word for word in re.findall(r'[a-z0-9]+', topic.lower()) if len(word) > 2]
        candidates = ConceptNode.objects.filter(path__user=user)
        for word in words[:5]:
            candidates = candidates.filter(Q(title__icontains=word) | Q(summary__icontains=word) | Q(description__icontains=word))
        concept = candidates.order_by('-updated_at').first()
        if concept:
            return concept
        # An explicit topic outranks an unrelated active Journey. It becomes
        # free-Flow practice when it does not map to one of the user's concepts.
        return None
    active_session = TeachingSession.objects.filter(user=user, status__in=['teaching', 'remediation', 'practicing', 'mastery_check']).select_related('concept').order_by('-last_active_at').first()
    if active_session:
        return active_session.concept
    return None


def _free_practice_questions(topic: str, count: int, difficulty: str) -> list[dict]:
    from .services import AIService
    prompt = (
        f'Create {count} interactive practice question(s) about {topic} at {difficulty} difficulty. '
        'Return strict JSON array. Each item: type (mcq or short_answer), prompt, options (only for mcq), '
        'correct_choice (only for mcq), accepted_keywords (only for short_answer), feedback_correct, feedback_incorrect. '
        'Distractors must be plausible. Feedback must teach the misconception. No markdown.'
    )
    raw = AIService().chat_sync([{'role': 'user', 'content': prompt}])
    data = json.loads(re.sub(r'^```json|```$', '', raw.strip(), flags=re.I).strip())
    if not isinstance(data, list):
        raise ValueError('Practice generation did not return a list')
    questions = []
    for index, item in enumerate(data[:count]):
        kind = item.get('type') if item.get('type') in {'mcq', 'short_answer'} else 'short_answer'
        prompt_text = str(item.get('prompt', '')).strip()
        options = [str(option).strip() for option in item.get('options', []) if str(option).strip()][:5]
        try:
            correct_choice = int(item.get('correct_choice'))
        except (TypeError, ValueError):
            correct_choice = -1
        if not prompt_text or (kind == 'mcq' and (len(options) < 2 or correct_choice not in range(len(options)))):
            continue
        hidden = {
            'type': kind, 'correct_choice': correct_choice,
            'accepted_keywords': [str(word).lower() for word in item.get('accepted_keywords', [])[:12]],
            'feedback_correct': str(item.get('feedback_correct', 'That distinction holds.'))[:500],
            'feedback_incorrect': str(item.get('feedback_incorrect', 'Let’s revisit the key distinction and try again.'))[:500],
        }
        questions.append({
            'id': f'free-{index + 1}', 'type': kind, 'prompt': prompt_text[:700], 'options': options,
            'difficulty': difficulty, 'evaluation_token': signing.dumps(hidden, salt='flow-practice-v1', compress=True),
        })
    return questions


def _practice(user, query: str, context: str) -> dict:
    count = _requested_count(query)
    difficulty = 'hard' if re.search(r'\b(hard|harder|challenge)\b', query, re.I) else 'easy' if re.search(r'\b(easy|easier|simple)\b', query, re.I) else 'medium'
    concept = _practice_concept(user, query, context)
    if concept:
        from learning.views import _concept_activities, _public_activity, _get_teaching_session
        session = _get_teaching_session(concept, user)
        candidates = [item for item in _concept_activities(concept, user) if item['type'] not in {'comparison', 'worked_example'}]
        objective_id = session.objectives[min(session.current_point, max(0, len(session.objectives) - 1))]['id'] if session.objectives else ''
        questions = [_public_activity(item) for item in candidates[:count]]
        if not questions:
            return {'clarification': 'I couldn’t build a trustworthy check for that objective yet. Want me to explain it another way?'}
        return {'reply': 'Let’s see what stuck.', 'objects': [flow_object('practice', {
            'mode': 'journey', 'topic': concept.title, 'concept_id': str(concept.id),
            'teaching_session_id': str(session.id), 'objective_id': objective_id,
            'question_index': 0, 'question_total': len(questions), 'questions': questions,
            'responses': [], 'status': 'active',
        }, provenance={'source_id': concept.source_resource_id, 'source_title': getattr(concept.source_resource, 'title', '')})]}
    topic = _topic(query, _resource(user, context))
    if not topic:
        return {'clarification': 'What should I quiz you on? Give me a topic or attach a Journey or Source.'}
    try:
        questions = _free_practice_questions(topic, count, difficulty)
    except Exception:
        questions = []
    if not questions:
        return {'clarification': f'I couldn’t build a trustworthy check on {topic} just now. Want to try again?'}
    return {'reply': 'Let’s see what stuck.', 'objects': [flow_object('practice', {
        'mode': 'free', 'topic': topic, 'question_index': 0, 'question_total': len(questions),
        'questions': questions, 'responses': [], 'status': 'active',
    })]}


def _podcast(user, query: str, context: str) -> dict:
    resource = _resource(user, context)
    if not resource:
        return {'clarification': 'Which Source should I turn into a podcast? Attach one and I’ll get cooking 🎧'}

    from .views_podcast import bg_generate_script
    session = PodcastSession.objects.create(resource=resource, owner=user, status='generating', script_chunks=[])
    notes = resource.ai_notes_json if isinstance(resource.ai_notes_json, dict) else {}
    threading.Thread(target=bg_generate_script, args=(session.id, notes), daemon=True).start()
    return {
        'reply': 'Putting the episode together…',
        'objects': [flow_object('podcast', {
            'session_id': session.id,
            'resource_id': resource.id,
            'title': f'{resource.title} · Flow podcast',
            'status': session.status,
        }, state='loading', provenance={'source_id': resource.id, 'source_title': resource.title})],
    }


def _video(user, query: str, context: str) -> dict:
    resource = _resource(user, context)
    topic = _topic(query, resource)
    if not topic:
        return {'clarification': 'What should the video explain?'}
    from .youtube_search import search_youtube
    videos = search_youtube(topic, max_results=3)
    if not videos:
        return {'reply': 'Video search face-planted 😭 Try again in a moment.', 'objects': [flow_object('video', {'query': topic, 'retryable': True}, state='error')]}
    return {
        'reply': 'Found a clean explanation. Start with this one:',
        'objects': [flow_object('video', {'videos': videos, 'query': topic}, provenance={
            'source_id': resource.id if resource else None,
            'source_title': resource.title if resource else '',
        })],
    }


def _flashcards(user, query: str, context: str) -> dict:
    resource = _resource(user, context)
    if not resource:
        return {'clarification': 'Which Source should I turn into cards? Attach one first.'}
    count = 1 if re.search(r'\b(a|one|1)\s+flashcard\b', query, re.I) else 8
    from .services import AIService
    cards = AIService().generate_flashcards(resource, count, 'undergrad', context='')
    if not cards:
        return {'reply': 'Card generation face-planted 😭 Your Source is still attached—want me to retry?', 'objects': [flow_object('flashcards', {'retryable': True, 'resource_id': resource.id}, state='error')]}
    return {
        'reply': f'{len(cards)} card{"" if len(cards) == 1 else "s"}, ready to flip.',
        'objects': [flow_object('flashcards', {'cards': cards, 'resource_id': resource.id, 'title': f'{resource.title} cards'}, provenance={'source_id': resource.id, 'source_title': resource.title})],
    }


def _active_recall(user, query: str, context: str) -> dict:
    resource = _resource(user, context)
    topic = _topic(query, resource) or 'your recent learning'
    return {'reply': 'No peeking 👀', 'objects': [flow_object('active_recall', {
        'mode': 'active', 'topic': topic, 'question_index': 1, 'question_total': 6,
        'question': f'Explain the most important idea you remember about {topic} without looking at your notes.',
        'answer_revealed': False,
    }, provenance={'source_id': resource.id if resource else None, 'source_title': resource.title if resource else ''})]}


def _feynman(user, query: str, context: str) -> dict:
    resource = _resource(user, context)
    topic = _topic(query, resource) or (resource.title if resource else 'this topic')
    return {'reply': 'Bet. I’m the confused student now 😭', 'objects': [flow_object('feynman', {
        'mode': 'active', 'topic': topic, 'turn': 1,
        'prompt': f'Teach me {topic} like I have no background in it. Start with the simplest version.',
        'journey_authority': False,
    }, provenance={'source_id': resource.id if resource else None, 'source_title': resource.title if resource else ''})]}


REGISTRY = (
    Capability('podcast', ('podcast', 'audio episode'), True, _podcast, 'podcast', 'clarify'),
    Capability('video', ('video', 'youtube', 'watch'), False, _video, 'video', 'error'),
    Capability('flashcards', ('flashcard', 'flashcards', 'deck of cards'), True, _flashcards, 'flashcards', 'clarify'),
    Capability('active_recall', ('active recall', 'make me remember', 'recall me'), False, _active_recall, 'active_recall', 'error'),
    Capability('practice', ('quiz me', 'give me a question', 'give me some questions', 'test me', 'practice this', 'practice the concept', 'quick quiz', 'see if i understand'), False, _practice, 'practice', 'clarify'),
    Capability('general_feynman', ('let me teach you', 'feynman', 'i will explain it'), False, _feynman, 'feynman', 'error'),
)


def resolve_capability(query: str) -> Capability | None:
    lowered = query.lower()
    if re.search(r'\b(active recall|make me remember|recall me)\b', lowered):
        return next(item for item in REGISTRY if item.name == 'active_recall')
    if re.search(r'\b(quiz me|test me|practice (?:this|that|the|my)|give me (?:\w+\s+){0,3}questions?|quick quiz|see if i understand)\b', lowered):
        return next(item for item in REGISTRY if item.name == 'practice')
    for capability in REGISTRY:  # Priority is explicit and stable.
        if any(alias in lowered for alias in capability.aliases):
            return capability
    return None


def _continue_mode(user, query: str, previous: dict) -> dict:
    from asgiref.sync import async_to_sync
    from .services import AIService
    kind = previous['type']
    payload = previous.get('payload', {})
    topic = payload.get('topic', 'the topic')
    if kind == 'active_recall':
        prompt = (
            f"Evaluate this free-recall answer about {topic}. Question: {payload.get('question')} "
            f"Learner answer: {query}. Return strict JSON with feedback (one concise teaching sentence), "
            f"correct (boolean), and next_question (a harder or remedial free-recall question). Never expose the answer before evaluation."
        )
        try:
            raw = async_to_sync(AIService().chat)([{'role': 'user', 'content': prompt}])
            data = json.loads(re.sub(r'^```json|```$', '', raw.strip(), flags=re.I).strip())
        except Exception:
            data = {'correct': False, 'feedback': 'I could not verify that cleanly. Let’s try a narrower check.', 'next_question': f'What is one concrete fact you know about {topic}?'}
        next_index = min(int(payload.get('question_index', 1)) + 1, int(payload.get('question_total', 6)))
        return {'capability': 'active_recall', 'reply': data['feedback'], 'objects': [flow_object('active_recall', {
            **payload, 'question_index': next_index, 'question': data['next_question'],
            'previous_response': query, 'previous_correct': bool(data.get('correct')), 'answer_revealed': False,
        }, provenance=previous.get('provenance'))]}

    prompt = (
        f"You are the confused student in a Feynman exercise on {topic}. Learner explanation: {query}. "
        "Return strict JSON with reply (one natural clarification question), coverage (0-100), and misconceptions (list). "
        "Do not award mastery and do not affect any Journey."
    )
    try:
        raw = async_to_sync(AIService().chat)([{'role': 'user', 'content': prompt}])
        data = json.loads(re.sub(r'^```json|```$', '', raw.strip(), flags=re.I).strip())
    except Exception:
        data = {'reply': 'Wait—can you give me one tiny concrete example?', 'coverage': 0, 'misconceptions': []}
    return {'capability': 'general_feynman', 'reply': data['reply'], 'objects': [flow_object('feynman', {
        **payload, 'turn': int(payload.get('turn', 1)) + 1, 'current_explanation': query,
        'coverage': data.get('coverage', 0), 'misconceptions': data.get('misconceptions', []),
        'prompt': data['reply'], 'journey_authority': False,
    }, provenance=previous.get('provenance'))]}


def execute_capability(user, query: str, context: str, session=None) -> dict | None:
    pending = (session.state or {}).get('pending_capability') if session is not None else None
    if pending:
        capability = next((item for item in REGISTRY if item.name == pending.get('name')), None)
        if capability:
            pending_context = pending.get('context', '')
            result = capability.handler(user, query, '\n'.join(filter(None, [context, pending_context])))
            if 'clarification' in result:
                return {'capability': capability.name, 'reply': result['clarification'], 'objects': [], 'needs_context': True,
                        'pending_intent': {'name': capability.name, 'missing': pending.get('missing', 'topic'), 'context': pending_context}}
            return {'capability': capability.name, **result, 'clear_pending_intent': True}
    if session is not None:
        previous_message = session.messages.filter(role='assistant').exclude(flow_objects=[]).order_by('-created_at').first()
        if previous_message and previous_message.flow_objects:
            previous = previous_message.flow_objects[-1]
            if previous.get('type') in {'active_recall', 'feynman'} and previous.get('payload', {}).get('mode') == 'active':
                return _continue_mode(user, query, previous)
            if previous.get('type') == 'practice' and re.search(r'^\s*(continue (?:the )?(?:quiz|practice)|resume (?:the )?(?:quiz|practice))\s*[.!?]*$', query, re.I):
                # Move the same persisted object forward instead of regenerating or duplicating it.
                previous_message.flow_objects = [item for item in previous_message.flow_objects if str(item.get('id')) != str(previous.get('id'))]
                previous_message.save(update_fields=['flow_objects'])
                payload = previous.get('payload', {})
                return {
                    'capability': 'practice',
                    'reply': f"Back to {payload.get('topic', 'the topic')} — question {int(payload.get('question_index', 0)) + 1} of {payload.get('question_total', 1)}.",
                    'objects': [previous],
                }
            if previous.get('type') == 'practice' and re.search(r'^\s*(another( one)?|one more|next( question)?|harder|easier|make (?:the )?(?:next one|rest) (?:harder|easier))\s*[.!?]*$', query, re.I):
                payload = previous.get('payload', {})
                difficulty = 'hard' if re.search(r'hard', query, re.I) else 'easy' if re.search(r'eas', query, re.I) else str((payload.get('questions') or [{}])[-1].get('difficulty', 'medium'))
                answered = len(payload.get('responses', []))
                remaining = max(1, int(payload.get('question_total', 1)) - answered)
                requested = remaining if re.search(r'\brest\b', query, re.I) else 1
                routed = f'give me {requested} {difficulty} questions on {payload.get("topic", "this topic")}'
                followup_context = context
                if payload.get('concept_id'):
                    followup_context = f'{followup_context}\nCONCEPT {payload["concept_id"]}'
                result = _practice(user, routed, followup_context)
                if result.get('objects'):
                    next_payload = result['objects'][0].get('payload', {})
                    next_payload['question_offset'] = answered
                    next_payload['session_question_total'] = answered + int(next_payload.get('question_total', requested))
                return {'capability': 'practice', **result}
    if ACKNOWLEDGEMENT_RE.match(query):
        return {'capability': 'acknowledgement', 'reply': 'Nice 👀 Want one quick check to make sure it stuck, or should we keep moving?', 'objects': []}
    capability = resolve_capability(query)
    if not capability:
        return None
    routed_query = query
    if session is not None and not _topic(query, _resource(user, context)):
        previous_user = session.messages.filter(role='user').exclude(content=query).order_by('-created_at').first()
        if previous_user:
            routed_query = f'{query} {previous_user.content}'
    result = capability.handler(user, routed_query, context)
    if 'clarification' in result:
        return {'capability': capability.name, 'reply': result['clarification'], 'objects': [], 'needs_context': True,
                'pending_intent': {'name': capability.name, 'missing': 'source' if capability.requires_source else 'topic', 'context': context}}
    return {'capability': capability.name, **result}


def registry_manifest() -> list[dict]:
    return [{
        'name': item.name, 'aliases': item.aliases, 'requires_source': item.requires_source,
        'result_type': item.result_type, 'fallback': item.fallback,
    } for item in REGISTRY]
