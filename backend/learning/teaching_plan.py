"""Validated, cached semantic teaching plans for Journey 2.0.

Plans describe pedagogy, never frontend code. Evidence and progression remain
owned by EncounterAttempt and the completion controller.
"""
import hashlib
import json
import logging
import re

from django.conf import settings

logger = logging.getLogger('nitemind')

REPRESENTATIONS = {
    'CONCEPT_MAP', 'RELATIONSHIP_MAP', 'COMPARISON', 'PROCESS_FLOW', 'CYCLE',
    'TIMELINE', 'HIERARCHY', 'CAUSE_EFFECT', 'FORMULA', 'WORKED_EXAMPLE',
    'EVIDENCE_HIGHLIGHT', 'ARCHITECTURE', 'SIMPLE_GRAPH', 'LABELED_DIAGRAM',
    'GROUNDED_EXPLANATION',
}
MOMENT_TYPES = {
    'EXPLAIN', 'VISUALIZE', 'DEMONSTRATE', 'EXAMPLE', 'INTERACT', 'CHECK',
    'REMEDIATE', 'REFLECT', 'FEYNMAN', 'FLASHCARD', 'OPTIONAL_MEDIA',
    'OBJECTIVE_COMPLETE',
}
INTERACTIONS = {'NONE', 'MCQ', 'MATCHING', 'ORDERING', 'SORTING', 'TAP_TARGET', 'REVEAL', 'SHORT_ANSWER', 'STEP_SOLVER', 'EVIDENCE_HIGHLIGHT'}
MAX_MOMENTS = 8
INTERNAL_LANGUAGE = re.compile(
    r'\b(?:checkpoint\s*\d*|apply .+ in (?:a )?concrete situation|source alignment|'
    r'expected relationship|mechanism in the source|relationship in the source|key concept)\b', re.I,
)


class TeachingPlanValidationError(ValueError):
    pass


def learner_facing_title(value, representation='GROUNDED_EXPLANATION'):
    """Turn controller/objective scaffolding into a short spoken-stage title."""
    text = _text(value, 180).strip(' .:;-')
    text = re.sub(r'^(?:the learner (?:will|should|can)|learners? (?:will|should|can)|you (?:will|should|can))\s+', '', text, flags=re.I)
    text = re.sub(r'^(?:understand|explain|identify|describe|define|apply|compare)\s+(?:how|why|what|the role of|that)?\s*', '', text, flags=re.I)
    text = re.sub(r'\s+in (?:a )?concrete situation$', '', text, flags=re.I)
    if INTERNAL_LANGUAGE.search(text):
        text = re.sub(r'^checkpoint\s*\d*\s*', '', text, flags=re.I)
    words = text.split()
    if len(words) > 8:
        text = ' '.join(words[:8]).rstrip(',') + '…'
    if not text:
        return {
            'PROCESS_FLOW': 'Watch it unfold', 'COMPARISON': 'Spot the difference',
            'WORKED_EXAMPLE': 'Let\'s work it through', 'ARCHITECTURE': 'See how it connects',
            'CYCLE': 'Follow the route', 'EVIDENCE_HIGHLIGHT': 'Read the evidence',
        }.get(representation, 'Here\'s the idea')
    return text[0].upper() + text[1:]


def _sentences(value, limit=5):
    return [_text(item, 180) for item in re.split(r'(?<=[.!?])\s+|\s*(?:→|->|\n)\s*', str(value or '')) if _text(item, 180)][:limit]


def _validate_mcq_quality(prompt, options, correct_index):
    if len(prompt.split()) > 34 or INTERNAL_LANGUAGE.search(prompt):
        raise TeachingPlanValidationError('MCQ prompt is verbose or exposes internal language')
    if len(options) < 3 or len({item.casefold() for item in options}) != len(options):
        raise TeachingPlanValidationError('MCQ requires distinct plausible alternatives')
    if any(INTERNAL_LANGUAGE.search(item) or len(item.split()) > 28 for item in options):
        raise TeachingPlanValidationError('MCQ option exposes scaffolding or is too verbose')
    correct = options[correct_index]
    signatures = {bool(re.match(r'^(?:a |an |the |to |using |by |it )', item, re.I)) for item in options}
    if len(signatures) > 1 or not correct.strip():
        raise TeachingPlanValidationError('MCQ options are not grammatically parallel')


def _text(value, limit=500, required=False):
    result = re.sub(r'\s+', ' ', str(value or '')).strip()
    if required and not result:
        raise TeachingPlanValidationError('required text is empty')
    return result[:limit]


