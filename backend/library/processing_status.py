STAGES = (
    (0, 'UPLOAD'), (10, 'EXTRACT'), (30, 'UNDERSTAND'), (45, 'VISUAL_ANALYSIS'),
    (70, 'STUDY_KIT'), (85, 'ENRICHMENT'), (100, 'JOURNEY_READY'),
)


def stage_for(resource):
    get = resource.get if isinstance(resource, dict) else lambda key, default=None: getattr(resource, key, default)
    if get('status') in {'error', 'failed'}:
        return 'ERROR'
    ready = get('status') == 'ready' and get('has_study_kit', False)
    progress = max(0, min(100 if ready else 99, int(get('processing_progress', 0) or 0)))
    if ready:
        return 'JOURNEY_READY'
    return next(name for threshold, name in reversed(STAGES) if progress >= threshold)


def status_payload(resource):
    get = resource.get if isinstance(resource, dict) else lambda key, default=None: getattr(resource, key, default)
    ready = get('status') == 'ready' and bool(get('has_study_kit', False))
    progress = 100 if ready else min(int(get('processing_progress', 0) or 0), 99)
    return {'id': get('id'), 'status': get('status'), 'progress': progress,
            'stage': stage_for(resource), 'ready': ready,
            'error': get('status') in {'error', 'failed'},
            'message': get('status_text', '') or ''}
