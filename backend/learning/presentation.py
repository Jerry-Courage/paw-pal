"""Deterministic Journey presentation decisions and grounded teaching objects."""
import re


PRESENTATION_TYPES = {
    'concept', 'key_idea', 'process', 'sequence', 'comparison', 'example',
    'worked_example', 'formula', 'cause_effect', 'callout', 'diagram',
}


def classify_presentation(text):
    value = str(text or '').lower()
    if re.search(r'\b(compare|contrast|versus|vs\.?|difference|distinguish)\b', value): return 'COMPARISON'
    if re.search(r'\b(formula|equation|theorem|x[_ₙn]|f\s*\(|=)\b', value): return 'FORMULA'
    if re.search(r'\b(calculate|compute|solve|approximate|derive|evaluate)\b', value): return 'CALCULATION'
    if re.search(r'\b(cause|effect|because|therefore|results? in|leads? to|why)\b', value): return 'CAUSE_EFFECT'
    if re.search(r'\b(sequence|stages?|steps?|first|next|then|finally|travels?|moves?|from .+ to)\b', value): return 'SEQUENCE'
    if re.search(r'\b(process|procedure|algorithm|method|how)\b', value): return 'PROCESS'
    if re.search(r'\b(part|structure|system|organ|anatom|located|entry point)\b', value): return 'STRUCTURE'
    if re.search(r'\b(apply|use|scenario|situation|example)\b', value): return 'APPLICATION'
    if re.search(r'\b(is|means|defined|refers to|describes)\b', value): return 'DEFINITION'
    return 'CONCEPT'


def _sentences(value):
    return [part.strip(' .') for part in re.split(r'(?<=[.!?])\s+|\s*(?:→|->)\s*', str(value or '')) if part.strip()]


def decide_teaching_representation(objective, source_context, pedagogical_phase='TEACH', learner_state=None, recent_representations=None):
    text = str(objective.get('text') or '').strip()
    combined = ' '.join(filter(None, [text, str(source_context.get('excerpt') or '')]))
    knowledge = classify_presentation(combined)
    mapping = {
        'COMPARISON': 'comparison', 'FORMULA': 'formula', 'CALCULATION': 'worked_example',
        'CAUSE_EFFECT': 'cause_effect', 'SEQUENCE': 'sequence', 'PROCESS': 'process',
        'STRUCTURE': 'diagram', 'APPLICATION': 'example', 'DEFINITION': 'concept', 'CONCEPT': 'key_idea',
    }
    primary = mapping[knowledge]
    recent = list(recent_representations or [])[-3:]
    if primary in recent:
        alternatives = {'concept': 'example', 'key_idea': 'example', 'process': 'sequence', 'sequence': 'diagram',
                        'diagram': 'concept', 'cause_effect': 'process', 'formula': 'worked_example',
                        'worked_example': 'formula', 'comparison': 'example', 'example': 'concept'}
        primary = alternatives.get(primary, primary)
    return {'primary': primary, 'supporting': [], 'knowledge_type': knowledge,
            'reason': f'{knowledge.lower()} objectives are clearest as {primary.replace("_", " ")}.'}


def build_teaching_object(concept, objective, source_context, object_id, recent_representations=None):
    decision = decide_teaching_representation(objective, source_context, recent_representations=recent_representations)
    kind = decision['primary']
    fact = str(objective.get('text') or concept.title).strip().rstrip('.')
    excerpt = str(source_context.get('excerpt') or '').strip()
    material = excerpt or fact
    sentences = _sentences(material)[:5] or [fact]
    content = {'knowledge_type': decision['knowledge_type'], 'takeaway': fact}
    title = fact if len(fact) <= 72 else concept.title

    if kind in {'process', 'sequence', 'cause_effect', 'diagram'}:
        steps = sentences if len(sentences) >= 2 else [fact, f'Connect this step to what happens next in {concept.title}.']
        content.update({'steps': steps[:5], 'nodes': [{'id': f'n{i}', 'label': step} for i, step in enumerate(steps[:5])],
                        'edges': [{'from': f'n{i}', 'to': f'n{i+1}'} for i in range(len(steps[:5]) - 1)]})
    elif kind == 'comparison':
        parts = re.split(r'\s+(?:vs\.?|versus|compared with|and)\s+', fact, maxsplit=1, flags=re.I)
        left, right = (parts + ['The contrasting idea'])[:2]
        content.update({'columns': [left, right], 'rows': [[left, right], [sentences[0], sentences[1] if len(sentences) > 1 else fact]]})
    elif kind == 'formula':
        formula = next((part for part in sentences if '=' in part), fact)
        content.update({'formula': formula, 'parts': [{'symbol': token, 'meaning': 'A quantity used in this relationship'} for token in re.findall(r'[A-Za-z][A-Za-z0-9_]*(?:\([^)]*\))?', formula)[:4]]})
    elif kind == 'worked_example':
        content.update({'steps': [{'label': f'Step {i + 1}', 'body': sentence} for i, sentence in enumerate(sentences[:4])], 'progressive': True})
    elif kind == 'example':
        content.update({'example': material[:620], 'lead': f'Here is {concept.title} in a concrete situation.'})
    else:
        content.update({'body': fact, 'key_idea': sentences[0] if sentences else fact})

    return {
        'id': object_id, 'concept_id': str(concept.id), 'objective_id': objective.get('id', ''),
        'objective_index': objective.get('index', 0), 'purpose': 'learn', 'stage': 'learn',
        'type': kind, 'prompt': title, 'title': title, 'content': content,
        'difficulty': concept.difficulty, 'estimated_seconds': 75,
        'grounding': {key: value for key, value in source_context.items() if value not in ('', None)},
        'goal_relevance': concept.path.goal or '', 'presentation_reason': decision['reason'],
    }


def grounded_distractors(fact, nearby_facts=None):
    """Create domain-neutral alternatives only by transforming grounded claims."""
    fact = str(fact).strip().rstrip('.')
    candidates = [str(value).strip().rstrip('.') for value in (nearby_facts or []) if str(value).strip() and str(value).strip().lower() != fact.lower()]
    transformations = [
        (r'\bfirst\b', 'last'), (r'\bbegins?\b', 'ends'), (r'\bstarts?\b', 'finishes'),
        (r'\bincreases?\b', 'decreases'), (r'\bmore\b', 'less'), (r'\bbefore\b', 'after'),
        (r'\benters?\b', 'leaves'), (r'\buses?\b', 'does not use'), (r'\bis\b', 'is not'),
    ]
    for pattern, replacement in transformations:
        changed, count = re.subn(pattern, replacement, fact, count=1, flags=re.I)
        if count and changed.lower() != fact.lower(): candidates.append(changed)
    candidates.append(f'This stage does not perform the function described here: {fact}')
    return list(dict.fromkeys(candidates))[:2]
