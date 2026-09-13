"""Authoritative evidence targets and domain-neutral Journey evaluation."""
import logging
import re
import time
from difflib import SequenceMatcher

from django.conf import settings

logger = logging.getLogger(__name__)

STOP = {
    'about', 'after', 'again', 'also', 'and', 'because', 'being', 'between', 'could', 'does',
    'each', 'from', 'have', 'into', 'itself', 'more', 'most', 'other', 'should',
    'than', 'that', 'their', 'there', 'these', 'they', 'this', 'those', 'through',
    'its', 'the', 'them', 'then', 'using', 'what', 'when', 'where', 'which', 'while', 'with', 'would',
}
SYNONYMS = {
    'need': {'needs', 'needed', 'require', 'requires', 'required', 'necessary'},
    'cause': {'causes', 'caused', 'produce', 'produces', 'create', 'creates', 'lead', 'leads'},
    'move': {'moves', 'moved', 'flow', 'flows', 'transfer', 'transfers', 'travel', 'travels', 'carry', 'carries', 'reach', 'reaches', 'distribute', 'distributes', 'distributed', 'distribution'},
    'use': {'uses', 'used', 'using', 'employ', 'employs'},
    'show': {'shows', 'shown', 'demonstrate', 'demonstrates', 'indicate', 'indicates'},
    'difference': {'different', 'differs', 'contrast', 'contrasts', 'distinguish'},
    'support': {'supports', 'supported', 'evidence', 'prove', 'proves'},
    'increase': {'increases', 'increased', 'rise', 'rises', 'higher'},
    'decrease': {'decreases', 'decreased', 'reduce', 'reduces', 'lower'},
    'large': {'larger', 'big', 'bigger'},
    'organism': {'organisms', 'animal', 'animals'},
    'shortage': {'shortages', 'scarce', 'scarcity'},
    'dishonest': {'dishonesty', 'untruthful', 'deceptive'},
    'read': {'reads', 'reading', 'get', 'gets', 'retrieve', 'retrieves'},
    'change': {'changes', 'changed', 'changing'},
    'divide': {'divides', 'divided', 'dividing'},
    'gas': {'gases'},
}
CANONICAL = {variant: root for root, variants in SYNONYMS.items() for variant in variants | {root}}
NEGATION = re.compile(r"\b(?:not|never|no|cannot|can't|doesn't|does not|without)\b", re.I)


def _normalized(value):
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9.+-]+', ' ', str(value).casefold())).strip()


def semantic_terms(value):
    result = []
    for word in re.findall(r"[a-z0-9]+(?:\.[0-9]+)?", str(value).casefold()):
        if len(word) < 3 or word in STOP:
            continue
        word = CANONICAL.get(word, word)
        if len(word) > 5 and word.endswith('ing'):
            word = word[:-3]
        elif len(word) > 4 and word.endswith('ed'):
            word = word[:-2]
        elif len(word) > 4 and word.endswith('s'):
            word = word[:-1]
        result.append(word)
    return set(result)


def capability_prompt(capability, label, *, fresh=False):
    label = str(label or 'this idea').strip(' .')
    prompts = {
        'DEFINE': f'What does {label} mean?',
        'EXPLAIN_MECHANISM': f'Explain how or why {label} works.',
        'COMPARE': f'What is the important difference between the cases in {label}?',
        'TRACE': f'Trace how information or action moves through {label}.',
        'APPLY': f'How would you use {label} in a new situation?',
        'CALCULATE': f'Use the taught method for {label} and explain the result.',
        'INTERPRET': f'What does the result or claim about {label} mean?',
        'IDENTIFY_EVIDENCE': f'Which evidence supports the claim about {label}, and how?',
        'ORDER': f'Put the stages of {label} in order and explain the key transition.',
        'PREDICT': f'What outcome does {label} predict, and why?',
    }
    prompt = prompts.get(str(capability or '').upper(), prompts['INTERPRET'])
    return f'In your own words, {prompt[0].lower()}{prompt[1:]}' if fresh else prompt


