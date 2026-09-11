"""Conservative, auditable selection of learner knowledge from source discourse.

Source classification is not permission to teach. This independent revision is
rebuilt for cached schema-v2 documents without changing their source provenance.
Scores are deterministic heuristics, not calibrated probabilities.
"""
import hashlib
import re

REVISION = 1
NON_PRIMARY = {'EDITORIAL_COMMENTARY', 'SOURCE_NAVIGATION', 'SCOPE_STATEMENT',
    'HISTORICAL_ASIDE', 'RESEARCH_CONTEXT', 'TRANSITION', 'ATTRIBUTION',
    'CITATION_CONTEXT', 'FURTHER_READING', 'FIGURE_REFERENCE', 'CAPTION_ONLY',
    'INTRODUCTORY_FLUFF', 'UNKNOWN'}
STOP = set('this that these those there their which where about from into with through between means defined refers using when then than also have has are the and for its was were only'.split())


def terms(text):
    return set(re.findall(r'\b[a-z]{3,}\b', text.casefold())) - STOP


def classify_proposition(text, semantic_type='', category=''):
    value = re.sub(r'\s+', ' ', text).strip()
    lower = value.casefold()
    # Discourse acts: who/what is the subject, and what is being asserted?
    # A domain claim about research itself is not rejected merely for mentioning it.
    if category == 'CAPTION' or re.match(r'^(?:figure|fig\.|table)\s*\d+\s*[.:-]', lower):
        return 'CAPTION_ONLY'
    if re.match(r'^(?:see|refer to|consult)\b', lower):
        return 'SOURCE_NAVIGATION'
    if re.match(r'^(?:this|the|our)\s+(?:chapter|section|article|book|paper|material|text|volume)\s+(?:introduces|describes|covers|discusses|presents|examines|surveys|reviews|outlines|summarizes)\b', lower):
        return 'SCOPE_STATEMENT'
    if re.match(r'^(?:the reader|readers|you)\s+(?:should|can|may)\s+(?:consult|refer|read|see)\b', lower):
        return 'FURTHER_READING'
    if re.search(r'\b(?:references?|bibliography|citations?)\b.{0,90}\b(?:reading|consult|included|listed|provided)\b', lower):
        return 'FURTHER_READING'
    if re.match(r'^(?:many|several|numerous)\s+(?:scholars|researchers|authors|critics)\s+(?:have\s+)?(?:written|studied|discussed)\b', lower):
        return 'RESEARCH_CONTEXT'
    if re.search(r'\b(?:has|have)\s+(?:been\s+(?:(?:widely|extensively|much)\s+)?studied|received\s+(?:(?:much|considerable|extensive)\s+)?(?:critical|scholarly)\s+attention)\b', lower):
        return 'RESEARCH_CONTEXT'
    if re.match(r'^there\s+(?:is|are)\s+.*\b(?:literature|research|publications)\b', lower):
        return 'RESEARCH_CONTEXT'
    if re.match(r'^(?:many|several|numerous)\s+\w+\s+exist\s+(?:for|in)\b', lower):
        return 'INTRODUCTORY_FLUFF'
    if re.match(r'^(?:in the next|we now turn|let us now|as discussed above)\b', lower):
        return 'TRANSITION'
    if re.match(r'^(?:according to|adapted from|reproduced from|copyright|by)\b', lower) and not re.search(r'\b(?:because|causes|means|requires|shows|argues)\b', lower):
        return 'ATTRIBUTION'
    if category in {'TITLE', 'SECTION_HEADING', 'AUTHOR_METADATA', 'PUBLISHER_METADATA', 'COPYRIGHT', 'REFERENCES', 'BIBLIOGRAPHY', 'TABLE_OF_CONTENTS', 'NAVIGATION'}:
        return 'CITATION_CONTEXT'
    if re.search(r'\b(?:means|refers to|is defined as)\b', lower): return 'DEFINITION'
    if re.search(r'\b(?:because|caus(?:e[sd]?|ing)|results? in|leads? to|led to)\b', lower): return 'CAUSE_EFFECT'
    if re.search(r'\b(?:whereas|unlike|in contrast|compared with)\b', lower): return 'COMPARISON'
    if re.search(r'\b(?:requires?|depends? on|only if|must)\b', lower): return 'CONSTRAINT'
    if semantic_type in {'WORKED_EXAMPLE', 'FORMULA', 'DERIVATION', 'PROCEDURE', 'RULE', 'MISCONCEPTION', 'CLAIM', 'EVIDENCE', 'EXAMPLE', 'PROCESS', 'RELATIONSHIP', 'CAUSE_EFFECT', 'COMPARISON'}:
        return semantic_type
    if re.search(r'\b(?:argues?|claims?|suggests?|reveals?|contradicts?)\b', lower): return 'CLAIM'
    if re.search(r'\b(?:first|next|finally)\b|→|->', value): return 'PROCESS'
    if re.search(r'[=≈∝]', value): return 'FORMULA'
    if re.search(r'\b(?:transports?|transfers?|converts?|produces?|releases?|maintains?|supports?|increases?|reduces?|uses?|refreshes?|exchanges?)\b', lower): return 'MECHANISM'
    if semantic_type in {'CODE', 'DATA_TABLE', 'ARCHITECTURE', 'TIMELINE_EVENT'}: return 'APPLICATION'
    # A finite assertion needs both participants, not simply an arbitrary noun phrase.
    if re.search(r'\S+\s+(?:is|are|was|were|has|have|can|will|becomes?|contains?|connects?|hides?|follows?)\s+\S+', lower): return 'CORE_CONCEPT'
    if re.search(r'\b(?:gives?|provides?|moves?|flows?|returns?|travels?|stores?|validates?|establishes?|divides?|links?|formed|imposed|established|disputed)\b', lower) and len(value.split()) >= 5:
        return 'RELATIONSHIP'
    if semantic_type in {'CONCEPT', 'DEFINITION'} and len(value.split()) >= 6:
        return 'CORE_CONCEPT'
    return 'UNKNOWN'


