"""Journey Player presentation state. Never grants mastery or objective evidence."""
from copy import deepcopy

from .models import EncounterAttempt


NON_EVIDENCE_TYPES = {'FLOW_INTRO', 'CONCEPT', 'DEFINITION', 'PROCESS', 'SEQUENCE', 'RELATIONSHIP',
                      'COMPARISON', 'CAUSE_EFFECT', 'FORMULA', 'WORKED_EXAMPLE', 'EXAMPLE', 'DIAGRAM',
                      'EVIDENCE_HIGHLIGHT', 'ARCHITECTURE', 'SIMPLE_GRAPH', 'LABELED_DIAGRAM',
                      'VIDEO', 'FLASHCARD', 'PODCAST', 'SIMULATION', 'VR'}

PLAYER_CAPABILITIES = ['VIDEO', 'FLASHCARD', 'FEYNMAN', 'LIVE_VOICE', 'MASTERY']


def _stage_type(activity):
    mapping = {
        'concept': 'CONCEPT', 'key_idea': 'DEFINITION', 'process': 'PROCESS', 'sequence': 'SEQUENCE',
        'relationship': 'RELATIONSHIP', 'comparison': 'COMPARISON', 'cause_effect': 'CAUSE_EFFECT',
        'formula': 'FORMULA', 'worked_example': 'WORKED_EXAMPLE', 'example': 'EXAMPLE', 'diagram': 'DIAGRAM',
        'evidence_highlight': 'EVIDENCE_HIGHLIGHT', 'architecture': 'ARCHITECTURE',
        'simple_graph': 'SIMPLE_GRAPH', 'labeled_diagram': 'LABELED_DIAGRAM',
        'ordering': 'ORDER', 'mcq': 'PRACTICE', 'scenario': 'PRACTICE', 'short_answer': 'PRACTICE',
        'predict': 'PRACTICE', 'reflection': 'PRACTICE',
    }
    return mapping.get(activity.get('type'), 'CONCEPT' if activity.get('purpose') == 'learn' else 'PRACTICE')


def decide_learning_sequence(session, activities, turns):
    """Build a grounded, cached stage sequence for only the current objective."""
    objective_index = min(session.current_point, max(0, len(session.objectives) - 1))
    objective = session.objectives[objective_index] if session.objectives else {'id': 'objective-1', 'text': session.concept.title}
    objective_id = objective['id']
    stages = [{
        'id': f'{objective_id}:intro', 'type': 'FLOW_INTRO', 'status': 'ready', 'optional': False,
        'title': f'Checkpoint {objective_index + 1}',
        'payload': {'text': objective.get('text') or session.concept.title},
    }]
    for activity in activities:
        if activity.get('objective_id') != objective_id:
            continue
        stages.append({
            'id': f"{objective_id}:{activity['id']}", 'type': _stage_type(activity), 'status': 'ready',
            'optional': False, 'title': activity.get('title') or activity.get('prompt') or session.concept.title,
            'learning_object_id': activity['id'] if activity.get('purpose') in {'learn', 'remediate'} else '',
            'activity_id': activity['id'] if activity.get('purpose') not in {'learn', 'remediate'} else '',
            'payload': {'activity': activity},
        })
    # Existing optional capabilities become native stages without creating another backend.
    for turn in turns:
        payload = turn.payload or {}
        for video in payload.get('videos') or []:
            if video.get('objective_id') == objective_id:
                stages.insert(-1 if len(stages) > 1 else len(stages), {
                    'id': f"{objective_id}:video:{video.get('video_id', turn.id)}", 'type': 'VIDEO',
                    'status': 'ready', 'optional': True, 'title': video.get('title') or 'Watch with purpose',
                    'payload': {'video': video},
                })
        cards = payload.get('cards') or []
        if cards and (payload.get('objective_id') in {None, '', objective_id}):
            stages.insert(-1 if len(stages) > 1 else len(stages), {
                'id': f'{objective_id}:flashcards:{turn.id}', 'type': 'FLASHCARD', 'status': 'ready',
                'optional': True, 'title': 'Lock this into memory', 'payload': {'cards': cards},
            })
        podcast = payload.get('podcast') or payload.get('audio') or {}
        if isinstance(podcast, dict) and podcast.get('audio_url') and podcast.get('objective_id') in {None, '', objective_id}:
            stages.insert(-1 if len(stages) > 1 else len(stages), {
                'id': f'{objective_id}:podcast:{turn.id}', 'type': 'PODCAST', 'status': 'ready',
                'optional': True, 'title': podcast.get('title') or 'Quick audio breakdown',
                'payload': {'podcast': podcast},
            })
    # De-duplicate stage ids while preserving pedagogical order.
    unique = []
    seen = set()
    for stage in stages:
        if stage['id'] not in seen:
            unique.append(stage); seen.add(stage['id'])
    return {'objective_id': objective_id, 'objective_index': objective_index, 'stages': unique}


