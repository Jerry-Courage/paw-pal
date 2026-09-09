"""Objective-scoped source selection and teachability contracts."""
import re
from library.source_understanding import VERSION, build_understanding, grounding_bundle, persist_understanding

FILLER = re.compile(r'^(?:step\s*\d+\s*:\s*)?(?:substitute the known information|apply the (?:concept|idea)|think about the idea|use the information above|consider the following|read the concept|work one transformation at a time|check the result against the goal)[.! ]*$', re.I)


def resource_knowledge(resource):
    if resource.source_understanding and resource.source_understanding.get('version') == VERSION:
        return resource.source_understanding
    if isinstance(resource.source_understanding, dict) and resource.source_understanding.get('pages'):
        old_text = '\n\n'.join(page.get('text', '') for page in resource.source_understanding['pages'])
        if old_text.strip():
            return persist_understanding(resource, old_text)
    text = '\n\n'.join(item['extracted_text'] for item in resource.ai_concepts or []
                       if isinstance(item, dict) and isinstance(item.get('extracted_text'), str))
    if text:
        return persist_understanding(resource, text)
    return {}


def objective_grounding(concept, objective=None):
    resource = concept.source_resource
    base = {'resource_id': concept.source_resource_id, 'resource_title': resource.title if resource else '',
            'section': concept.source_section or '', 'page': concept.source_page, 'excerpt': ''}
    if resource:
        model = resource_knowledge(resource)
        if model:
            references = (objective or {}).get('source_refs') or []
            page_number = next((ref.get('number') for ref in references if ref.get('number') is not None), concept.source_page)
            return {**base, **grounding_bundle(model, (objective or {}).get('text') or concept.title,
                                              page_number, concept.source_section)}
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
            # The current map canvas displays nodes but drops edge labels/direction.
            # Preserve the explanation until that renderer can show the relationships.
            return 'GROUNDED_EXPLANATION', content, 'Current map renderer does not display relationship edges'
    elif requested == 'COMPARISON':
        for item in supported('comparisons'):
            if len(item.get('entities', [])) >= 2 and item.get('dimensions'):
                return requested, {'columns': item['entities'][:2], 'rows': item['dimensions']}, ''
    elif requested == 'EVIDENCE_HIGHLIGHT':
        quotes = supported('quotations')
        if quotes:
            return requested, {'body': grounding.get('excerpt', ''), 'evidence': [item['text'] for item in quotes]}, ''
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
    knowledge = grounding['knowledge']
    items = [item for kind in ('definitions', 'worked_examples', 'concepts', 'processes', 'relationships', 'formulas', 'quotations')
             for item in knowledge.get(kind, []) if item.get('support') == 'source']
    unique = list({item['text']: item for item in items}.values())[:4]
    def prompt(item):
        text = item.get('problem') or item['text'].rstrip('.')
        if item.get('steps'): return f'Explain how the stages in “{text[:160]}” connect and why the order matters.'
        if item.get('source') and item.get('target'): return f'Explain how {item["source"]} leads to {item["target"]} in this material.'
        if item in knowledge.get('formulas', []): return f'Interpret each part of this source formula and state what it calculates: {text[:160]}.'
        return f'Explain the meaning and significance of this source statement: {text[:180]}.'
    return [{'id': f'material-{index + 1}', 'text': prompt(item),
             'source_refs': item['source_refs'], 'knowledge_ids': [item['id']], 'source_statement': item['text']}
            for index, item in enumerate(unique)]


def assessment_ready(session, activity, activities):
    if not activity.get('requires_teaching'):
        return True
    evidence = (session.state.get('objective_evidence') or {}).get(activity['objective_id'], {})
    if evidence.get('evidence_ids') and evidence.get('best_score', 0) >= 70:
        return True
    completed = set((session.state.get('player') or {}).get('completed_stage_ids', []))
    if activity.get('tutor'):
        activities = activities[:next((i for i, item in enumerate(activities) if item['id'] == activity['id']), 0)]
    lessons = [item for item in activities if item.get('purpose') == 'learn' and item.get('objective_id') == activity['objective_id']]
    return bool(lessons) and all(f"{activity['objective_id']}:{item['id']}" in completed for item in lessons)
