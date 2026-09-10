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
    'DATA_TABLE', 'CODE_TRACE',
}
MOMENT_TYPES = {
    'EXPLAIN', 'VISUALIZE', 'DEMONSTRATE', 'EXAMPLE', 'INTERACT', 'CHECK',
    'REMEDIATE', 'REFLECT', 'FEYNMAN', 'FLASHCARD', 'OPTIONAL_MEDIA',
    'OBJECTIVE_COMPLETE',
    'SHOW', 'CONNECT', 'COMPARE', 'REINFORCE', 'OPTIONAL_DEPTH',
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
    if re.search(r'<\/?(?:script|svg|div|iframe)|\b(?:jsx|animation_code)\b', serialized, re.I):
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
    taught = []
    from .material_grounding import FILLER
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
        if re.search(r'<\/?(?:script|svg|style|iframe)|\b(?:jsx|onclick)\b', json.dumps(content, default=str), re.I):
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
        if not any((safe_content['body'], safe_content['nodes'], safe_content['rows'], safe_content['steps'], safe_content['formula'], safe_content['evidence'], safe_content['prompt'], content.get('code'))):
            raise TeachingPlanValidationError(f'moment {index + 1} has no renderable content')
        if any(FILLER.fullmatch(step) for step in [safe_content['body'], *safe_content['steps']]):
            raise TeachingPlanValidationError('Generic teaching steps are not instructional content')
        if len(str(content.get('formula') or '')) > 300:
            raise TeachingPlanValidationError('Formula exceeds display limit; cannot safely truncate mathematical content')
        if moment_representation == 'WORKED_EXAMPLE' and (len(safe_content['steps']) < 3 or not safe_content['formula']):
            raise TeachingPlanValidationError('Worked example needs an operation and concrete progression')
        if moment_representation in {'PROCESS_FLOW', 'TIMELINE'} and len(safe_content['steps']) < 2:
            raise TeachingPlanValidationError('Process needs meaningful ordered stages')
        if moment_representation == 'COMPARISON' and (len(safe_content['columns']) < 2 or not safe_content['rows']):
            raise TeachingPlanValidationError('Comparison needs entities and dimensions')
        if moment_representation in {'ARCHITECTURE', 'RELATIONSHIP_MAP'} and (len(safe_content['nodes']) < 2 or not safe_content['edges']):
            raise TeachingPlanValidationError('Relationships need components and connections')
        if kind in {'INTERACT', 'CHECK'} and interaction != 'NONE':
            established = ' '.join(taught + [str(item) for item in raw.get('prerequisite_assumptions', [])]).casefold()
            tested = safe_content['evidence_concepts'] or [safe_content['expected_answer']]
            if raw.get('version') != 3 and (not taught or not all(item and item.casefold() in established for item in tested)):
                raise TeachingPlanValidationError('Check assesses knowledge that has not been established')
        else:
            taught.append(' '.join([safe_content['body'], safe_content['formula'], *safe_content['steps'], *safe_content['evidence'], *safe_content['nodes']]))
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
        'version': 3 if raw.get('version') == 3 else 2, 'objective_id': objective_id,
        'fallback_reason': _text(raw.get('fallback_reason'), 240),
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
        'source_grounding': {key: value for key, value in grounding.items() if key in {'resource_id', 'resource_title', 'section', 'page', 'excerpt', 'asset_id', 'source_refs'} and value not in ('', None)},
        'difficulty': _text(raw.get('difficulty') or 'medium', 20),
        'optional_depth': [_text(item, 240) for item in _list(raw.get('optional_depth'), 'optional_depth')[:4] if _text(item, 240)],
        'subject_family': _text(raw.get('subject_family') or 'general', 40),
        'origin': _text(raw.get('origin') or 'ai', 20),
    }


def classify_subject(concept, objective_text=''):
    """Preserve declared context without inferring a domain from fixture vocabulary."""
    declared = str(getattr(getattr(concept, 'path', None), 'subject', '') or '').strip()
    normalized = re.sub(r'[^a-z0-9]+', '_', declared.casefold()).strip('_')
    return normalized[:40] or 'general'


