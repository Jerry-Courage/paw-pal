"""Objective-scoped source selection and teachability contracts."""
import re
from library.pedagogical_knowledge import REVISION, objectives_from_knowledge
from library.source_understanding import VERSION, build_understanding, grounding_bundle, persist_understanding

FILLER = re.compile(r'^(?:step\s*\d+\s*:\s*)?(?:substitute the known information|apply the (?:concept|idea)|think about the idea|use the information above|consider the following|read the concept|work one transformation at a time|check the result against the goal)[.! ]*$', re.I)


def resource_knowledge(resource):
    knowledge = (resource.source_understanding or {}).get('knowledge', {})
    if (resource.source_understanding and resource.source_understanding.get('version') == VERSION
            and 'semantic_units' in knowledge and 'knowledge_relationships' in knowledge
            and resource.source_understanding.get('pedagogy_revision') == REVISION):
        return resource.source_understanding
    if isinstance(resource.source_understanding, dict) and resource.source_understanding.get('pages'):
        old_text = '\n\n'.join(page.get('text', '') for page in resource.source_understanding['pages'])
        if old_text.strip():
            return persist_understanding(resource, old_text, pages=resource.source_understanding['pages'])
    text = '\n\n'.join(item['extracted_text'] for item in resource.ai_concepts or []
                       if isinstance(item, dict) and isinstance(item.get('extracted_text'), str))
    if text:
        return persist_understanding(resource, text)
    if resource.source_understanding:
        # A structured record that cannot be reconstructed must fail closed.
        return resource.source_understanding
    return {}


def objective_grounding(concept, objective=None):
    resource = concept.source_resource
    base = {'resource_id': concept.source_resource_id, 'resource_title': resource.title if resource else '',
            'section': concept.source_section or '', 'page': concept.source_page, 'excerpt': ''}
    if resource:
        model = resource_knowledge(resource)
        if model:
            from library.pedagogical_knowledge import understanding_revision
            objects = model.get('knowledge', {}).get('knowledge_objects', [])
            binding = getattr(concept, 'knowledge_binding', {}) or {}
            ids = (objective or {}).get('knowledge_ids') or binding.get('knowledge_ids', [])
            selected = [item for item in objects if item['id'] in ids]
            if not selected:
                selected = [item for item in objects if item['concept'].casefold() == concept.title.casefold()] or objects
            page_ids = {ref['page_id'] for item in selected for ref in item['source_refs']}
            pages = [page for page in model.get('pages', []) if page['id'] in page_ids]
            knowledge = {kind: [item for item in items if any(ref['page_id'] in page_ids for ref in item.get('source_refs', []))]
                         for kind, items in model.get('knowledge', {}).items()}
            knowledge['knowledge_objects'] = selected
            return {**base, 'pedagogy_revision': model.get('pedagogy_revision'), 'understanding_revision': understanding_revision(model),
                    'source_fingerprint': model.get('fingerprint'), 'pages': pages, 'knowledge': knowledge,
                    'pedagogical_relationships': model.get('pedagogical_relationships', []),
                    'source_refs': [ref for item in selected for ref in item['source_refs']],
                    'excerpt': '\n\n'.join(item['text'] for item in selected), 'status': 'grounded' if selected else 'insufficient'}
    return base