def attach_pedagogy(model):
    """Create stable proposition records; raw extraction collections remain context."""
    existing = model.get('knowledge', {})
    hints = {item.get('text'): item.get('semantic_type', '') for item in existing.get('semantic_units', [])}
    records, seen = [], set()
    candidates = []
    for page in model.get('pages', []):
        for block in page.get('blocks', []) or [{'text': page.get('text', ''), 'category': 'INSTRUCTIONAL_CONTENT'}]:
            for text in re.split(r'(?<=[.!?])\s+(?=[A-Z"“])|\n+', block.get('text', '')):
                candidates.append((page, block, text, hints.get(text, '')))
        for kind in ('worked_examples', 'processes', 'code_snippets', 'tables', 'quotations'):
            for item in existing.get(kind, []):
                if item.get('support') == 'source' and any(ref['page_id'] == page['id'] for ref in item['source_refs']):
                    candidates.append((page, {'category': 'INSTRUCTIONAL_CONTENT'}, item['text'],
                                       {'worked_examples': 'WORKED_EXAMPLE', 'processes': 'PROCESS', 'code_snippets': 'CODE', 'tables': 'DATA_TABLE', 'quotations': 'EVIDENCE'}[kind]))
    for page, block, text, hint in candidates:
        text = text.strip()
        if not text: continue
        normalized = re.sub(r'\W+', ' ', text.casefold()).strip()
        duplicate = normalized in seen
        seen.add(normalized)
        role = classify_proposition(text, hint, block.get('category', ''))
        primary = role not in NON_PRIMARY
        refs = [{'page_id': page['id'], 'number': page.get('number'), 'block_id': block.get('id')}]
        identifier = 'knowledge-' + hashlib.sha256((normalized + '|' + page['id']).encode()).hexdigest()[:16]
        concept = re.split(r'\s+(?:means|refers to|is defined as|is|are|uses?|requires?|produces?|transports?|releases?|increases?|reduces?|causes?|caused|led to|claims?|contradicts?|divides?|validates?|formed|imposed|established)\s+', text, maxsplit=1, flags=re.I)[0].strip(' .')
        if role == 'WORKED_EXAMPLE':
            problem = re.search(r'(?im)^Problem:\s*(.+)$', text)
            if problem: concept = problem[1].rstrip('.')
        records.append({'id': identifier, 'text': text, 'proposition': text, 'concept': concept,
            'semantic_type': role, 'source_refs': refs, 'support': 'source', 'confidence': 'extractive',
            'related_knowledge_ids': [], 'prerequisite_ids': [], 'examples': [],
            'representations': ['GROUNDED_EXPLANATION'],
            'assessment_possibilities': ['explain_relationship'] if primary else [],
            'scores': {'conceptual_importance': .8 if primary else .0,
                'explanatory_value': .8 if role in {'DEFINITION', 'MECHANISM', 'CAUSE_EFFECT', 'PROCESS'} else .5 if primary else 0,
                'learner_usefulness': .8 if primary else 0, 'source_support': 1.,
                'relationship_density': 0., 'dependency_significance': 0.,
                'applicability': .8 if role in {'FORMULA', 'PROCEDURE', 'WORKED_EXAMPLE', 'APPLICATION', 'CONSTRAINT'} else .4 if primary else 0,
                'assessment_suitability': .8 if primary else 0, 'novelty': 0. if duplicate else 1.,
                'redundancy': 1. if duplicate else 0., 'editorial_likelihood': float(role in NON_PRIMARY),
                'transition_likelihood': float(role == 'TRANSITION'),
                'citation_further_reading_likelihood': float(role in {'CITATION_CONTEXT', 'FURTHER_READING', 'ATTRIBUTION'})},
            'accepted': primary and not duplicate,
            'selection_reason': 'Source-supported explanatory knowledge' if primary and not duplicate else 'Duplicate proposition' if duplicate else f'{role}: context does not establish learner knowledge'})
    accepted = [item for item in records if item['accepted']]
    edges = []
    for relation in existing.get('knowledge_relationships', []):
        if relation.get('support') != 'source': continue
        source, target = relation.get('source', ''), relation.get('target', '')
        left = [item for item in accepted if source and source.casefold() in item['text'].casefold()]
        right = [item for item in accepted if target and target.casefold() in item['text'].casefold()]
        for first in left:
            for second in right:
                if first['id'] != second['id']:
                    edges.append({'source_id': first['id'], 'target_id': second['id'],
                        'relationship_type': relation['relationship_type'], 'source_refs': relation['source_refs']})
                    if relation['relationship_type'] in {'DEPENDS_ON', 'PREREQUISITE_OF'}:
                        dependent, required = (first, second) if relation['relationship_type'] == 'DEPENDS_ON' else (second, first)
                        dependent['prerequisite_ids'].append(required['id'])
    for item in accepted:
        related = [other for other in accepted if other['id'] != item['id'] and len(terms(item['text']) & terms(other['text'])) >= 2]
        item['related_knowledge_ids'] = [other['id'] for other in related]
        item['examples'] = [other['id'] for other in related if other['semantic_type'] in {'EXAMPLE', 'WORKED_EXAMPLE'}]
        item['representations'] += {'DEFINITION': [], 'PROCESS': ['PROCESS_FLOW'], 'COMPARISON': ['COMPARISON'],
            'FORMULA': ['FORMULA'], 'WORKED_EXAMPLE': ['WORKED_EXAMPLE'], 'CAUSE_EFFECT': ['CAUSE_EFFECT'],
            'CLAIM': ['EVIDENCE_HIGHLIGHT']}.get(item['semantic_type'], [])
        item['scores']['relationship_density'] = min(1., len(related)/3)
        item['scores']['dependency_significance'] = min(1., len(item['prerequisite_ids'])/2)
        item['importance'] = round(sum(item['scores'][key] for key in ('conceptual_importance', 'explanatory_value', 'learner_usefulness', 'source_support', 'relationship_density', 'applicability', 'assessment_suitability', 'novelty'))/8, 3)
    model['pedagogy_revision'] = REVISION
    model['propositions'] = records
    model['pedagogical_relationships'] = edges
    model['caption_support'] = [{'caption': item['text'], 'source_refs': item['source_refs'],
        'knowledge_ids': [other['id'] for other in accepted if len(terms(item['text']) & terms(other['text'])) >= 2],
        'visual_status': 'unverified', 'teaches': []} for item in records if item['semantic_type'] == 'CAPTION_ONLY']
    model['knowledge']['knowledge_objects'] = sorted(accepted, key=lambda item: -item['importance'])
    if not accepted and 'quality' in model:
        model['quality'].update(status='uncertain', confidence=0.)
        model['quality']['warnings'] = list(dict.fromkeys([*model['quality'].get('warnings', []), 'no_pedagogical_knowledge']))
    return model


