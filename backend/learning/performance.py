"""Safe Journey timing logs. Payload text and learner answers never enter these logs."""
import logging
import time


logger = logging.getLogger(__name__)


class JourneyPerformance:
    def __init__(self, operation, *, resource_id='', concept_id='', objective_id=''):
        self.operation = operation
        self.started = time.perf_counter()
        self.last = self.started
        self.values = {
            'resource_id': resource_id or '',
            'concept_id': concept_id or '',
            'objective_id': objective_id or '',
            'cache_hit': False,
            'provider': 'none',
            'model': 'none',
            'generation_ms': 0.0,
            'validation_ms': 0.0,
            'serialization_ms': 0.0,
        }

    def stage(self, name):
        now = time.perf_counter()
        self.values[f'{name}_ms'] = round((now - self.last) * 1000, 2)
        self.last = now

    def update(self, **values):
        self.values.update({key: value for key, value in values.items() if value is not None})

    def finish(self):
        total_ms = round((time.perf_counter() - self.started) * 1000, 2)
        self.values['total_ms'] = total_ms
        ordered = ' '.join(f'{key}={self.values[key]}' for key in sorted(self.values))
        logger.info('[JOURNEY PERF] operation=%s %s', self.operation, ordered)
        return {**self.values}
