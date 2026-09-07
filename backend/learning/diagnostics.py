"""Developer-only operational trace. No prompts with hidden model reasoning."""
from django.conf import settings


def objective_trace(session, objective_id):
    if not settings.DEBUG:
        raise PermissionError('Material diagnostics are development-only')
    objective = next((item for item in session.objectives if str(item['id']) == str(objective_id)), None)
    if objective is None:
        raise ValueError('Unknown objective')
    cached = (session.state.get('teaching_plans') or {}).get(str(objective_id), {})
    resource = session.concept.source_resource
    plan = cached.get('plan') or {}
    return {'journey_id': str(session.concept.path_id), 'objective': objective,
            'source_understanding': resource.source_understanding if resource else {},
            'source_chunks': list(resource.chunks.values('id', 'page_number', 'text_content')) if resource else [],
            'retrieval_basis': 'Teaching uses semantic pages. Vector chunks are listed for comparison, not used to construct this plan.',
            'teaching_plan_input': cached.get('grounding_input'), 'teaching_plan': plan,
            'teaching_moments': plan.get('teaching_moments', []),
            'cache_fingerprint': cached.get('fingerprint'),
            'render_result': {'status': 'client_observation_required',
                              'requested': plan.get('recommended_representation'),
                              'fallback_reason': plan.get('fallback_reason', ''),
                              'instruction': 'Correlate objective/activity IDs with Journey render diagnostics in the development browser console.'}}


def flow_context(session):
    """Future Ask Flow input; structured visible state and evidence, no UI code."""
    objective = session.objectives[min(session.current_point, len(session.objectives) - 1)] if session.objectives else {}
    cached = (session.state.get('teaching_plans') or {}).get(str(objective.get('id')), {})
    current = (session.state.get('player') or {}).get('current_stage_id')
    visible = None
    plan = cached.get('plan')
    if plan and objective:
        from .teaching_plan import teaching_activities_from_plan
        from .views import _activity_id
        activities = teaching_activities_from_plan(session.concept, objective, plan,
                      lambda suffix: _activity_id(session.concept, f'presentation:{suffix}'))
        visible = next((activity for activity in activities if f"{objective['id']}:{activity['id']}" == current), None)
    return {'journey_id': str(session.concept.path_id), 'objective_id': objective.get('id'),
            'teaching_plan_id': cached.get('fingerprint'),
            'current_moment_id': current,
            'current_representation': (visible or {}).get('type'),
            'visible_semantic_content': (visible or {}).get('content'),
            'source_grounding': cached.get('grounding_input'),
            'learner_evidence': session.state.get('objective_evidence', {}),
            'recent_misconceptions': session.unresolved_misconceptions}
