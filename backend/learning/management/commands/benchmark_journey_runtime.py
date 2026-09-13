import statistics
import time
import uuid

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext


SOURCE = ('A queue stores items until a consumer can process them. '
          'A first-in first-out queue removes the oldest stored item first. '
          'Backpressure limits producers when consumers cannot keep up.')


class Command(BaseCommand):
    help = 'Measure local deterministic Journey runtime paths without provider calls.'

    def handle(self, *args, **options):
        from library.models import Resource
        from library.pedagogical_knowledge import learner_concepts, understanding_revision
        from library.source_understanding import build_understanding
        from learning.material_grounding import grounded_objectives
        from learning.models import ConceptNode, LearningPath, TeachingSession
        from learning.teaching_plan import get_or_create_teaching_plan
        from learning.tutor_engine import deterministic_remediation, evaluate
        from learning.views import _evaluate_activity, _grounding, _objective_activities, _session_data

        user = get_user_model().objects.create_user(username=f'journey-benchmark-{uuid.uuid4().hex[:8]}')
        try:
            model = build_understanding('Queue processing', SOURCE)
            resource = Resource.objects.create(owner=user, title='Queue processing benchmark', status='ready',
                                               has_study_kit=True, source_understanding=model)
            path = LearningPath.objects.create(user=user, title='Journey runtime benchmark')
            topic = learner_concepts(model)[0]
            concept = ConceptNode.objects.create(
                path=path, title=topic['title'], source_resource=resource, order_index=0,
                knowledge_binding={'revision': understanding_revision(model), 'knowledge_ids': topic['knowledge_ids'],
                                   'concept_source': 'validated_knowledge_objects'})
            session = TeachingSession.objects.create(user=user, concept=concept, objectives=grounded_objectives(concept))
            grounding = _grounding(concept, session.objectives[0])

            with override_settings(JOURNEY_TEACHING_AI_ENABLED=False):
                get_or_create_teaching_plan(session, grounding, allow_ai=False)
                activities = _objective_activities(session, user)
                check = next(item for item in reversed(activities) if item.get('purpose') == 'check')

                def measure(label, operation, samples=12):
                    durations, queries = [], []
                    for _ in range(samples):
                        with CaptureQueriesContext(connection) as captured:
                            started = time.perf_counter()
                            operation()
                            durations.append((time.perf_counter() - started) * 1000)
                        queries.append(len(captured))
                    ordered = sorted(durations)
                    p95 = ordered[min(len(ordered) - 1, max(0, int(len(ordered) * .95) - 1))]
                    self.stdout.write(
                        f'{label}: median_ms={statistics.median(durations):.2f} p95_ms={p95:.2f} '
                        f'model_calls=0 median_queries={statistics.median(queries):.0f}')

                measure('cached_node_open', lambda: _session_data(session))

                def uncached():
                    session.state = {**session.state, 'teaching_plans': {}}
                    get_or_create_teaching_plan(session, grounding, allow_ai=False)
                measure('uncached_node_generation', uncached)
                get_or_create_teaching_plan(session, grounding, allow_ai=False)
                measure('correct_check', lambda: _evaluate_activity(concept, check, {'text': check['content']['expected_answer']}))
                measure('incorrect_check', lambda: _evaluate_activity(concept, check, {'text': 'A disconnected statement.'}))
                measure('learning_signal_check', lambda: evaluate(check, {'text': "I don't know"}))
                measure('remediation_fallback', lambda: deterministic_remediation(
                    session, session.objectives[0], check, {'text': 'A disconnected statement.'}))
                self.stdout.write('cache: cached_node_open=hit uncached_node_generation=miss remediation=base-hit')
                self.stdout.write('scope: local deterministic benchmark; production network/provider latency excluded')
        finally:
            user.delete()