def build_assessment_target(objective, moment, grounding):
    """Bind a check to the same validated objects and relationships that teaching used."""
    tested = list(moment.get('tested_knowledge_ids') or moment.get('tests') or [])
    objects = {item['id']: item for item in grounding.get('knowledge', {}).get('knowledge_objects', [])}
    selected = [objects[key] for key in tested if key in objects]
    content = moment.get('content') or {}
    expected = [item.get('text', '') for item in selected if item.get('text')]
    if not expected and content.get('expected_answer'):
        expected = [content['expected_answer']]
    edges = [edge for edge in grounding.get('pedagogical_relationships', [])
             if edge.get('source_id') in tested or edge.get('target_id') in tested]
    capability = str(objective.get('capability') or 'INTERPRET').upper()
    return {
        'objective_id': str(objective.get('id') or ''),
        'tested_knowledge_ids': tested,
        'capability': capability,
        'expected_concepts': [
            {'knowledge_id': item.get('id', ''), 'label': item.get('concept', ''),
             'proposition': item.get('text', ''), 'semantic_type': item.get('semantic_type', ''),
             'required_terms': sorted(semantic_terms(item.get('text', '')))}
            for item in selected
        ] or [{'knowledge_id': tested[0] if tested else '', 'label': '',
               'proposition': text, 'semantic_type': '', 'required_terms': sorted(semantic_terms(text))}
              for text in expected],
        'required_relationships': [
            {'source_id': edge.get('source_id', ''), 'target_id': edge.get('target_id', ''),
             'relationship_type': edge.get('relationship_type', ''),
             'source_refs': edge.get('source_refs', [])}
            for edge in edges
        ],
        'acceptable_paraphrases': expected,
        'source_support': [{'knowledge_id': item.get('id', ''), 'source_refs': item.get('source_refs', [])}
                           for item in selected],
        'prohibited_unsupported_claims': [],
        'additional_evidence_required': bool(content.get('additional_evidence_required', False)),
        'evidence_threshold': .68,
        'scoring_rubric': {'concept_coverage': .65, 'relationship_coverage': .25,
                           'capability_alignment': .10, 'passing_score': 70, 'partial_score': 35},
    }


def _deterministic_open_text(answer, target):
    expected = [item.get('proposition', '') for item in target.get('expected_concepts', []) if item.get('proposition')]
    normalized_answer = _normalized(answer)
    near_exact = any(normalized_answer == _normalized(text) or
           (len(normalized_answer) >= 24 and normalized_answer in _normalized(text)) or
           SequenceMatcher(None, normalized_answer, _normalized(text)).ratio() >= .9 for text in expected)
    if near_exact and not target.get('additional_evidence_required', False):
        return {'outcome': 'correct', 'score': 100, 'missing_evidence': [], 'path': 'grounded_exact'}
    if near_exact:
        return {'outcome': 'partial', 'score': 69,
                'missing_evidence': ['the additional capability evidence'],
                'path': 'additional_evidence_required'}
    if not normalized_answer:
        return {'outcome': 'insufficient', 'score': 0, 'missing_evidence': ['answer'], 'path': 'empty'}
    answer_terms = semantic_terms(answer)
    expected_terms = semantic_terms(' '.join(expected))
    negated_terms = set()
    words = re.findall(r"[a-z0-9]+", str(answer).casefold())
    for index, word in enumerate(words):
        if NEGATION.fullmatch(word) or (word == 'does' and index + 1 < len(words) and words[index + 1] == 'not'):
            negated_terms.update(semantic_terms(' '.join(words[index + 1:index + 5])))
    if negated_terms & expected_terms and not NEGATION.search(' '.join(expected)):
        return {'outcome': 'incorrect', 'score': 0, 'missing_evidence': ['non-contradictory relationship'], 'path': 'contradiction'}
    coverages = []
    missing = []
    for concept in target.get('expected_concepts', []):
        required = set(concept.get('required_terms') or semantic_terms(concept.get('proposition', '')))
        coverage = len(required & answer_terms) / max(1, len(required))
        coverages.append(coverage)
        if coverage < .58:
            missing.append(concept.get('label') or concept.get('proposition', '')[:100])
    concept_coverage = sum(coverages) / max(1, len(coverages))
    relationship_markers = {'cause', 'need', 'move', 'support', 'difference', 'use', 'increase', 'decrease',
                            'before', 'after', 'therefore', 'because', 'through', 'between'}
    required_relationships = target.get('required_relationships') or []
    relationship_coverage = 1.0 if not required_relationships else float(bool(answer_terms & relationship_markers))
    score = round(100 * (.75 * concept_coverage + .25 * relationship_coverage))
    # Token evidence can identify a clear pass/partial, but ambiguous cases go to semantic evaluation.
    if concept_coverage >= target.get('evidence_threshold', .68) and (not required_relationships or relationship_coverage):
        return {'outcome': 'correct', 'score': max(70, score), 'missing_evidence': [], 'path': 'structured_evidence'}
    if concept_coverage >= .28 or len(answer_terms & expected_terms) >= 2:
        return {'outcome': 'partial', 'score': max(35, min(69, score)), 'missing_evidence': missing, 'path': 'structured_partial'}
    return {'outcome': 'ambiguous', 'score': max(0, min(34, score)), 'missing_evidence': missing, 'path': 'semantic_required'}