def select_representation(subject, objective_text, grounding=None):
    """Choose from grounded semantic shape; subject is retained for API compatibility only."""
    knowledge = (grounding or {}).get('knowledge') or {}
    semantic_types = {item.get('semantic_type') for item in knowledge.get('semantic_units', [])
                      if item.get('support') != 'enrichment'}
    relationship_types = {item.get('relationship_type') for item in knowledge.get('knowledge_relationships', [])
                          if item.get('support') != 'enrichment'}
    value = f"{objective_text} {(grounding or {}).get('excerpt', '')}".lower()
    if 'WORKED_EXAMPLE' in semantic_types or (knowledge.get('worked_examples') and re.search(r'calculate|solve|estimate|work through', objective_text, re.I)): return 'WORKED_EXAMPLE'
    if 'ARCHITECTURE' in semantic_types: return 'ARCHITECTURE'
    if {'CLAIM', 'EVIDENCE'} <= semantic_types or 'QUOTATION' in semantic_types: return 'EVIDENCE_HIGHLIGHT'
    if 'TIMELINE_EVENT' in semantic_types or 'PRECEDES' in relationship_types: return 'TIMELINE'
    if 'CAUSE_EFFECT' in semantic_types or 'CAUSES' in relationship_types: return 'CAUSE_EFFECT'
    if 'PROCESS' in semantic_types: return 'PROCESS_FLOW'
    if 'DATA_TABLE' in semantic_types: return 'DATA_TABLE'
    if 'CODE' in semantic_types: return 'CODE_TRACE'
    if 'FORMULA' in semantic_types: return 'FORMULA'
    if relationship_types & {'PART_OF', 'USED_BY', 'LEADS_TO', 'DEPENDS_ON', 'APPLIES_TO'}: return 'RELATIONSHIP_MAP'
    if re.search(r'compare|contrast|versus|difference|whereas', value): return 'COMPARISON'
    if re.search(r'cause|effect|because|leads? to|results? in', value): return 'CAUSE_EFFECT'
    if re.search(r'steps?|process|algorithm|first|then|finally', value): return 'PROCESS_FLOW'
    return 'GROUNDED_EXPLANATION'


def select_interaction(subject, objective_text, representation):
    value = objective_text.lower()
    if representation in {'PROCESS_FLOW', 'TIMELINE'} and re.search(r'order|sequence|steps?|process|first|then', value): return 'ORDERING'
    if representation in {'RELATIONSHIP_MAP', 'ARCHITECTURE'}: return 'MATCHING'
    if representation in {'LABELED_DIAGRAM', 'CYCLE'}: return 'TAP_TARGET'
    if representation == 'EVIDENCE_HIGHLIGHT': return 'EVIDENCE_HIGHLIGHT'
    if representation in {'FORMULA', 'WORKED_EXAMPLE'}: return 'STEP_SOLVER'
    if representation == 'COMPARISON': return 'MCQ'
    return 'SHORT_ANSWER'


def safe_fallback_plan(concept, objective, grounding):
    objective_id = str(objective.get('id') or 'objective-1')
    goal = _text(objective.get('text') or concept.title, 360, required=True)
    excerpt = _text((grounding or {}).get('excerpt') or concept.summary or concept.description or goal, 900)
    subject = classify_subject(concept, goal)
    from .material_grounding import bundle_from_excerpt, semantic_content
    semantic_grounding = bundle_from_excerpt(grounding or {'excerpt': excerpt})
    representation = select_representation(subject, goal, semantic_grounding)
    interaction = select_interaction(subject, goal, representation)
    learner_title = learner_facing_title(goal, representation)
    content = {'title': learner_title, 'body': '', 'lead': '', 'takeaway': goal}
    representation, payload, reason = semantic_content(semantic_grounding, representation)
    content.update(payload)
    if not any(content.get(key) for key in ('body', 'steps', 'nodes', 'formula', 'evidence', 'rows')):
        content['body'] = excerpt or 'This material does not yet contain enough extracted content to teach this objective.'
    interaction = select_interaction(subject, goal, representation)
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
    result = validate_teaching_plan(plan, objective_id)
    result['fallback_reason'] = reason
    return result


