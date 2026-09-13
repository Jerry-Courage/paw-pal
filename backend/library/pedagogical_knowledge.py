"""Conservative, auditable selection of learner knowledge from source discourse.

Source classification is not permission to teach. This independent revision is
rebuilt for cached schema-v2 documents without changing their source provenance.
Scores are deterministic heuristics, not calibrated probabilities.
"""
import hashlib
import re

REVISION = 3
NON_PRIMARY = {'EDITORIAL_COMMENTARY', 'SOURCE_NAVIGATION', 'SCOPE_STATEMENT',
    'HISTORICAL_ASIDE', 'RESEARCH_CONTEXT', 'TRANSITION', 'ATTRIBUTION',
    'CITATION_CONTEXT', 'FURTHER_READING', 'FIGURE_REFERENCE', 'CAPTION_ONLY',
    'INTRODUCTORY_FLUFF', 'UNKNOWN'}
STOP = set('this that these those there their which where about from into with through between means defined refers using when then than also have has are the and for its was were only'.split())
INCOMPLETE_LABEL_START = re.compile(
    r'^(?:when|because|although|whereas|while|if|unless|since|after|before|the two|together|later|therefore|however)\b', re.I)
INCOMPLETE_LABEL_END = re.compile(r'\b(?:the|a|an|and|or|because|when|with|to|from|of|for|in|on|by)\s*$', re.I)


def terms(text):
    return set(re.findall(r'\b[a-z]{3,}\b', text.casefold())) - STOP


def complete_proposition(text):
    """Reject dangling prose; literal mathematical/code payloads retain their syntax."""
    value = text.strip().rstrip('.!?;:').strip()
    if not value or re.search(r'[,\-–]$', value):
        return False
    if re.search(r'\b(?:and|or|but|nor|because|although|whereas|if|when|while|which|that|with|without|through|to|from|of|for|in|on|at|by|into|between|the|a|an|also)\s*$', value, re.I):
        return False
    if re.match(r'^(?:define|explain|describe|compare|identify|apply|calculate|select|order|predict)\b', value, re.I):
        return len(value.split()) >= 2
    return len(value.split()) >= 3 or bool(re.search(r'[=→]|->', value))


def concept_label_valid(label):
    """A display label must name an idea rather than expose a clause fragment."""
    value = re.sub(r'\s+', ' ', str(label or '')).strip(' .:;,-')
    if not value or len(value) > 180 or len(value.split()) > 18:
        return False
    if INCOMPLETE_LABEL_START.match(value) or INCOMPLETE_LABEL_END.search(value):
        return False
    return bool(terms(value) or re.search(r'[=→]|->', value))