def sync_player_state(session, activities, turns):
    decision = decide_learning_sequence(session, activities, turns)
    existing = deepcopy(session.state.get('player') or {})
    if existing.get('objective_id') != decision['objective_id']:
        existing = {'objective_id': decision['objective_id'], 'objective_index': decision['objective_index'],
                    'completed_stage_ids': [], 'current_stage_id': decision['stages'][0]['id'] if decision['stages'] else ''}
    completed = set(existing.get('completed_stage_ids') or [])
    stage_ids = [stage['id'] for stage in decision['stages']]
    completed.intersection_update(stage_ids)
    current = existing.get('current_stage_id')
    if current not in stage_ids:
        current = next((stage_id for stage_id in stage_ids if stage_id not in completed), stage_ids[-1] if stage_ids else '')

    # A persisted correct attempt can finish a Practice stage; Continue never can.
    current_stage = next((stage for stage in decision['stages'] if stage['id'] == current), None)
    if current_stage and current_stage.get('activity_id'):
        passed = EncounterAttempt.objects.filter(user=session.user, concept=session.concept,
                                                 activity_id=current_stage['activity_id'], correct=True).exists()
        if passed:
            completed.add(current)
            current = next((stage_id for stage_id in stage_ids if stage_id not in completed), current)

    current_definition = next((stage for stage in decision['stages'] if stage['id'] == current), None)
    player = {**existing, 'objective_id': decision['objective_id'], 'objective_index': decision['objective_index'],
              'stage_sequence': stage_ids, 'completed_stage_ids': list(completed), 'current_stage_id': current,
              'active_activity_id': current_definition.get('activity_id', '') if current_definition else ''}
    stages = []
    for stage in decision['stages']:
        item = deepcopy(stage)
        item['status'] = 'completed' if item['id'] in completed else ('active' if item['id'] == current else 'ready')
        stages.append(item)
    active = next((stage for stage in stages if stage['id'] == current), stages[0] if stages else None)
    available_capabilities = list(PLAYER_CAPABILITIES)
    if any(stage['type'] == 'PODCAST' for stage in stages):
        available_capabilities.append('PODCAST')
    public = {**player, 'journey_id': str(session.concept.path_id), 'current_stage_type': active['type'] if active else '',
              'stage_status': active['status'] if active else '', 'active_stage': active, 'stages': stages,
              'capabilities': available_capabilities,
              'active_learning_object_id': active.get('learning_object_id', '') if active else '',
              'active_activity_id': active.get('activity_id', '') if active else ''}
    if session.state.get('player') != player:
        session.state = {**session.state, 'player': player}
        session.save(update_fields=['state', 'last_active_at'])
    return public


def continue_player_stage(session):
    player = deepcopy(session.state.get('player') or {})
    current = player.get('current_stage_id', '')
    sequence = player.get('stage_sequence') or []
    if not current or current not in sequence:
        return False
    # Activity stages are evidence-gated and cannot be passed by Continue.
    if player.get('active_activity_id'):
        return False
    completed = list(dict.fromkeys([*(player.get('completed_stage_ids') or []), current]))
    next_stage = next((stage_id for stage_id in sequence if stage_id not in completed), current)
    player.update({'completed_stage_ids': completed, 'current_stage_id': next_stage})
    session.state = {**session.state, 'player': player}
    session.save(update_fields=['state', 'last_active_at'])
    return True