def grounded_fallback_plan(concept, objective, grounding, prerequisites=None):
    """Build a compact evidence-bearing arc when every configured provider fails."""
    pages = grounding.get('pages') or []
    knowledge = grounding.get('knowledge') or {}
    page_text = {page['id']: page.get('text', '') for page in pages}
    requested_ids = set(objective.get('knowledge_ids') or [])
    items = [item for values in knowledge.values() for item in values
             if isinstance(item, dict) and item.get('support') == 'source' and item.get('id')]
    target = next((item for item in items if item['id'] in requested_ids), None)
    if target is None:
        statement = str(objective.get('source_statement') or '')
        target = next((item for item in items if item.get('text') == statement), None)
    if target is None or not pages:
        return safe_fallback_plan(concept, objective, grounding)

    target_quote = str(target.get('text') or target.get('problem') or '').strip()
    target_refs = [ref.get('page_id') or ref.get('id') for ref in target.get('source_refs', [])
                   if isinstance(ref, dict) and (ref.get('page_id') or ref.get('id')) in page_text]
    if not target_quote or not target_refs or not any(target_quote in page_text[ref] for ref in target_refs):
        return safe_fallback_plan(concept, objective, grounding)

    def source_lines(page):
        return [line.strip() for line in page.get('text', '').splitlines()
                if line.strip() and not re.match(r'^(?:#{1,6}\s+|page\s+\d+\b)', line.strip(), re.I)]

    candidates = [(page['id'], line) for page in pages for line in source_lines(page)
                  if 25 <= len(line) <= 360]
    context_ref, context_quote = next(((ref, line) for ref, line in candidates if line != target_quote),
                                      (target_refs[0], target_quote))
    related = next(((ref, line) for ref, line in reversed(candidates)
                    if line not in {context_quote, target_quote}), None)
    subject = classify_subject(concept, objective.get('text', ''))
    title = learner_facing_title(objective.get('text') or concept.title)
    recommended = select_representation(subject, objective.get('text', ''), grounding)
    arc_shapes = {
        'WORKED_EXAMPLE': ('CONTEXT', 'IDEA', 'SHOW', 'VERIFY'),
        'FORMULA': ('CONTEXT', 'IDEA', 'SHOW', 'VERIFY'),
        'ARCHITECTURE': ('CONTEXT', 'SHOW', 'CONNECT', 'VERIFY'),
        'EVIDENCE_HIGHLIGHT': ('CONTEXT', 'SHOW', 'CONNECT', 'VERIFY'),
        'TIMELINE': ('CONTEXT', 'SHOW', 'CONNECT', 'VERIFY'),
        'CAUSE_EFFECT': ('CONTEXT', 'IDEA', 'CONNECT', 'VERIFY'),
        'DATA_TABLE': ('CONTEXT', 'SHOW', 'TRY', 'VERIFY'),
        'CODE_TRACE': ('CONTEXT', 'SHOW', 'TRY', 'VERIFY'),
    }
    arc = arc_shapes.get(recommended, ('HOOK', 'IDEA', 'CONNECT', 'VERIFY'))

    def moment(identifier, phase, purpose, body, teaches, refs, quote, transition):
        if phase == 'CONNECT':
            moment_type = 'CONNECT'
        elif recommended in {'WORKED_EXAMPLE', 'FORMULA', 'DATA_TABLE', 'CODE_TRACE'}:
            moment_type = 'DEMONSTRATE'
        elif recommended in {'ARCHITECTURE', 'TIMELINE', 'CAUSE_EFFECT', 'PROCESS_FLOW'}:
            moment_type = 'VISUALIZE'
        elif recommended == 'EVIDENCE_HIGHLIGHT':
            moment_type = 'SHOW'
        else:
            moment_type = 'EXPLAIN'
        return {
            'id': identifier, 'type': moment_type,
            'representation': 'GROUNDED_EXPLANATION', 'interaction': 'NONE',
            'purpose': purpose, 'arc_phase': phase, 'understanding_change': purpose,
            'transition': transition, 'attention_cue': f'Focus on {title.lower()}.',
            'next_actions': ['ADVANCE', 'REVEAL_MORE'], 'dialogue': body,
            'mascot_position': 'beside', 'level': 2, 'teaches': teaches, 'tests': [],
            'source_refs': refs, 'source_quote': quote,
            'content': {'title': title, 'body': body, 'takeaway': target_quote},
        }

    moments = []
    if context_quote != target_quote:
        moments.append(moment('context', arc[0], 'Frame the source problem.', context_quote,
                              [f'page:{context_ref}'], [context_ref], context_quote,
                              'Use that context to isolate the central idea.'))
    moments.append(moment('idea', arc[1], 'Explain the source-supported idea.', target_quote,
                          [target['id']], target_refs, target_quote,
                          'Connect the definition to another statement in the material.'))
    if related:
        related_ref, related_quote = related
        moments.append(moment('connection', arc[2], 'Connect the idea to its source context.', related_quote,
                              [f'page:{related_ref}'], [related_ref], related_quote,
                              'Now explain the central idea without copying it.'))

    definition = re.match(r'^(.{2,100}?)\s+(?:means|refers to|is defined as)\s+(.+)$', target_quote, re.I)
    if definition:
        tested_name, expected = definition.group(1).strip(), definition.group(2).strip()
        prompt = f'According to this material, what does {tested_name} mean?'
    else:
        tested_name, expected = learner_facing_title(target_quote), target_quote
        prompt = f'Explain this source-supported idea in your own words: {tested_name}'
    check_interaction = select_interaction(subject, objective.get('text', ''), recommended)
    check_content = {'title': f'Explain {tested_name}', 'prompt': prompt, 'expected_answer': expected,
                     'evidence_concepts': [target['id']],
                     'correct_feedback': f'Your answer explains what {tested_name} means in this material.',
                     'incorrect_feedback': f'You may have named {tested_name}, but the answer still needs the relationship or meaning stated in the material.',
                     'hints': [f'Look for the sentence that defines or explains {tested_name}.']}
    if check_interaction == 'ORDERING':
        ordered = next((item.get('steps') for item in knowledge.get('processes', []) + knowledge.get('sequences', [])
                        if isinstance(item.get('steps'), list) and len(item['steps']) >= 3), None)
        if ordered:
            check_content.update(items=ordered[:7], correct_order=list(range(min(7, len(ordered)))))
        else:
            check_interaction = 'SHORT_ANSWER'
    elif check_interaction == 'MATCHING':
        edges = [(item.get('source'), item.get('target')) for item in knowledge.get('relationships', [])
                 if item.get('source') and item.get('target')]
        if len(edges) >= 2:
            check_content['pairs'] = [list(edge) for edge in edges[:8]]
        else:
            check_interaction = 'SHORT_ANSWER'
    elif check_interaction == 'EVIDENCE_HIGHLIGHT':
        evidence = [item.get('text') for item in knowledge.get('quotations', []) if item.get('text')]
        if len(evidence) >= 2:
            check_content.update(evidence=evidence[:5], correct_evidence=list(range(min(2, len(evidence)))))
        else:
            check_interaction = 'SHORT_ANSWER'
    moments.append({
        'id': 'check', 'type': 'CHECK', 'representation': 'GROUNDED_EXPLANATION',
        'interaction': check_interaction, 'purpose': 'Check whether the learner can use the named idea.',
        'arc_phase': arc[3], 'understanding_change': 'Demonstrate use of the central idea.',
        'transition': 'Use the response to advance or reteach.', 'attention_cue': f'Explain {tested_name}, not just its name.',
        'next_actions': ['ADVANCE', 'RETEACH', 'CHANGE_REPRESENTATION'], 'dialogue': prompt,
        'mascot_position': 'beside', 'level': 2, 'teaches': [], 'tests': [target['id']],
        'source_refs': target_refs, 'source_quote': target_quote,
        'content': check_content,
    })
    raw = {
        'version': 3, 'objective_id': str(objective.get('id') or 'objective-1'),
        'learning_goal': _text(objective.get('text') or concept.title, 360, required=True),
        'key_insight': target_quote, 'prerequisite_assumptions': [], 'likely_misconceptions': [],
        'teaching_strategy': f'Follow the source semantics with {recommended.lower().replace("_", " ")} and collect matching evidence.',
        'recommended_representation': recommended, 'subject_family': subject,
        'difficulty': concept.difficulty, 'evidence_strategy': 'Require a specific explanation of the taught source idea.',
        'advancement_rule': {'minimum_level': 2},
        'remediation_strategies': [f'Return to the defining sentence for {tested_name} and distinguish naming it from explaining it.'],
        'teaching_moments': moments, 'source_grounding': grounding,
    }
    from .tutor_contract import validate_tutor_plan
    result = validate_tutor_plan(raw, objective, grounding, prerequisites)
    result['origin'] = 'fallback'
    result['fallback_reason'] = 'Provider unavailable; used deterministic grounded teaching arc'
    return result


