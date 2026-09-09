"""Pedagogical contracts. AI proposes a sequence; these rules authorize it."""
import re
from .teaching_plan import validate_teaching_plan, TeachingPlanValidationError, _text, _list

TEACHING = {'EXPLAIN', 'VISUALIZE', 'SHOW', 'DEMONSTRATE', 'CONNECT', 'COMPARE', 'EXAMPLE', 'REMEDIATE', 'REINFORCE', 'OPTIONAL_DEPTH'}
ASSESSMENT = {'MCQ', 'MATCHING', 'ORDERING', 'SORTING', 'TAP_TARGET', 'SHORT_ANSWER', 'STEP_SOLVER', 'EVIDENCE_HIGHLIGHT'}
POSITIONS = {'upper', 'beside', 'edge', 'center', 'hidden'}
ACTIONS = {'ADVANCE', 'REVEAL_MORE', 'ASK_PREDICTION', 'ASK_CHECK', 'RETEACH',
           'CHANGE_REPRESENTATION', 'SHOW_EXAMPLE', 'BRIDGE_PREREQUISITE', 'OFFER_DEPTH'}
ARC = ('HOOK', 'CONTEXT', 'IDEA', 'SHOW', 'CONNECT', 'TRY', 'FEEDBACK_ADAPT', 'VERIFY', 'ADVANCE')


def knowledge_ids(grounding):
    return {item['id'] for items in grounding.get('knowledge', {}).values() for item in items} | {
        'page:' + page['id'] for page in grounding.get('pages', [])}


def prerequisite_state(session, grounding):
    known = set(session.state.get('mastered_knowledge_ids', [])) if session else set()
    missing = set(session.state.get('missing_prerequisite_ids', [])) if session else set()
    return [{'id': item['id'], 'text': item['text'], 'state': 'KNOWN' if item['id'] in known else 'MISSING' if item['id'] in missing else 'UNCERTAIN'}
            for item in grounding.get('knowledge', {}).get('prerequisites', []) if item.get('support') != 'enrichment']