def _list(value, field):
    if value in (None, ''):
        return []
    if not isinstance(value, list):
        raise TeachingPlanValidationError(f'{field} must be a list')
    return value


def validate_teaching_plan(raw, expected_objective_id=None):
    if not isinstance(raw, dict):
        raise TeachingPlanValidationError('plan must be an object')
    serialized = json.dumps(raw, default=str)
    if re.search(r'<\/?(?:script|svg|div|iframe)|\b(?:html|jsx|javascript|animation_code)\b', serialized, re.I):
        raise TeachingPlanValidationError('plans may contain semantic data only')
    objective_id = _text(raw.get('objective_id'), 120, required=True)
    if expected_objective_id and objective_id != expected_objective_id:
        raise TeachingPlanValidationError('plan belongs to another objective')
    representation = _text(raw.get('recommended_representation'), 40, required=True).upper()
    if representation not in REPRESENTATIONS:
        raise TeachingPlanValidationError('unsupported representation')
    moments = raw.get('teaching_moments')
    if not isinstance(moments, list) or not 1 <= len(moments) <= MAX_MOMENTS:
        raise TeachingPlanValidationError('teaching_moments must contain 1-8 moments')
    validated_moments = []
    for index, moment in enumerate(moments):
        if not isinstance(moment, dict):
            raise TeachingPlanValidationError('moment must be an object')
        kind = _text(moment.get('type'), 32, required=True).upper()
        if kind not in MOMENT_TYPES:
            raise TeachingPlanValidationError(f'unsupported moment type: {kind}')
        moment_representation = _text(moment.get('representation') or representation, 40).upper()
        if moment_representation not in REPRESENTATIONS:
            raise TeachingPlanValidationError('moment has unsupported representation')
        interaction = _text(moment.get('interaction') or 'NONE', 32).upper()
        if interaction not in INTERACTIONS:
            raise TeachingPlanValidationError('unsupported interaction')
        content = moment.get('content') or {}
        if not isinstance(content, dict):
            raise TeachingPlanValidationError('moment content must be an object')
        if re.search(r'<\/?(?:script|svg|style|iframe)|\b(?:jsx|javascript|onclick)\b', json.dumps(content, default=str), re.I):
            raise TeachingPlanValidationError('teaching content may not contain UI code')
        safe_content = {
            'title': _text(content.get('title'), 160), 'body': _text(content.get('body'), 900),
            'lead': _text(content.get('lead'), 240), 'takeaway': _text(content.get('takeaway'), 360),
            'prompt': _text(content.get('prompt'), 360),
            'formula': _text(content.get('formula'), 300),
            'nodes': [_text(item, 180) for item in _list(content.get('nodes'), 'nodes')[:8] if _text(item, 180)],
            'edges': [[_text(edge[0], 100), _text(edge[1], 100), _text(edge[2] if len(edge) > 2 else '', 120)] for edge in _list(content.get('edges'), 'edges')[:10] if isinstance(edge, list) and len(edge) >= 2],
            'columns': [_text(item, 140) for item in _list(content.get('columns'), 'columns')[:3] if _text(item, 140)],
            'rows': [[_text(cell, 220) for cell in row[:3]] for row in _list(content.get('rows'), 'rows')[:6] if isinstance(row, list)],
            'steps': [_text(item, 220) for item in _list(content.get('steps'), 'steps')[:7] if _text(item, 220)],
            'evidence': [_text(item, 320) for item in _list(content.get('evidence'), 'evidence')[:5] if _text(item, 320)],
            'evidence_concepts': [_text(item, 100) for item in _list(content.get('evidence_concepts'), 'evidence_concepts')[:8] if _text(item, 100)],
            'expected_answer': _text(content.get('expected_answer'), 360),
            'options': [_text(item, 220) for item in _list(content.get('options'), 'options')[:6] if _text(item, 220)],
            'correct_index': content.get('correct_index'),
            'items': [_text(item, 180) for item in _list(content.get('items'), 'items')[:8] if _text(item, 180)],
            'correct_order': _list(content.get('correct_order'), 'correct_order'),
            'pairs': [[_text(pair[0], 140), _text(pair[1], 180)] for pair in _list(content.get('pairs'), 'pairs')[:8] if isinstance(pair, list) and len(pair) >= 2],
            'groups': [_text(item, 120) for item in _list(content.get('groups'), 'groups')[:5] if _text(item, 120)],
            'target': _text(content.get('target'), 120),
            'correct_evidence': _list(content.get('correct_evidence'), 'correct_evidence'),
        }
        if not any((safe_content['body'], safe_content['nodes'], safe_content['rows'], safe_content['steps'], safe_content['formula'], safe_content['evidence'])):
            raise TeachingPlanValidationError(f'moment {index + 1} has no renderable content')
        if kind in {'INTERACT', 'CHECK'} and interaction != 'NONE':
            if not safe_content['prompt']:
                raise TeachingPlanValidationError('interactive moments require a self-contained prompt')
            if interaction == 'MCQ':
                options, correct_index = safe_content['options'], safe_content['correct_index']
                if len(options) < 2 or not isinstance(correct_index, int) or correct_index not in range(len(options)):
                    raise TeachingPlanValidationError('MCQ moments require options and a valid correct_index')
                _validate_mcq_quality(safe_content['prompt'], options, correct_index)
            elif interaction == 'MATCHING' and len(safe_content['pairs']) < 2:
                raise TeachingPlanValidationError('matching moments require at least two grounded pairs')
            elif interaction == 'ORDERING':
                items, order = safe_content['items'], safe_content['correct_order']
                if len(items) < 3 or sorted(order) != list(range(len(items))):
                    raise TeachingPlanValidationError('ordering moments require a complete correct_order')
            elif interaction == 'SORTING' and (len(safe_content['items']) < 2 or len(safe_content['groups']) < 2):
                raise TeachingPlanValidationError('sorting moments require items and groups')
            elif interaction == 'TAP_TARGET' and (len(safe_content['nodes']) < 2 or not safe_content['target']):
                raise TeachingPlanValidationError('tap-target moments require nodes and a target')
            elif interaction == 'EVIDENCE_HIGHLIGHT':
                evidence, correct_evidence = safe_content['evidence'], safe_content['correct_evidence']
                if len(evidence) < 2 or not correct_evidence or any(not isinstance(item, int) or item not in range(len(evidence)) for item in correct_evidence):
                    raise TeachingPlanValidationError('evidence moments require grounded excerpts and valid evidence indexes')
            elif interaction in {'SHORT_ANSWER', 'STEP_SOLVER'} and not (safe_content['expected_answer'] or safe_content['evidence_concepts']):
                raise TeachingPlanValidationError('written-response moments require an expected answer or evidence concepts')
        validated_moments.append({'id': _text(moment.get('id') or f'moment-{index + 1}', 80), 'type': kind,
                                  'representation': moment_representation, 'interaction': interaction,
                                  'content': safe_content, 'optional': bool(moment.get('optional', False))})
    grounding = raw.get('source_grounding') or {}
    if not isinstance(grounding, dict):
        raise TeachingPlanValidationError('source_grounding must be an object')
    return {
        'version': 1, 'objective_id': objective_id,
        'learning_goal': _text(raw.get('learning_goal'), 360, required=True),
        'key_insight': _text(raw.get('key_insight'), 500, required=True),
        'prerequisite_assumptions': [_text(item, 220) for item in _list(raw.get('prerequisite_assumptions'), 'prerequisite_assumptions')[:5] if _text(item, 220)],
        'likely_misconceptions': [_text(item, 240) for item in _list(raw.get('likely_misconceptions'), 'likely_misconceptions')[:5] if _text(item, 240)],
        'teaching_strategy': _text(raw.get('teaching_strategy'), 240, required=True),
        'recommended_representation': representation,
        'teaching_moments': validated_moments,
        'interaction_strategy': _text(raw.get('interaction_strategy'), 240),
        'check_strategy': _text(raw.get('check_strategy'), 240, required=True),
        'remediation_strategy': _text(raw.get('remediation_strategy'), 240, required=True),
        'source_grounding': {key: value for key, value in grounding.items() if key in {'resource_id', 'resource_title', 'section', 'page', 'excerpt', 'asset_id'} and value not in ('', None)},
        'difficulty': _text(raw.get('difficulty') or 'medium', 20),
        'optional_depth': [_text(item, 240) for item in _list(raw.get('optional_depth'), 'optional_depth')[:4] if _text(item, 240)],
        'subject_family': _text(raw.get('subject_family') or 'general', 40),
        'origin': _text(raw.get('origin') or 'ai', 20),
    }