def _extract_json(value):
    text = str(value or '').strip()
    fenced = re.search(r'```(?:json)?\s*(\{.*\})\s*```', text, re.S | re.I)
    if fenced: text = fenced.group(1)
    if not text.startswith('{'):
        start, end = text.find('{'), text.rfind('}')
        if start >= 0 and end > start: text = text[start:end + 1]
    return json.loads(text)


def generate_teaching_plan(concept, objective, grounding, allow_ai=None, prerequisites=None):
    """Generate once, validate strictly, then use a non-fragmenting fallback."""
    fallback = grounded_fallback_plan(concept, objective, grounding, prerequisites)
    enabled = getattr(settings, 'JOURNEY_TEACHING_AI_ENABLED', False) if allow_ai is None else allow_ai
    if not enabled:
        logger.info('[Journey TeachingPlan] attempted=false accepted=false fallback=true objective=%s reason=kill-switch', objective.get('id'))
        return fallback
    if grounding.get('pages'):
        try:
            from .tutor_engine import generate
            plan = generate(concept, objective, grounding, prerequisites)
            plan['origin'] = 'ai'
            return plan
        except Exception as exc:
            logger.warning('[Tutor plan] fallback=true error=%s', type(exc).__name__)
            return fallback
    prompt = {
        'objective_id': objective.get('id'), 'objective': objective.get('text'), 'concept': concept.title,
        'goal': concept.path.goal, 'difficulty': concept.difficulty, 'source_grounding': grounding,
        'allowed_representations': sorted(REPRESENTATIONS), 'allowed_moment_types': sorted(MOMENT_TYPES),
        'allowed_interactions': sorted(INTERACTIONS), 'schema_example': fallback,
        'requirements': 'Teach before checking. Checks evidence_concepts must occur in earlier teaching content. No filler. Use only source-supported semantic payloads.',
    }
    messages = [{'role': 'system', 'content': 'Return one JSON TeachingPlan only. Never output HTML, JSX, SVG, URLs, or animation code. Use only grounded facts and concise learner-facing content.'},
                {'role': 'user', 'content': json.dumps(prompt, default=str)}]
    try:
        from ai_assistant.services import AIService
        raw = AIService().chat_sync(messages, task='TEACHING_GENERATION', max_tokens=1800)
        plan = validate_teaching_plan(_extract_json(raw), str(objective.get('id')))
        from .material_grounding import bundle_from_excerpt, semantic_content
        semantic = bundle_from_excerpt(grounding)
        for moment in plan['teaching_moments']:
            _, _, reason = semantic_content(semantic, moment['representation'])
            if reason:
                raise TeachingPlanValidationError(reason)
            if moment['representation'] == 'WORKED_EXAMPLE':
                available = ' '.join(item['text'] for item in semantic.get('knowledge', {}).get('worked_examples', []) if item.get('support') == 'source')
                normalized = re.sub(r'\s+', ' ', available).casefold()
                if any(re.sub(r'\s+', ' ', step).casefold() not in normalized for step in moment['content']['steps']):
                    raise TeachingPlanValidationError('Worked example contains unsupported transformations')
        plan['source_grounding'] = fallback['source_grounding']
        plan['origin'] = 'ai'
        logger.info('[Journey TeachingPlan] attempted=true accepted=true fallback=false objective=%s representation=%s moments=%s', objective.get('id'), plan['recommended_representation'], len(plan['teaching_moments']))
        return plan
    except Exception as exc:
        logger.warning('[Journey TeachingPlan] attempted=true accepted=false fallback=true objective=%s reason=%s', objective.get('id'), exc)
        return fallback