def objective_valid(objective, grounding):
    objects = {item['id']: item for item in grounding.get('knowledge', {}).get('knowledge_objects', [])}
    ids = objective.get('knowledge_ids') or []
    if not ids or not set(ids) <= objects.keys(): return False
    text = objective.get('text', '')
    if re.search(r'\b(?:this source statement|the material says|meaning and significance)\b', text, re.I): return False
    return bool(terms(text) & set().union(*(terms(objects[key]['text']) for key in ids)))


def objectives_from_knowledge(grounding):
    objects = grounding.get('knowledge', {}).get('knowledge_objects', [])
    lookup = {item['id']: item for item in objects}
    result, used = [], set()
    for item in objects:
        if item['id'] in used: continue
        related = [lookup[key] for key in item['related_knowledge_ids'] if key in lookup and key not in used][:2]
        group = [item, *related]
        ids = [part['id'] for part in group]
        used.update(ids)
        concepts = list(dict.fromkeys(part['concept'] for part in group))
        action = 'Compare' if item['semantic_type'] == 'COMPARISON' else 'Explain'
        text = f'{action} {concepts[0]}' + (f' and connect it to {concepts[1]}.' if len(concepts) > 1 else ' and the relationships it describes.')
        result.append({'id': 'material-' + item['id'], 'text': text, 'knowledge_ids': ids,
                       'source_statement': item['text'], 'source_refs': [ref for part in group for ref in part['source_refs']]})
        if len(result) == 4: break
    return result