def classify_subject(concept, objective_text=''):
    value = ' '.join([str(getattr(concept.path, 'subject', '') or ''), str(concept.title or ''), str(objective_text or '')]).lower()
    if re.search(r'novel|poem|character|theme|author|achebe|literature|bias|irony|steward', value): return 'literature'
    if re.search(r'biology|heart|blood|cell|organ|circulation|photosynth|anatom', value): return 'biology'
    if re.search(r'equation|formula|calculate|numerical|newton|algebra|calculus|matrix|derivative', value): return 'mathematics'
    if re.search(r'code|program|api|database|frontend|backend|react|spring|postgres|algorithm', value): return 'computer_science'
    if re.search(r'history|war|empire|century|revolution|event|colonial', value): return 'history'
    return 'general'


def select_representation(subject, objective_text, grounding=None):
    value = f"{objective_text} {(grounding or {}).get('excerpt', '')}".lower()
    if subject == 'literature' and re.search(r'belief|behavio|irony|contrast|versus|bias|prejudice', value): return 'COMPARISON'
    if subject == 'literature': return 'EVIDENCE_HIGHLIGHT'
    if subject == 'biology' and re.search(r'cycle|circul|route|path|heart|blood', value): return 'CYCLE'
    if subject == 'biology': return 'LABELED_DIAGRAM'
    if subject == 'mathematics' and re.search(r'=|formula|equation|newton|calculate|solve', value): return 'WORKED_EXAMPLE'
    if subject == 'computer_science' and re.search(r'frontend|backend|database|api|layer|architecture', value): return 'ARCHITECTURE'
    if subject == 'history' and re.search(r'before|after|timeline|century|event', value): return 'TIMELINE'
    if re.search(r'compare|contrast|versus|difference|whereas', value): return 'COMPARISON'
    if re.search(r'cause|effect|because|leads? to|results? in', value): return 'CAUSE_EFFECT'
    if re.search(r'steps?|process|algorithm|first|then|finally', value): return 'PROCESS_FLOW'
    return 'GROUNDED_EXPLANATION'


