"""Bounded Journey lesson preparation using the project's existing Django-Q worker."""
import logging

from django.contrib.auth import get_user_model


logger = logging.getLogger(__name__)


def prepare_journey_lesson(concept_id, user_id, objective_index=0):
    from .models import ConceptNode, TeachingSession
    from .performance import JourneyPerformance
    from .teaching_plan import get_or_create_teaching_plan
    from .views import _get_teaching_session, _grounding

    concept = ConceptNode.objects.select_related('path', 'source_resource').get(pk=concept_id)
    user = get_user_model().objects.get(pk=user_id)
    perf = JourneyPerformance('lesson_prepare', resource_id=concept.source_resource_id,
                              concept_id=concept.id)
    try:
        session = _get_teaching_session(concept, user)
        index = min(max(0, int(objective_index)), max(0, len(session.objectives) - 1))
        objective = session.objectives[index] if session.objectives else {'id': 'objective-1', 'text': concept.title}
        perf.update(objective_id=objective.get('id', ''))
        grounding = _grounding(concept, objective)
        perf.stage('grounding')
        get_or_create_teaching_plan(session, grounding, objective_index=index, perf=perf)
        perf.stage('activity_conversion')
        session.refresh_from_db(fields=['state'])
        state = dict(session.state or {})
        requested = [key for key in state.get('lesson_prefetch_requested', []) if key != objective.get('id')]
        prepared = list(dict.fromkeys([*state.get('prepared_objectives', []), objective.get('id')]))[-8:]
        session.state = {**state, 'lesson_prefetch_requested': requested, 'prepared_objectives': prepared}
        session.save(update_fields=['state', 'last_active_at'])
    except Exception:
        logger.exception('[JOURNEY PERF] operation=lesson_prepare status=failed resource_id=%s concept_id=%s objective_index=%s',
                         concept.source_resource_id, concept.id, objective_index)
        try:
            session = TeachingSession.objects.get(user=user, concept=concept)
            state = dict(session.state or {})
            if index < len(session.objectives):
                objective_id = session.objectives[index].get('id')
                state['lesson_prefetch_requested'] = [key for key in state.get('lesson_prefetch_requested', []) if key != objective_id]
                session.state = state
                session.save(update_fields=['state', 'last_active_at'])
        except Exception:
            pass
        raise
    finally:
        perf.finish()


def queue_journey_lesson(session, objective_index):
    """Queue one objective once; later objectives remain lazy."""
    if not session.objectives or objective_index >= len(session.objectives):
        return False
    objective_id = str(session.objectives[objective_index]['id'])
    state = dict(session.state or {})
    plans = state.get('teaching_plans') or {}
    if objective_id in plans or objective_id in state.get('lesson_prefetch_requested', []):
        return False
    requested = list(dict.fromkeys([*state.get('lesson_prefetch_requested', []), objective_id]))[-2:]
    session.state = {**state, 'lesson_prefetch_requested': requested}
    session.save(update_fields=['state', 'last_active_at'])
    from django_q.tasks import async_task
    async_task('learning.tasks.prepare_journey_lesson', str(session.concept_id), session.user_id,
               objective_index, task_name=f'journey-plan:{session.concept_id}:{objective_id}')
    return True