def concept_label(text, semantic_type='', fallback=''):
    """Extract a grounded semantic subject without depending on sentence position."""
    value = re.sub(r'\s+', ' ', str(text or '')).strip(' .')
    role = str(semantic_type or '').upper()
    if role == 'WORKED_EXAMPLE':
        problem = re.search(r'(?i)(?:^|\s)Problem:\s*(.+?)(?=\s+(?:Known|Operation|Steps|Result):|$)', value)
        if problem:
            candidate = problem.group(1).strip(' .')
            action = re.match(r'^(estimate|calculate|solve|determine|find)\s+(?:the\s+)?(.+)$', candidate, re.I)
            if action:
                noun = {'estimate': 'estimate', 'calculate': 'calculation', 'solve': 'solution',
                        'determine': 'determination', 'find': 'finding'}[action.group(1).casefold()]
                subject, qualifier = action.group(2), ''
                split = re.match(r'^(.+?)(\s+(?:at|in|for|from|with)\s+.+)$', subject, re.I)
                if split:
                    subject, qualifier = split.group(1), split.group(2)
                candidate = f'{subject} {noun}{qualifier}'
            if concept_label_valid(candidate):
                return candidate
    arrow_parts = [part.strip(' .') for part in re.split(r'\s*(?:→|->)\s*', value) if part.strip(' .')]
    if len(arrow_parts) >= 2:
        candidate = f'{arrow_parts[0]} to {arrow_parts[-1]} flow'
        if concept_label_valid(candidate):
            return candidate
    working = value
    subordinate = re.match(r'^(?:when|because|although|whereas|while|if|unless|since|after|before)\b[^,]*,\s*(.+)$', working, re.I)
    if subordinate:
        working = subordinate.group(1)
    working = re.sub(r'^(?:together|later|therefore|however|then|next)\s+', '', working, flags=re.I)
    definition = re.match(r'^(.{1,140}?)\s+(?:means|refers to|is defined as)\b', working, re.I)
    if definition and concept_label_valid(definition.group(1)):
        return definition.group(1).strip(' .')
    claim = re.match(r'^(.{1,80}?)\s+(?:claims?|argues?|suggests?)\s+that\s+(.+)$', working, re.I)
    if claim:
        candidate = f"{claim.group(1).strip()}'s claim"
        if concept_label_valid(candidate):
            return candidate
    evidence = re.match(r'^(.{1,100}?)\s+(?:provides?|gives?)\s+evidence\b', working, re.I)
    if evidence:
        candidate = f'Evidence provided by {evidence.group(1).strip()}'
        if concept_label_valid(candidate):
            return candidate
    subject = re.split(
        r'\s+\b(?:is|are|was|were|has|have|can|will|becomes?|contains?|connects?|hides?|follows?|uses?|'
        r'requires?|produces?|transfers?|releases?|increases?|reduces?|causes?|caused|led|creates?|accepts?|'
        r'supports?|allows?|validates?|stores?|collects?|sends?|applies?|claims?|contradicts?|contrasts?|divides?|formed|'
        r'imposed|established|disputed)\b\s+', working, maxsplit=1, flags=re.I)[0].strip(' .')
    fallback = re.sub(r'\s+', ' ', str(fallback or '')).strip(' .')
    if subject == working.strip(' .') and complete_proposition(working) and concept_label_valid(fallback) and terms(fallback) & terms(value):
        return fallback
    if concept_label_valid(subject):
        return subject[0].upper() + subject[1:]
    if concept_label_valid(fallback):
        return fallback
    return value[:180].rstrip(' ,;:-')


def proposition_candidates(model, hints):
    """Join only adjacent prose continuations, preserving every contributing reference."""
    pending = None
    for page in model.get('pages', []):
        for block in page.get('blocks', []) or [{'text': page.get('text', ''), 'category': 'INSTRUCTIONAL_CONTENT'}]:
            category = block.get('category', '')
            for text in re.split(r'(?<=[.!?])\s+(?=[A-Z"“])|\n+', block.get('text', '')):
                text = text.strip()
                if not text: continue
                ref = {'page_id': page['id'], 'number': page.get('number'), 'block_id': block.get('id')}
                current = (page, {**block, 'source_refs': [ref]}, text, hints.get(text, ''))
                if pending:
                    old_page, old_block, old_text, hint = pending
                    # Lowercase continuation plus adjacent instructional blocks is evidence
                    # of a layout split. Never join across a heading, caption or metadata.
                    if category == old_block.get('category') == 'INSTRUCTIONAL_CONTENT' and re.match(r'^[a-z]', text) and len(old_text + text) < 900:
                        current = (old_page, {**old_block, 'source_refs': old_block['source_refs'] + [ref]}, old_text + ' ' + text, hint)
                    else:
                        yield pending
                    pending = None
                if category == 'INSTRUCTIONAL_CONTENT' and not re.search(r'[.!?]$', current[2]):
                    pending = current
                else:
                    yield current
    if pending: yield pending