def select_interaction(subject, objective_text, representation):
    value = objective_text.lower()
    if representation in {'PROCESS_FLOW', 'TIMELINE'} and re.search(r'order|sequence|steps?|process|first|then', value): return 'ORDERING'
    if representation in {'RELATIONSHIP_MAP', 'ARCHITECTURE'}: return 'MATCHING'
    if representation in {'LABELED_DIAGRAM', 'CYCLE'}: return 'TAP_TARGET'
    if representation == 'EVIDENCE_HIGHLIGHT' or subject == 'literature': return 'EVIDENCE_HIGHLIGHT'
    if subject == 'mathematics' and representation in {'FORMULA', 'WORKED_EXAMPLE'}: return 'STEP_SOLVER'
    if representation == 'COMPARISON': return 'MCQ'
    return 'SHORT_ANSWER'


def safe_fallback_plan(concept, objective, grounding):
    objective_id = str(objective.get('id') or 'objective-1')
    goal = _text(objective.get('text') or concept.title, 360, required=True)
    excerpt = _text((grounding or {}).get('excerpt') or concept.summary or concept.description or goal, 900)
    subject = classify_subject(concept, goal)
    representation = select_representation(subject, goal, grounding)
    interaction = select_interaction(subject, goal, representation)
    learner_title = learner_facing_title(goal, representation)
    content = {'title': learner_title, 'body': '', 'lead': '', 'takeaway': goal}
    if representation == 'COMPARISON':
        belief = 'What is claimed or believed'
        behaviour = 'What the evidence actually shows'
        if subject == 'literature' and re.search(r'green|steward|bias|prejudice', f'{goal} {excerpt}', re.I):
            belief, behaviour = "Green's belief about Africans", "Green's behaviour toward African stewards"
        content.update({'columns': [belief, behaviour], 'rows': [[goal, excerpt[:360]]], 'body': ''})
    elif representation in {'CYCLE', 'ARCHITECTURE'}:
        if subject == 'biology' and re.search(r'heart|circul|blood', f'{goal} {excerpt}', re.I):
            content.update({'nodes': ['Heart', 'Lungs', 'Heart', 'Body'], 'edges': [['Heart','Lungs','toward the lungs'],['Lungs','Heart','oxygenated return'],['Heart','Body','systemic route'],['Body','Heart','return']], 'body': ''})
        elif subject == 'computer_science' and re.search(r'react|spring|postgres|frontend|backend|database', f'{goal} {excerpt}', re.I):
            content.update({'nodes': ['React Native', 'Spring Boot', 'PostgreSQL'], 'edges': [['React Native','Spring Boot','HTTP / API'],['Spring Boot','PostgreSQL','database query']], 'body': ''})
        if not content.get('nodes'):
            pieces = _sentences(excerpt, 4) or [learner_title, 'Connected idea', 'Result']
            content.update({'nodes': pieces, 'edges': [[pieces[index], pieces[(index + 1) % len(pieces)], ''] for index in range(len(pieces))], 'body': ''})
    elif representation in {'PROCESS_FLOW', 'TIMELINE', 'CAUSE_EFFECT'}:
        pieces = _sentences(excerpt, 5)
        if len(pieces) < 3:
            pieces = ['What goes in', 'What happens inside', 'What comes out']
        content.update({'steps': pieces, 'body': '', 'progressive': True})
    elif representation == 'WORKED_EXAMPLE':
        content.update({'steps': [learner_title, 'Substitute the known information.', 'Work one transformation at a time.', 'Check the result against the goal.'], 'body': '', 'progressive': True})
    elif representation == 'EVIDENCE_HIGHLIGHT':
        content.update({'evidence': _sentences(excerpt, 4) or [excerpt[:480]], 'body': ''})
    else:
        content['body'] = excerpt[:520]
    plan = {
        'objective_id': objective_id, 'learning_goal': goal, 'key_insight': goal,
        'prerequisite_assumptions': [], 'likely_misconceptions': [],
        'teaching_strategy': f'Teach with a concise {representation.lower().replace("_", " ")}.',
        'recommended_representation': representation,
        'teaching_moments': [{'id': 'teach', 'type': 'VISUALIZE' if representation != 'GROUNDED_EXPLANATION' else 'EXPLAIN',
                              'representation': representation, 'interaction': 'NONE', 'content': content}],
        'interaction_strategy': interaction, 'check_strategy': f'Use {interaction.lower().replace("_", " ")} only after teaching.',
        'remediation_strategy': 'Choose a different representation and target the demonstrated misconception.',
        'source_grounding': grounding or {}, 'difficulty': concept.difficulty, 'optional_depth': [],
        'subject_family': subject, 'origin': 'fallback',
    }
    return validate_teaching_plan(plan, objective_id)