def semantic_content(grounding, requested):
    knowledge = grounding.get('knowledge') or {}
    content = {'body': grounding.get('excerpt', '')}
    supported = lambda kind: [item for item in knowledge.get(kind, []) if item.get('support') == 'source']
    if requested == 'WORKED_EXAMPLE':
        for example in supported('worked_examples'):
            if all(example.get(key) for key in ('problem', 'known', 'operation', 'steps', 'result')) and len(example['steps']) >= 2:
                steps = [example['problem'], *example['known'], example['operation'], *example['steps'], example['result']]
                if len(steps) > 7 or any(len(step) > 220 for step in steps):
                    continue
                return requested, {'body': example['problem'], 'formula': example['operation'],
                                   'steps': steps}, ''
    elif requested == 'FORMULA':
        if supported('formulas'):
            return 'GROUNDED_EXPLANATION', content, 'Formula retained as source text; mathematical layout is unverified'
    elif requested in {'PROCESS_FLOW', 'TIMELINE', 'CYCLE'}:
        for process in supported('processes') + supported('sequences'):
            steps = process.get('steps', [])
            if isinstance(steps, list) and len(steps) >= 2 and all(isinstance(step, str) and step.strip() and not FILLER.fullmatch(step) for step in steps):
                # A route does not prove a cycle; do not draw an invented return arrow.
                return 'PROCESS_FLOW', {'steps': steps, 'body': ''}, ''
    elif requested in {'ARCHITECTURE', 'RELATIONSHIP_MAP', 'CAUSE_EFFECT'}:
        edges = [[item.get('source'), item.get('target'), item.get('label', '')]
                 for item in supported('relationships') if item.get('source') and item.get('target')]
        if edges:
            nodes = list(dict.fromkeys(node for edge in edges for node in edge[:2]))[:8]
            return requested, {'nodes': nodes, 'edges': edges[:10], 'body': grounding.get('excerpt', '')}, ''
    elif requested == 'COMPARISON':
        for item in supported('comparisons'):
            if len(item.get('entities', [])) >= 2 and item.get('dimensions'):
                return requested, {'columns': item['entities'][:2], 'rows': item['dimensions']}, ''
    elif requested == 'EVIDENCE_HIGHLIGHT':
        quotes = supported('quotations')
        if quotes:
            return requested, {'body': grounding.get('excerpt', ''), 'evidence': [item['text'] for item in quotes]}, ''
    elif requested == 'DATA_TABLE':
        for table in supported('tables'):
            if table.get('headers') and table.get('rows'):
                return requested, {'columns': table['headers'], 'rows': table['rows'], 'body': table.get('caption', '')}, ''
    elif requested == 'CODE_TRACE':
        for code in supported('code_snippets'):
            if code.get('text'):
                return requested, {'body': 'Trace the source code in execution order.', 'code': code['text'],
                                   'language': code.get('language', '')}, ''
    elif requested == 'GROUNDED_EXPLANATION':
        return requested, content, ''
    return 'GROUNDED_EXPLANATION', content, f'{requested}: insufficient source-supported semantic payload'


def bundle_from_excerpt(grounding):
    if 'knowledge' in grounding:
        return grounding
    model = build_understanding(grounding.get('resource_title', ''), grounding.get('excerpt', ''))
    return {**grounding, 'knowledge': model['knowledge']}


def grounded_objectives(concept):
    grounding = objective_grounding(concept)
    if 'knowledge' not in grounding:
        return []
    objects = grounding['knowledge'].get('knowledge_objects', [])
    query = set(re.findall(r'\w{4,}', concept.title.casefold()))
    ranked = sorted(objects, key=lambda item: (-len(query & set(re.findall(r'\w{4,}', item['text'].casefold()))), -item['importance']))
    return objectives_from_knowledge({**grounding, 'knowledge': {**grounding['knowledge'], 'knowledge_objects': ranked}})


def assessment_ready(session, activity, activities):
    if not activity.get('requires_teaching'):
        return True
    completed = set((session.state.get('player') or {}).get('completed_stage_ids', []))
    if activity.get('tutor'):
        tested = set(activity.get('tested_knowledge_ids') or activity['tutor'].get('tests', []))
        established = set(session.state.get('mastered_knowledge_ids', []))
        preceding = activities[:next((i for i, item in enumerate(activities) if item['id'] == activity['id']), 0)]
        for lesson in preceding:
            if lesson.get('purpose') == 'learn' and f"{activity['objective_id']}:{lesson['id']}" in completed:
                established.update(lesson.get('tutor', {}).get('teaches', []))
        return bool(tested) and tested <= established
    lessons = [item for item in activities if item.get('purpose') == 'learn' and item.get('objective_id') == activity['objective_id']]
    return bool(lessons) and all(f"{activity['objective_id']}:{item['id']}" in completed for item in lessons)