def evaluate_open_text(answer, target, *, service=None):
    """Return five-state semantic evidence without confusing a system error with learner evidence."""
    local = _deterministic_open_text(answer, target)
    ai_enabled = getattr(settings, 'JOURNEY_TEACHING_AI_ENABLED', False)
    if local['outcome'] in {'correct', 'incorrect', 'insufficient'} or (local['outcome'] == 'partial' and not ai_enabled):
        logger.info('[JOURNEY EVALUATOR] provider=deterministic model=none latency_ms=0 fallback=false validation=accepted outcome=%s path=%s objective_id=%s knowledge_ids=%s capability=%s',
                    local['outcome'], local['path'], target.get('objective_id', ''),
                    target.get('tested_knowledge_ids', []), target.get('capability', ''))
        return local
    if not ai_enabled:
        return {**local, 'outcome': 'incorrect', 'path': 'deterministic_only'}
    from ai_assistant.services import AIService
    from ai_assistant.task_routing import structured_task
    route = (getattr(settings, 'AI_TASK_ROUTES', {}) or {}).get('MASTERY_EVALUATION') or []
    selected = route[0] if route and isinstance(route[0], dict) else {}
    started = time.perf_counter()

    def validate(raw):
        allowed = {'correct', 'partial', 'incorrect'}
        if not isinstance(raw, dict) or raw.get('outcome') not in allowed or not isinstance(raw.get('missing_evidence', []), list):
            raise ValueError('Invalid semantic evaluation schema')
        score = raw.get('score')
        if type(score) is not int or score not in range(101):
            raise ValueError('Invalid semantic evaluation score')
        if ((raw['outcome'] == 'correct' and score < 70) or
                (raw['outcome'] == 'partial' and score not in range(35, 70)) or
                (raw['outcome'] == 'incorrect' and score >= 35)):
            raise ValueError('Semantic evaluation outcome and score disagree')
        return {'outcome': raw['outcome'], 'score': score,
                'missing_evidence': [str(item)[:160] for item in raw.get('missing_evidence', [])[:4]],
                'path': 'provider'}
    try:
        result = structured_task(service or AIService(), 'MASTERY_EVALUATION',
            'Evaluate meaning against the structured assessment target. Accept accurate paraphrases and concise equivalents. '
            'Reject contradictions and unsupported claims. Return JSON {"outcome":"correct|partial|incorrect","score":0..100,"missing_evidence":[strings]}.',
            {'learner_answer': str(answer)[:3000], 'assessment_target': target}, validate)
        logger.info('[JOURNEY EVALUATOR] provider=%s model=%s latency_ms=%.2f fallback=false validation=accepted outcome=%s',
                    selected.get('provider', 'configured'), selected.get('model', 'configured'),
                    (time.perf_counter() - started) * 1000, result['outcome'])
        return result
    except Exception as exc:
        logger.exception('[JOURNEY EVALUATOR] provider=%s model=%s latency_ms=%.2f fallback=true validation=rejected error=%s',
                         selected.get('provider', 'configured'), selected.get('model', 'configured'),
                         (time.perf_counter() - started) * 1000, type(exc).__name__)
        return {'outcome': 'ungradable_system_error', 'score': None, 'missing_evidence': [],
                'path': 'provider_failure'}


def feedback_for(result, target):
    outcome = result['outcome']
    if outcome == 'correct':
        return 'Your answer establishes the required idea and relationship.'
    if outcome == 'partial':
        missing = ', '.join(item for item in result.get('missing_evidence', []) if item)
        return f'You have part of the idea. Add the missing conceptual element: {missing or "the required relationship"}.'
    if outcome == 'ungradable_system_error':
        return 'Flow could not check that answer just now. Your answer and place are saved; try the check again.'
    return 'That answer does not yet establish the required idea and relationship.'