def _extract_json(value):
    text = str(value or '').strip()
    fenced = re.search(r'```(?:json)?\s*(\{.*\})\s*```', text, re.S | re.I)
    if fenced: text = fenced.group(1)
    if not text.startswith('{'):
        start, end = text.find('{'), text.rfind('}')
        if start >= 0 and end > start: text = text[start:end + 1]
    return json.loads(text)


def generate_teaching_plan(concept, objective, grounding, allow_ai=None):
    """Generate once, validate strictly, then use a non-fragmenting fallback."""
    fallback = safe_fallback_plan(concept, objective, grounding)
    enabled = getattr(settings, 'JOURNEY_TEACHING_AI_ENABLED', False) if allow_ai is None else allow_ai
    if not enabled:
        logger.info('[Journey TeachingPlan] attempted=false accepted=false fallback=true objective=%s reason=kill-switch', objective.get('id'))
        return fallback
    prompt = {
        'objective_id': objective.get('id'), 'objective': objective.get('text'), 'concept': concept.title,
        'goal': concept.path.goal, 'difficulty': concept.difficulty, 'source_grounding': grounding,
        'allowed_representations': sorted(REPRESENTATIONS), 'allowed_moment_types': sorted(MOMENT_TYPES),
        'allowed_interactions': sorted(INTERACTIONS),
    }
    messages = [{'role': 'system', 'content': 'Return one JSON TeachingPlan only. Never output HTML, JSX, SVG, URLs, or animation code. Use only grounded facts and concise learner-facing content.'},
                {'role': 'user', 'content': json.dumps(prompt, default=str)}]
    try:
        from ai_assistant.services import AIService
        raw = AIService().chat_sync(messages, task='TEACHING_GENERATION', max_tokens=1800)
        plan = validate_teaching_plan(_extract_json(raw), str(objective.get('id')))
        plan['origin'] = 'ai'
        logger.info('[Journey TeachingPlan] attempted=true accepted=true fallback=false objective=%s representation=%s moments=%s', objective.get('id'), plan['recommended_representation'], len(plan['teaching_moments']))
        return plan
    except Exception as exc:
        logger.warning('[Journey TeachingPlan] attempted=true accepted=false fallback=true objective=%s reason=%s', objective.get('id'), exc)
        return fallback