def validate_tutor_plan(raw, objective, grounding, prerequisites=None):
    if not isinstance(raw, dict) or raw.get('version') != 3:
        raise TeachingPlanValidationError('Tutor plan requires version 3')
    plan = validate_teaching_plan({**raw, 'check_strategy': raw.get('check_strategy') or raw.get('evidence_strategy'),
        'remediation_strategy': raw.get('remediation_strategy') or '; '.join(raw.get('remediation_strategies') or ['Revisit the grounded explanation.'])}, str(objective['id']))
    allowed = knowledge_ids(grounding)
    pages = {page['id']: page['text'] for page in grounding.get('pages', [])}
    established = {item['id'] for item in prerequisites or [] if item['state'] == 'KNOWN'}
    plan['prerequisite_state'] = prerequisites or []
    plan['advancement_rule'] = {'minimum_level': raw.get('advancement_rule', {}).get('minimum_level', 1), 'passing_score': 70}
    if type(plan['advancement_rule']['minimum_level']) is not int or plan['advancement_rule']['minimum_level'] not in range(1, 6):
        raise TeachingPlanValidationError('Invalid evidence level')
    plan['evidence_strategy'] = _text(raw.get('evidence_strategy'), 400, required=True)
    plan['remediation_strategies'] = [_text(item, 240) for item in _list(raw.get('remediation_strategies'), 'remediation_strategies')[:3]]
    bridge_count = 0
    moment_ids = set()
    seen_bodies = []
    has_assessment = False
    available_levels = []
    for moment_index, (original, moment) in enumerate(zip(raw['teaching_moments'], plan['teaching_moments'])):
        if moment['id'] in moment_ids:
            raise TeachingPlanValidationError('Duplicate moment id')
        moment_ids.add(moment['id'])
        moment['purpose'] = _text(original.get('purpose'), 80, required=True)
        moment['dialogue'] = _text(original.get('dialogue'), 500)
        default_arc = 'VERIFY' if moment['interaction'] in ASSESSMENT else ('HOOK' if moment_index == 0 else 'SHOW')
        moment['arc_phase'] = _text(original.get('arc_phase') or default_arc, 32).upper()
        if moment['arc_phase'] not in ARC:
            raise TeachingPlanValidationError('Invalid teaching arc phase')
        moment['understanding_change'] = _text(original.get('understanding_change') or moment['purpose'], 240, required=True)
        moment['transition'] = _text(original.get('transition') or 'Build on the previous idea.', 240, required=True)
        moment['attention_cue'] = _text(original.get('attention_cue') or 'Focus on the relationship shown here.', 180, required=True)
        proposed = original.get('next_actions') or (['ADVANCE'] if moment['interaction'] in ASSESSMENT else ['ADVANCE', 'REVEAL_MORE'])
        if not isinstance(proposed, list) or not proposed or any(action not in ACTIONS for action in proposed):
            raise TeachingPlanValidationError('Moment proposes an unsupported tutor action')
        moment['next_actions'] = proposed
        if re.search(r'\b(?:teaching moment|pedagogical state|checkpoint\s*\d*|objective\s+\d+)\b', moment['dialogue'], re.I):
            raise TeachingPlanValidationError('Dialogue contains internal labels')
        moment['mascot_position'] = original.get('mascot_position', 'beside')
        if moment['mascot_position'] not in POSITIONS:
            raise TeachingPlanValidationError('Invalid mascot position')
        moment['level'] = original.get('level', 1)
        if type(moment['level']) is not int or moment['level'] not in range(1, 6):
            raise TeachingPlanValidationError('Invalid moment level')
        for field in ('teaches', 'tests'):
            values = original.get(field, [])
            if not isinstance(values, list) or not all(isinstance(value, str) and value in allowed for value in values):
                raise TeachingPlanValidationError('Moment references unknown knowledge')
            moment[field] = values
        refs = original.get('source_refs')
        quote = original.get('source_quote')
        if not isinstance(refs, list) or not refs or not all(isinstance(ref, str) and ref in pages for ref in refs):
            raise TeachingPlanValidationError('Moment requires source page references')
        if not isinstance(quote, str) or not quote.strip() or not any(quote in pages[ref] for ref in refs):
            raise TeachingPlanValidationError('Moment requires an exact source excerpt')
        moment['source_refs'], moment['source_quote'] = refs, quote
        content = moment['content']
        raw_content = original.get('content', {})
        for field, limit in (('problem', 500), ('result', 300), ('interpretation', 500), ('code', 1800), ('language', 24)):
            content[field] = _text(raw_content.get(field), limit) if field != 'code' else str(raw_content.get(field) or '')[:limit]
        content['known'] = [_text(item, 200) for item in _list(raw_content.get('known'), 'known')[:6]]
        content['parts'] = [{'symbol': _text(item.get('symbol'), 80, required=True), 'meaning': _text(item.get('meaning'), 240, required=True)}
                            for item in _list(raw_content.get('parts'), 'parts')[:8] if isinstance(item, dict)]
        content['formula_format'] = 'plain'  # do not reinterpret uncertain source equations as LaTeX
        content['hints'] = [_text(item, 300) for item in _list(raw_content.get('hints'), 'hints')[:3]]
        content['correct_feedback'] = _text(raw_content.get('correct_feedback'), 400)
        content['incorrect_feedback'] = _text(raw_content.get('incorrect_feedback'), 400)
        content['correct_groups'] = raw_content.get('correct_groups', {})
        if not isinstance(content['correct_groups'], dict) or any(not isinstance(key, str) or not isinstance(value, str) for key, value in content['correct_groups'].items()):
            raise TeachingPlanValidationError('Invalid sorting answer')
        rep = moment['representation']
        subject = str(plan.get('subject_family', '')).casefold()
        unsuitable = ((subject == 'biology' and rep in {'CODE_TRACE', 'ARCHITECTURE'}) or
                      (subject == 'mathematics' and rep == 'CYCLE') or
                      (subject == 'literature' and rep in {'FORMULA', 'CODE_TRACE'}))
        if unsuitable:
            raise TeachingPlanValidationError('Representation does not fit the subject relationship')
        cited_text = ' '.join(pages[ref] for ref in refs)
        body = (content.get('body') or '').strip()
        if len(body) > 650:
            raise TeachingPlanValidationError('Teaching moment exceeds the pacing limit')
        normalized_body = re.sub(r'\W+', ' ', body.casefold()).strip()
        if normalized_body and normalized_body in seen_bodies:
            raise TeachingPlanValidationError('Teaching moments must create distinct understanding')
        if normalized_body: seen_bodies.append(normalized_body)
        if len(body) > 500 and any(body == pages[ref].strip() or (len(body) / max(1, len(pages[ref].strip())) > .8 and body in pages[ref]) for ref in refs):
            raise TeachingPlanValidationError('Raw source dumps are not teachable moments')
        # Literal tables, quotations and code are source evidence, not generated facts.
        if rep == 'DATA_TABLE':
            if any(cell not in cited_text for row in content['rows'] for cell in row):
                raise TeachingPlanValidationError('Table contains unsupported data')
        if content['evidence'] and any(quote not in cited_text for quote in content['evidence']):
            raise TeachingPlanValidationError('Evidence quotation is not in cited source')
        if rep == 'CODE_TRACE' and content['code'] not in cited_text:
            raise TeachingPlanValidationError('Code trace must preserve source code')
        if rep in {'FORMULA', 'WORKED_EXAMPLE'} and content['formula'] not in cited_text:
            raise TeachingPlanValidationError('Formula must preserve source notation')
        if rep == 'DATA_TABLE' and (not content['columns'] or not content['rows'] or any(len(row) != len(content['columns']) for row in content['rows'])):
            raise TeachingPlanValidationError('Data table requires aligned data')
        if rep == 'WORKED_EXAMPLE' and not all(content.get(key) for key in ('problem', 'known', 'formula', 'steps', 'result', 'interpretation')):
            raise TeachingPlanValidationError('Worked lesson requires problem, values, operation, transformations, result and interpretation')
        if rep == 'FORMULA' and (not content['formula'] or not content['parts']):
            raise TeachingPlanValidationError('Formula must connect symbols to meanings')
        if rep == 'CODE_TRACE' and not content['code']:
            raise TeachingPlanValidationError('Code trace needs literal code')
        if rep in {'SIMPLE_GRAPH', 'LABELED_DIAGRAM'}:
            raise TeachingPlanValidationError('No validated source geometry available for this renderer')
        if moment['purpose'] == 'prerequisite_bridge':
            bridge_count += 1
            if bridge_count > 2 or not set(moment['teaches']) & {item['id'] for item in prerequisites or [] if item['state'] != 'KNOWN'}:
                raise TeachingPlanValidationError('Prerequisite bridge must be short and target an uncertain or missing prerequisite')
        is_check = moment['interaction'] in ASSESSMENT
        if moment['type'] not in TEACHING | {'CHECK', 'INTERACT', 'REFLECT'} or (moment['type'] in {'CHECK', 'INTERACT'} and not is_check):
            raise TeachingPlanValidationError('Moment has no supported teaching or evidence behavior')
        if is_check:
            has_assessment = True
            available_levels.append(moment['level'])
            if not moment['tests'] or not set(moment['tests']) <= established:
                raise TeachingPlanValidationError('Assessment targets knowledge not yet taught')
            if moment['interaction'] == 'SORTING' and set(content['correct_groups']) != set(content['items']):
                raise TeachingPlanValidationError('Sorting requires a complete answer mapping')
            if not content['correct_feedback'] or not content['incorrect_feedback']:
                raise TeachingPlanValidationError('Assessment needs explanatory feedback')
            if re.search(r'^(?:what relationship did flow (?:just )?show|what happens next\??|explain the idea above\.?|what did flow (?:just )?show)', content.get('prompt', ''), re.I):
                raise TeachingPlanValidationError('Assessment prompt must name the specific content being tested')
        elif moment['type'] in TEACHING:
            if not moment['teaches']:
                raise TeachingPlanValidationError('Teaching must establish identified knowledge')
            established.update(moment['teaches'])
    if not has_assessment or max(available_levels) < plan['advancement_rule']['minimum_level']:
        raise TeachingPlanValidationError('Plan cannot supply its required evidence')
    plan['source_grounding'] = {key: grounding[key] for key in ('resource_id', 'resource_title', 'source_refs') if key in grounding}
    plan['source_fingerprint'] = grounding.get('source_fingerprint')
    plan['controller_actions'] = sorted(ACTIONS)
    return plan