def classify_proposition(text, semantic_type='', category=''):
    value = re.sub(r'\s+', ' ', text).strip()
    lower = value.casefold()
    if not complete_proposition(value):
        return 'UNKNOWN'
    # Discourse acts: who/what is the subject, and what is being asserted?
    # A domain claim about research itself is not rejected merely for mentioning it.
    if category == 'CAPTION' or re.match(r'^(?:figure|fig\.|table)\s*\d+\s*[.:-]', lower):
        return 'CAPTION_ONLY'
    if re.match(r'^(?:see|refer to|consult)\b', lower):
        return 'SOURCE_NAVIGATION'
    if re.match(r'^(?:(?:this|the|our)\s+)?(?:chapter|section|article|book|paper|material|text|volume|topic)\s+(?:(?:will|briefly|aims? to)\s+)*(?:introduce[sd]?|describe[sd]?|cover[sd]?|discuss(?:es)?|present[sd]?|examine[sd]?|survey[sd]?|review[sd]?|outline[sd]?|summarize[sd]?)\b', lower):
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
    if semantic_type in {'CODE', 'DATA_TABLE', 'ARCHITECTURE', 'TIMELINE_EVENT'}: return semantic_type
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
    priority = {'WORKED_EXAMPLE': 10, 'ARCHITECTURE': 9, 'DATA_TABLE': 9, 'CODE': 9,
                'TIMELINE_EVENT': 8, 'CAUSE_EFFECT': 8, 'COMPARISON': 8, 'PROCESS': 7,
                'FORMULA': 7, 'CLAIM': 6, 'EVIDENCE': 6, 'DEFINITION': 5}
    hints = {}
    for item in existing.get('semantic_units', []):
        text, semantic_type = item.get('text'), item.get('semantic_type', '')
        if text and priority.get(semantic_type, 0) >= priority.get(hints.get(text, ''), 0):
            hints[text] = semantic_type
    records, seen = [], set()
    candidates = list(proposition_candidates(model, hints))
    for page in model.get('pages', []):
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
        refs = block.get('source_refs') or [{'page_id': page['id'], 'number': page.get('number'), 'block_id': block.get('id')}]
        identifier = 'knowledge-' + hashlib.sha256((normalized + '|' + page['id']).encode()).hexdigest()[:16]
        concept = concept_label(text, role, model.get('title', ''))
        records.append({'id': identifier, 'text': text, 'proposition': text, 'concept': concept,
            'semantic_type': role, 'source_refs': refs, 'support': 'source', 'confidence': 'extractive',
            'related_knowledge_ids': [], 'prerequisite_ids': [], 'examples': [],
            'representations': ['GROUNDED_EXPLANATION'],
            'assessment_possibilities': [capability_for(role)] if primary else [],
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
        related_ids = {edge['target_id'] if edge['source_id'] == item['id'] else edge['source_id'] for edge in edges if item['id'] in {edge['source_id'], edge['target_id']}}
        # Lexical similarity is retrieval metadata only. It never authorizes a
        # learner-facing relationship or CONNECT moment.
        related_ids.update(other['id'] for other in accepted if other['id'] != item['id'] and len(terms(item['text']) & terms(other['text'])) >= 2)
        related = [other for other in accepted if other['id'] in related_ids]
        item['related_knowledge_ids'] = [other['id'] for other in related]
        item['examples'] = [other['id'] for other in related if other['semantic_type'] in {'EXAMPLE', 'WORKED_EXAMPLE'}]
        item['representations'] += {'DEFINITION': [], 'PROCESS': ['PROCESS_FLOW'], 'ARCHITECTURE': ['ARCHITECTURE'],
            'COMPARISON': ['COMPARISON'],
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
    model['learner_concepts'] = learner_concepts(model)
    if not accepted and 'quality' in model:
        model['quality'].update(status='uncertain', confidence=0.)
        model['quality']['warnings'] = list(dict.fromkeys([*model['quality'].get('warnings', []), 'no_pedagogical_knowledge']))
    return model


def objective_valid(objective, grounding):
    objects = {item['id']: item for item in grounding.get('knowledge', {}).get('knowledge_objects', [])}
    ids = objective.get('knowledge_ids') or []
    if not ids or not set(ids) <= objects.keys(): return False
    text = objective.get('text', '')
    if not complete_proposition(text) or len(text) > 360: return False
    if classify_proposition(text) in NON_PRIMARY - {'UNKNOWN'}: return False
    if any(not complete_proposition(objects[key]['text']) for key in ids): return False
    if re.search(r'\b(?:this source statement|the material says|meaning and significance)\b', text, re.I): return False
    label = objective.get('concept_label')
    if label is not None and not concept_label_valid(label): return False
    exposed = re.match(r'^(?:define|explain the mechanism involving|compare|trace|apply|work through|interpret|identify evidence supporting|order the stages in|predict the outcome of)\s+(.+?)\.?$', text, re.I)
    if exposed and not concept_label_valid(exposed.group(1)): return False
    return bool(terms(text) & set().union(*(terms(objects[key]['text']) for key in ids)))


def objectives_from_knowledge(grounding):
    objects = grounding.get('knowledge', {}).get('knowledge_objects', [])
    lookup = {item['id']: item for item in objects}
    edges = grounding.get('pedagogical_relationships', [])
    result, used = [], set()
    for item in objects:
        if item['id'] in used: continue
        supported_ids = [edge['target_id'] if edge['source_id'] == item['id'] else edge['source_id']
                         for edge in edges if item['id'] in {edge.get('source_id'), edge.get('target_id')}]
        related = [lookup[key] for key in supported_ids if key in lookup and key not in used][:2]
        group = [item, *related]
        ids = [part['id'] for part in group]
        used.update(ids)
        capability = capability_for(item['semantic_type'])
        text = objective_text(item)
        result.append({'id': 'material-' + item['id'], 'text': text, 'knowledge_ids': ids,
                       'capability': capability, 'concept_label': item['concept'],
                       'semantic_type': item['semantic_type'],
                       'source_statement': item['text'], 'source_refs': [ref for part in group for ref in part['source_refs']]})
        if len(result) == 4: break
    return result


def capability_for(role):
    return {'DEFINITION': 'DEFINE', 'COMPARISON': 'COMPARE', 'PROCESS': 'ORDER',
            'PROCEDURE': 'ORDER', 'FORMULA': 'CALCULATE', 'WORKED_EXAMPLE': 'CALCULATE',
            'CLAIM': 'IDENTIFY_EVIDENCE', 'EVIDENCE': 'IDENTIFY_EVIDENCE',
            'CAUSE_EFFECT': 'EXPLAIN_MECHANISM', 'MECHANISM': 'EXPLAIN_MECHANISM',
            'ARCHITECTURE': 'TRACE', 'CODE': 'TRACE', 'TIMELINE_EVENT': 'ORDER',
            'CONSTRAINT': 'APPLY', 'APPLICATION': 'APPLY'}.get(role, 'INTERPRET')


def objective_text(item):
    subject = concept_label(item['text'], item['semantic_type'], item.get('concept', '')).strip(' .')
    capability = capability_for(item['semantic_type'])
    action = {'DEFINE': 'Define', 'EXPLAIN_MECHANISM': 'Explain the mechanism involving', 'COMPARE': 'Compare',
              'TRACE': 'Trace', 'APPLY': 'Apply', 'CALCULATE': 'Work through',
              'INTERPRET': 'Interpret', 'IDENTIFY_EVIDENCE': 'Identify evidence supporting',
              'ORDER': 'Order the stages in', 'PREDICT': 'Predict the outcome of'}[capability]
    return f'{action} {subject}.'


def learner_concepts(model):
    groups = {}
    for item in model.get('knowledge', {}).get('knowledge_objects', []):
        if not item.get('accepted') or not complete_proposition(item['text']): continue
        title = concept_label(item['text'], item.get('semantic_type', ''), item.get('concept', '')).strip(' .')
        if not concept_label_valid(title): continue
        key = title.casefold()
        entry = groups.setdefault(key, {'id': item['id'], 'title': title, 'knowledge_ids': [], 'source_refs': [], 'summary': ''})
        entry['knowledge_ids'].append(item['id'])
        entry['source_refs'].extend(item['source_refs'])
        entry['summary'] = (entry['summary'] + ' ' + item['text']).strip()
    return list(groups.values())


def understanding_revision(model):
    return f"{model.get('version', 0)}:{model.get('pedagogy_revision', 0)}:{model.get('fingerprint', '')}"


def learner_preview(model):
    concepts = learner_concepts(model) if model.get('pedagogy_revision') == REVISION else []
    knowledge_objects = [item for item in model.get('knowledge', {}).get('knowledge_objects', [])
                         if item.get('accepted')]
    return {'concept_count': len(concepts), 'concepts': [{'id': item['id'], 'title': item['title']} for item in concepts],
            'knowledge_object_count': len(knowledge_objects), 'learner_topic_count': len(concepts),
            'count_source': 'validated_knowledge_objects', 'understanding_revision': understanding_revision(model),
            'pedagogy_revision': model.get('pedagogy_revision'), 'current': model.get('pedagogy_revision') == REVISION}