def teaching_plan_fingerprint(concept, objective, grounding):
    payload = json.dumps({'concept': str(concept.id), 'objective': objective, 'grounding': grounding, 'version': 1}, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def get_or_create_teaching_plan(session, grounding, allow_ai=None):
    index = min(session.current_point, max(0, len(session.objectives) - 1))
    objective = session.objectives[index] if session.objectives else {'id': 'objective-1', 'text': session.concept.title}
    objective_id = str(objective['id'])
    fingerprint = teaching_plan_fingerprint(session.concept, objective, grounding)
    plans = dict(session.state.get('teaching_plans') or {})
    cached = plans.get(objective_id)
    if isinstance(cached, dict) and cached.get('fingerprint') == fingerprint:
        try:
            plan = validate_teaching_plan(cached.get('plan'), objective_id)
            logger.info('[Journey TeachingPlan] cache=true objective=%s origin=%s representation=%s', objective_id, plan.get('origin'), plan.get('recommended_representation'))
            return plan
        except TeachingPlanValidationError: pass
    plan = generate_teaching_plan(session.concept, objective, grounding, allow_ai=allow_ai)
    plans[objective_id] = {'fingerprint': fingerprint, 'plan': plan}
    session.state = {**session.state, 'teaching_plans': plans}
    session.save(update_fields=['state', 'last_active_at'])
    return plan


def teaching_activity_from_plan(concept, objective, plan, activity_id, moment=None):
    moment = moment or next((item for item in plan['teaching_moments'] if item['type'] in {'EXPLAIN','VISUALIZE','DEMONSTRATE','EXAMPLE','REMEDIATE'}), plan['teaching_moments'][0])
    mapping = {'CONCEPT_MAP':'diagram','RELATIONSHIP_MAP':'relationship','COMPARISON':'comparison','PROCESS_FLOW':'process','CYCLE':'diagram','TIMELINE':'sequence','HIERARCHY':'diagram','CAUSE_EFFECT':'cause_effect','FORMULA':'formula','WORKED_EXAMPLE':'worked_example','EVIDENCE_HIGHLIGHT':'evidence_highlight','ARCHITECTURE':'architecture','SIMPLE_GRAPH':'simple_graph','LABELED_DIAGRAM':'labeled_diagram','GROUNDED_EXPLANATION':'concept'}
    content = dict(moment['content'])
    if content.get('nodes'): content['nodes'] = [{'id': f'n{index}', 'label': label} for index, label in enumerate(content['nodes'])]
    if content.get('edges'): content['edges'] = [{'from': edge[0], 'to': edge[1], 'label': edge[2]} for edge in content['edges']]
    representation = moment.get('representation') or plan['recommended_representation']
    display_title = learner_facing_title(content.get('title') or plan['learning_goal'], representation)
    return {'id': activity_id, 'concept_id': str(concept.id), 'objective_id': objective['id'], 'objective_index': objective.get('index', 0),
            'purpose': 'remediate' if moment['type'] == 'REMEDIATE' else 'learn', 'stage': 'learn', 'type': mapping[representation],
            'prompt': display_title, 'title': display_title,
            'content': {**content, 'title': display_title, 'knowledge_type': representation, 'subject_family': plan['subject_family'],
                        'progressive': content.get('progressive', True)},
            'difficulty': plan['difficulty'], 'estimated_seconds': 75, 'grounding': plan['source_grounding'],
            'goal_relevance': concept.path.goal or '', 'presentation_reason': plan['teaching_strategy']}


def teaching_activities_from_plan(concept, objective, plan, activity_id_factory):
    """Preserve the validated moment sequence instead of collapsing it to one block."""
    moments = [item for item in plan['teaching_moments'] if item['type'] in {'EXPLAIN','VISUALIZE','DEMONSTRATE','EXAMPLE','REMEDIATE'}]
    moments = moments or [plan['teaching_moments'][0]]
    activities = []
    for index, moment in enumerate(moments):
        activities.append(teaching_activity_from_plan(
            concept, objective, plan, activity_id_factory(f'{objective["id"]}:{moment["id"]}:{index}'), moment=moment,
        ))
    logger.info('[Journey TeachingPlan] objective=%s origin=%s requested=%s moments=%s', objective['id'], plan.get('origin'), plan.get('recommended_representation'), len(activities))
    return activities
