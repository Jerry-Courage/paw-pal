"""Task-specific inference with intact inputs and validated provider fallback.

Routes are configuration, not model recommendations. Defaults reuse repository
models; operators can replace each task route after benchmarking.
"""
import json
import logging
import time
from dataclasses import dataclass
from django.conf import settings
import requests

logger = logging.getLogger('nitemind')


class TaskInferenceError(RuntimeError):
    pass


class InputBudgetExceeded(TaskInferenceError):
    pass


@dataclass(frozen=True)
class TaskPolicy:
    context_chars: int
    output_tokens: int
    reasoning: bool = False


POLICIES = {
    'SOURCE_UNDERSTANDING': TaskPolicy(48000, 6000, True),
    'OBJECTIVE_GENERATION': TaskPolicy(28000, 3000, True),
    'TEACHING_GENERATION': TaskPolicy(48000, 6500, True),
    'EXAMPLE_GENERATION': TaskPolicy(28000, 4000, True),
    'QUESTION_GENERATION': TaskPolicy(24000, 2500),
    'DISTRACTOR_GENERATION': TaskPolicy(12000, 1400),
    'REMEDIATION': TaskPolicy(32000, 4000, True),
    'FEYNMAN_EVALUATION': TaskPolicy(28000, 2500, True),
    'MASTERY_GENERATION': TaskPolicy(32000, 4000, True),
    'MASTERY_EVALUATION': TaskPolicy(28000, 2500, True),
    'SOURCE_REASONING': TaskPolicy(32000, 2200, True),
    'CONVERSATION': TaskPolicy(20000, 1800),
}


def routes_for(task):
    configured = getattr(settings, 'AI_TASK_ROUTES', {}).get(task)
    if configured is not None:
        if not isinstance(configured, list) or not configured:
            raise TaskInferenceError('Task route must contain at least one provider/model')
        routes = configured
    else:
        model = 'openai/gpt-oss-120b' if POLICIES[task].reasoning else 'openai/gpt-oss-20b'
        routes = [{'provider': 'groq', 'model': model},
                  {'provider': 'google', 'model': 'gemini-3.5-flash'},
                  {'provider': 'openrouter', 'model': settings.OPENROUTER_MODEL}]
    for route in routes:
        if not isinstance(route, dict) or route.get('provider') not in {'groq', 'google', 'openrouter'} or not isinstance(route.get('model'), str):
            raise TaskInferenceError('Invalid task route')
    return routes


def _provider_call(service, route, messages, tokens, *, task=''):
    provider, model = route['provider'], route['model']
    connect_timeout, read_timeout = ((5, 18) if task == 'SOURCE_UNDERSTANDING' else (8, 45))
    if provider == 'google':
        clients = service._google_clients()
        if not clients:
            raise TaskInferenceError('Provider unavailable')
        contents, system = service._to_gemini_format(messages)
        response = clients[0].models.generate_content(model=model, contents=contents,
                    config={'system_instruction': system, 'max_output_tokens': tokens, 'http_options': {'timeout': read_timeout * 1000}})
        if any(str(getattr(candidate, 'finish_reason', '')).endswith('MAX_TOKENS') for candidate in response.candidates or []):
            raise TaskInferenceError('Output exceeded model budget')
        content = response.text or ''
        if not content.strip() or '<think>' in content:
            raise TaskInferenceError('No usable public model output')
        return content
    keys = service._groq_keys() if provider == 'groq' else [service.api_key] if service.api_key else []
    if not keys:
        raise TaskInferenceError('Provider unavailable')
    url = 'https://api.groq.com/openai/v1/chat/completions' if provider == 'groq' else f'{service.base_url}/chat/completions'
    # Never use the legacy message compression or reasoning-field extraction.
    response = requests.post(url, headers={'Authorization': f'Bearer {keys[0]}', 'Content-Type': 'application/json'},
                             json={'model': model, 'messages': messages, 'max_tokens': tokens}, timeout=(connect_timeout, read_timeout))
    response.raise_for_status()
    choice = response.json()['choices'][0]
    if choice.get('finish_reason') == 'length':
        raise TaskInferenceError('Output exceeded model budget')
    content = choice['message'].get('content')
    if not isinstance(content, str) or not content.strip() or '<think>' in content:
        raise TaskInferenceError('No usable public model output')
    return content


def run_task(service, messages, task, *, max_tokens=None, validator=None, grounding_fingerprint='', plan_version=None):
    policy = POLICIES[task]
    # Reject the full structured payload rather than slicing a JSON string, formula,
    # or a source quote. Grounding selection belongs to the task's caller.
    encoded = json.dumps(messages, ensure_ascii=False)
    if len(encoded) > policy.context_chars:
        raise InputBudgetExceeded(f'{task} selected context exceeds its budget')
    tokens = min(max_tokens or policy.output_tokens, policy.output_tokens)
    for index, route in enumerate(routes_for(task)):
        started = time.monotonic()
        valid = False
        error = None
        try:
            raw = _provider_call(service, route, messages, tokens, task=task)
            result = validator(raw) if validator else raw
            valid = True
            return result
        except Exception as exc:
            # No response bodies, learner text, keys, or hidden reasoning in logs.
            error = type(exc).__name__
        finally:
            logger.info('[Tutor inference] %s', json.dumps({'task': task, 'provider': route['provider'],
                'model': route['model'], 'fallback': index > 0, 'latency_ms': round((time.monotonic() - started) * 1000),
                'schema_valid': valid if validator else None, 'accepted': valid, 'error': error,
                'grounding_fingerprint': grounding_fingerprint, 'plan_version': plan_version}))
    raise TaskInferenceError(f'{task} has no valid provider result')


def structured_task(service, task, system, payload, validator, *, plan_version=3):
    return run_task(service, [{'role': 'system', 'content': system},
                             {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False, default=str)}],
                    task, validator=lambda raw: validator(json.loads(raw)),
                    grounding_fingerprint=payload.get('source_grounding', {}).get('source_fingerprint', ''),
                    plan_version=plan_version)