def teaching_plan_fingerprint(concept, objective, grounding):
    payload = json.dumps({'concept': str(concept.id), 'objective': objective, 'grounding': grounding, 'version': 3}, sort_keys=True, default=str)
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
            if cached.get('plan', {}).get('version') == 3:
                from .tutor_contract import validate_tutor_plan
                plan = validate_tutor_plan(cached['plan'], objective, grounding, cached['plan'].get('prerequisite_state'))
            else:
                plan = validate_teaching_plan(cached.get('plan'), objective_id)
            logger.info('[Journey TeachingPlan] cache=true objective=%s origin=%s representation=%s', objective_id, plan.get('origin'), plan.get('recommended_representation'))
            return plan
        except TeachingPlanValidationError: pass
    from .tutor_contract import prerequisite_state
    plan = generate_teaching_plan(session.concept, objective, grounding, allow_ai=allow_ai, prerequisites=prerequisite_state(session, grounding))
    plans[objective_id] = {'fingerprint': fingerprint, 'plan': plan, 'grounding_input': grounding, 'objective_input': objective}
    session.state = {**session.state, 'teaching_plans': plans}
    session.save(update_fields=['state', 'last_active_at'])
    return plan


def teaching_activity_from_plan(concept, objective, plan, activity_id, moment=None):
    moment = moment or next((item for item in plan['teaching_moments'] if item['type'] in {'EXPLAIN','VISUALIZE','DEMONSTRATE','EXAMPLE','REMEDIATE'}), plan['teaching_moments'][0])
    mapping = {'CONCEPT_MAP':'diagram','RELATIONSHIP_MAP':'relationship','COMPARISON':'comparison','PROCESS_FLOW':'process','CYCLE':'diagram','TIMELINE':'sequence','HIERARCHY':'diagram','CAUSE_EFFECT':'cause_effect','FORMULA':'formula','WORKED_EXAMPLE':'worked_example','EVIDENCE_HIGHLIGHT':'evidence_highlight','ARCHITECTURE':'architecture','SIMPLE_GRAPH':'simple_graph','LABELED_DIAGRAM':'labeled_diagram','GROUNDED_EXPLANATION':'concept','DATA_TABLE':'data_table','CODE_TRACE':'code_trace'}
    content = dict(moment['content'])
    if content.get('nodes'): content['nodes'] = [{'id': f'n{index}', 'label': label} for index, label in enumerate(content['nodes'])]
    if content.get('edges'): content['edges'] = [{'from': edge[0], 'to': edge[1], 'label': edge[2]} for edge in content['edges']]
    representation = moment.get('representation') or plan['recommended_representation']
    display_title = learner_facing_title(content.get('title') or plan['learning_goal'], representation)
    activity = {'id': activity_id, 'concept_id': str(concept.id), 'objective_id': objective['id'], 'objective_index': objective.get('index', 0),
            'purpose': 'remediate' if moment['type'] == 'REMEDIATE' else 'learn', 'stage': 'learn', 'type': mapping[representation],
            'prompt': display_title, 'title': display_title,
            'content': {**content, 'title': display_title, 'knowledge_type': representation, 'subject_family': plan['subject_family'],
                        'progressive': content.get('progressive', True)},
            'difficulty': plan['difficulty'], 'estimated_seconds': 75, 'grounding': plan['source_grounding'],
            'goal_relevance': concept.path.goal or '', 'presentation_reason': plan['teaching_strategy']}
    if plan.get('version') == 3:
        activity.update({'dialogue': moment.get('dialogue', ''), 'mascot_position': moment.get('mascot_position', 'beside'),
                         'tutor': {'level': moment['level'], 'minimum_level': plan['advancement_rule']['minimum_level'],
                                   'moment_id': moment['id'], 'tests': moment['tests'], 'teaches': moment['teaches']}})
        if moment['interaction'] != 'NONE':
            activity.update({'type': moment['interaction'].lower(), 'purpose': 'check', 'stage': 'check',
                             'prompt': content['prompt'], 'requires_teaching': True,
                             'rubric': {'source_quote': moment['source_quote'], 'expected': content['expected_answer']}})
            if moment['interaction'] == 'MCQ': activity['options'] = content['options']
            if moment['interaction'] == 'MATCHING':
                # Do not serialize the answer as aligned left/right pairs. The client
                # can render both columns while only the server knows the mapping.
                original_pairs = content['pairs']
                shift = (int(hashlib.sha256(activity_id.encode()).hexdigest()[:4], 16) % (len(original_pairs) - 1)) + 1
                rights = [pair[1] for pair in original_pairs]
                rights = rights[shift:] + rights[:shift]
                content['pairs'] = [{'left': pair[0], 'right': rights[index]} for index, pair in enumerate(original_pairs)]
                content['correct_matching'] = {str(index): rights.index(pair[1]) for index, pair in enumerate(original_pairs)}
            activity['content'] = {**activity['content'], **content}
    return activity



def teaching_activities_from_plan(concept, objective, plan, activity_id_factory):
    """Preserve the validated moment sequence instead of collapsing it to one block."""
    moments = plan['teaching_moments'] if plan.get('version') == 3 else [item for item in plan['teaching_moments'] if item['type'] in {'EXPLAIN','VISUALIZE','DEMONSTRATE','EXAMPLE','REMEDIATE'}]
    moments = moments or [plan['teaching_moments'][0]]
    activities = []
    for index, moment in enumerate(moments):
        activities.append(teaching_activity_from_plan(
            concept, objective, plan, activity_id_factory(f'{objective["id"]}:{moment["id"]}:{index}'), moment=moment,
        ))
    logger.info('[Journey TeachingPlan] objective=%s origin=%s requested=%s moments=%s', objective['id'], plan.get('origin'), plan.get('recommended_representation'), len(activities))
    return activities
