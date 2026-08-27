from django.db import transaction
from django.utils import timezone

from gamification.services import RewardEngine
from .models import ConceptNode, TeachingSession, TeachingTurn


PASSING_SCORE = 70


def objective_evidence(session):
    return session.state.get('objective_evidence', {})


def record_objective_evidence(session, objective_id, *, taught=False, interaction=False,
                              score=None, source='activity', evidence_id='', misconception=''):
    valid_ids = {item['id'] for item in session.objectives}
    if objective_id not in valid_ids:
        return
    evidence = {**objective_evidence(session)}
    current = {**evidence.get(objective_id, {})}
    current['taught'] = bool(current.get('taught') or taught)
    current['interactions'] = int(current.get('interactions', 0)) + (1 if interaction else 0)
    if score is not None:
        current['best_score'] = max(int(current.get('best_score', 0)), max(0, min(100, int(score))))
    if evidence_id:
        current['evidence_ids'] = list(dict.fromkeys([*current.get('evidence_ids', []), str(evidence_id)]))[-12:]
    current['source'] = source
    if misconception:
        current['unresolved_misconception'] = misconception[:500]
    elif score is not None and int(score) >= PASSING_SCORE:
        current.pop('unresolved_misconception', None)
    evidence[objective_id] = current
    session.state = {**session.state, 'objective_evidence': evidence}


def evaluate_session_completion(session):
    evidence = objective_evidence(session)
    objective_results = []
    scores = []
    for objective in session.objectives:
        item = evidence.get(objective['id'], {})
        taught = bool(item.get('taught') or objective['id'] in session.objectives_covered)
        interacted = int(item.get('interactions', 0)) > 0
        score = int(item.get('best_score', 0))
        understood = interacted and score >= PASSING_SCORE
        misconception = item.get('unresolved_misconception', '')
        satisfied = taught and interacted and understood and not misconception
        objective_results.append({
            'id': objective['id'], 'text': objective['text'], 'taught': taught,
            'interacted': interacted, 'understood': understood, 'best_score': score,
            'unresolved_misconception': misconception, 'satisfied': satisfied,
        })
        scores.append(score)
    unresolved = [item for item in objective_results if not item['satisfied']]
    misconceptions = [item['unresolved_misconception'] for item in objective_results if item['unresolved_misconception']]
    mastery = round(sum(scores) / len(scores)) if scores else 0
    complete = bool(objective_results) and not unresolved and not misconceptions
    if complete:
        action = 'complete_concept'
    elif misconceptions:
        action = 'remediate_misconception'
    elif any(item['taught'] and not item['interacted'] for item in unresolved):
        action = 'collect_understanding_evidence'
    else:
        action = 'teach_next_objective'
    return {
        'complete': complete, 'mastery': mastery,
        'objectives_total': len(objective_results),
        'objectives_satisfied': len(objective_results) - len(unresolved),
        'objectives': objective_results,
        'unresolved_objectives': unresolved,
        'unresolved_misconceptions': misconceptions,
        'recommended_next_action': action,
    }


@transaction.atomic
def finalize_teaching_session(session_id, user):
    session = TeachingSession.objects.select_for_update().select_related('concept__path').get(id=session_id, user=user)
    concept = ConceptNode.objects.select_for_update().get(id=session.concept_id)
    evaluation = evaluate_session_completion(session)
    if session.status == 'completed' and concept.status == 'completed':
        reward = RewardEngine.process(user=user, activity_type='concept_completion', source_id=str(concept.id), context={'score': concept.mastery, 'path_id': str(concept.path_id)})
        return session, concept, evaluation, reward, []
    if not evaluation['complete']:
        session.mastery = evaluation['mastery']
        session.status = 'remediation' if evaluation['unresolved_misconceptions'] else 'teaching'
        session.save(update_fields=['mastery', 'status', 'last_active_at'])
        return session, concept, evaluation, None, []
    reward = RewardEngine.process(user=user, activity_type='concept_completion', source_id=str(concept.id), context={'score': evaluation['mastery'], 'path_id': str(concept.path_id)})
    concept.status = 'completed'
    concept.mastery = evaluation['mastery']
    concept.xp_earned = max(concept.xp_earned, reward['xp'])
    concept.save(update_fields=['status', 'mastery', 'xp_earned', 'updated_at'])
    unlocked_ids = []
    for node in ConceptNode.objects.select_for_update().filter(prerequisites=concept, status='locked').exclude(id=concept.id):
        if not node.prerequisites.exclude(status='completed').exists():
            node.status = 'current'
            node.save(update_fields=['status', 'updated_at'])
            unlocked_ids.append(str(node.id))
    session.status = 'completed'
    session.mastery = evaluation['mastery']
    session.current_point = len(session.objectives)
    session.completed_at = session.completed_at or timezone.now()
    session.save(update_fields=['status', 'mastery', 'current_point', 'completed_at', 'last_active_at'])
    if not session.turns.filter(kind='completion').exists():
        TeachingTurn.objects.create(session=session, role='flow', kind='completion', content="Yep. You've got this one.", payload={'mastery': evaluation['mastery'], 'reward': reward})
    concept.path.recalculate_progress()
    return session, concept, evaluation, reward, unlocked_ids
