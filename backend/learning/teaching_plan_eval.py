"""Offline TeachingPlan comparison harness.

The harness intentionally accepts captured candidate outputs instead of reading
credentials or changing the production router. A developer can run each
configured model through the existing AIService in a controlled environment,
then compare the returned JSON with ``compare_candidate_outputs``.
"""
from .teaching_plan import TeachingPlanValidationError, validate_teaching_plan


# Names are audited from the current repository configuration. This registry is
# informational and must not be treated as production routing policy.
AUDITED_MODEL_CANDIDATES = {
    'fast_conversation': ['groq:openai/gpt-oss-20b'],
    'structured_teaching': [
        'groq:openai/gpt-oss-120b',
        'groq:qwen/qwen3.6-27b',
        'google:gemini-3.5-flash',
        'google:gemini-3.6-flash',
    ],
    'semantic_evaluation': [
        'groq:openai/gpt-oss-120b',
        'google:gemini-3.5-flash',
    ],
    'realtime_voice': ['google:gemini-2.5-flash-native-audio-preview-12-2025'],
}


def score_candidate_output(raw, objective_id):
    """Score one already-captured output without making an AI/network call."""
    try:
        plan = validate_teaching_plan(raw, objective_id)
    except (TeachingPlanValidationError, TypeError, ValueError) as exc:
        return {'valid': False, 'score': 0, 'reason': str(exc)}
    moments = plan['teaching_moments']
    representations = {moment['representation'] for moment in moments}
    interactive = [moment for moment in moments if moment['interaction'] != 'NONE']
    score = 60
    score += min(15, len(moments) * 3)
    score += min(10, len(representations) * 5)
    score += 10 if plan['source_grounding'] else 0
    score += 5 if interactive else 0
    return {
        'valid': True, 'score': min(100, score), 'reason': 'validated',
        'moments': len(moments), 'representations': sorted(representations),
        'interactive_moments': len(interactive),
    }


def compare_candidate_outputs(outputs, objective_id):
    """Return deterministic rankings for ``{provider:model: raw_plan}`` data."""
    results = [
        {'candidate': candidate, **score_candidate_output(raw, objective_id)}
        for candidate, raw in outputs.items()
    ]
    return sorted(results, key=lambda item: (-item['score'], item['candidate']))
