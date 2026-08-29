"""Deterministic capability routing for native Flow learning objects."""
from __future__ import annotations

import re
import threading
import uuid
import json
from dataclasses import dataclass
from typing import Callable

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
        r'\b(find|show|give|make|create|generate|let|teach|you|test|active|recall|feynman|explain|explains|that|me|a|an|the|on|about|this|please|podcast|video|flashcards?|deck)\b',
        ' ', query, flags=re.I,
    )
    cleaned = re.sub(r'\s+', ' ', cleaned).strip(' .?!')
    return cleaned or (resource.title if resource else '')


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
    Capability('active_recall', ('active recall', 'test me', 'make me remember', 'recall me'), False, _active_recall, 'active_recall', 'error'),
    Capability('general_feynman', ('let me teach you', 'feynman', 'i will explain it'), False, _feynman, 'feynman', 'error'),
)


def resolve_capability(query: str) -> Capability | None:
    lowered = query.lower()
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
    if session is not None:
        previous_message = session.messages.filter(role='assistant').exclude(flow_objects=[]).order_by('-created_at').first()
        if previous_message and previous_message.flow_objects:
            previous = previous_message.flow_objects[-1]
            if previous.get('type') in {'active_recall', 'feynman'} and previous.get('payload', {}).get('mode') == 'active':
                return _continue_mode(user, query, previous)
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
        return {'capability': capability.name, 'reply': result['clarification'], 'objects': [], 'needs_context': True}
    return {'capability': capability.name, **result}


def registry_manifest() -> list[dict]:
    return [{
        'name': item.name, 'aliases': item.aliases, 'requires_source': item.requires_source,
        'result_type': item.result_type, 'fallback': item.fallback,
    } for item in REGISTRY]
