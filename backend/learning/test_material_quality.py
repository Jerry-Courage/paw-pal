from pathlib import Path
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIClient

from ai_assistant.youtube_search import video_is_relevant, video_relevance
from library.processing_status import status_payload
from library.source_understanding import build_understanding, grounding_bundle
from learning.tutor_engine import decide_action, diagnose_gap
from unittest.mock import Mock, patch
from ai_assistant.task_routing import _provider_call, run_task


RESPIRATION = (Path(__file__).parent / 'fixtures/respiration_front_matter.txt').read_text(encoding='utf-8')


class MaterialQualityTests(SimpleTestCase):
    def test_respiration_front_matter_is_never_a_teaching_topic(self):
        model = build_understanding('Respiration', RESPIRATION)
        categories = {block['category'] for page in model['pages'] for block in page['blocks']}
        self.assertTrue({'TITLE', 'AUTHOR_METADATA', 'PUBLISHER_METADATA', 'COPYRIGHT', 'TABLE_OF_CONTENTS', 'BIBLIOGRAPHY'} <= categories)
        titles = ' '.join(topic['title'] for topic in model['topics']).casefold()
        self.assertNotIn('unesco-eolss', titles)
        self.assertNotIn('dr ada mensah', titles)
        self.assertNotIn('example coast university', titles)
        self.assertNotIn('foundations of animal biology', titles)
        self.assertIn('cellular respiration', titles)
        self.assertIn('gas exchange', titles)
        self.assertEqual(model['quality']['status'], 'ready')
        self.assertGreaterEqual(model['quality']['topic_count'], 3)
        self.assertTrue(model['topic_hierarchy'])
        excerpt = grounding_bundle(model, 'gas exchange', 4)['excerpt'].casefold()
        self.assertNotIn('unesco-eolss', excerpt)
        self.assertNotIn('copyright', excerpt)

    def test_metadata_only_material_is_recoverably_uncertain(self):
        model = build_understanding('Cover', 'BOOK TITLE\nAuthor: A Person\nPublished by UNESCO-EOLSS\nCopyright 2024')
        self.assertEqual(model['quality']['status'], 'uncertain')
        self.assertTrue(model['quality']['retry']['attempted'])

    def test_topic_scores_include_every_quality_signal(self):
        model = build_understanding('Respiration', RESPIRATION)
        expected = {'relevance','support','coverage','distinctness','usefulness','metadata_likelihood','redundancy','significance','dependency_fit'}
        self.assertEqual(set(model['topics'][0]['scores']), expected)

    def test_controller_and_media_gate_use_evidence(self):
        self.assertEqual(decide_action(correct=False, attempts=1), 'RETEACH')
        self.assertEqual(decide_action(correct=False, attempts=2, current_representation='FORMULA', previous_representations=['FORMULA']), 'CHANGE_REPRESENTATION')
        self.assertEqual(decide_action(prerequisite_missing=True), 'BRIDGE_PREREQUISITE')
        self.assertFalse(video_is_relevant({'title': 'How routers forward internet packets', 'channel': 'Networking'}, 'cerebellum anatomy', 'biology'))
        self.assertFalse(video_is_relevant({'title': 'The cerebellum and motor control', 'channel': 'Biology'}, 'router packet forwarding', 'networking'))
        self.assertEqual(diagnose_gap({'text': 'respiration in frogs'}, 'Explain how gas exchange differs'), 'named_topic_without_explanation')

    def test_observed_media_drift_cases_have_diagnostic_rejections(self):
        cases = [
            ({'title': 'TP-Link WiFi Router Review', 'channel': 'Home Networking'}, 'Internal vs External Respiration', 'subject_domain_mismatch'),
            ({'title': 'The Cerebellum and Motor Control', 'channel': 'Neuroscience'}, 'Body Surface Respiration', 'topic_semantic_mismatch'),
            ({'title': 'Spectrum Router Troubleshooting', 'channel': 'Internet Help'}, 'Breathing regulation', 'subject_domain_mismatch'),
        ]
        for video, topic, reason in cases:
            self.assertEqual(video_relevance(video, topic, 'Biology'), (False, reason))

    def test_respiration_fallback_is_a_compact_arc_with_a_specific_check(self):
        from learning.material_grounding import grounded_objectives
        from learning.teaching_plan import generate_teaching_plan
        model = build_understanding('Respiration', RESPIRATION)
        resource = SimpleNamespace(id='resource', title='Respiration', source_understanding=model)
        concept = SimpleNamespace(id='gas', title='Gas Exchange', summary='', description='', difficulty='medium',
            source_resource=resource, source_resource_id='resource', source_section='Gas Exchange', source_page=4,
            path=SimpleNamespace(goal='Understand respiration', subject='Biology'))
        objective = grounded_objectives(concept)[0]
        grounding = grounding_bundle(model, objective['text'], 4, 'Gas Exchange')
        plan = generate_teaching_plan(concept, objective, grounding, allow_ai=False)
        self.assertEqual(plan['version'], 3)
        self.assertEqual([item['arc_phase'] for item in plan['teaching_moments']], ['HOOK', 'IDEA', 'CONNECT', 'VERIFY'])
        self.assertEqual(plan['teaching_moments'][-1]['interaction'], 'SHORT_ANSWER')
        self.assertIn('Gas exchange', plan['teaching_moments'][-1]['content']['prompt'])
        self.assertTrue(all(len(item['content'].get('body', '')) < 500 for item in plan['teaching_moments']))

    @patch('ai_assistant.task_routing.requests.post')
    def test_source_understanding_uses_bounded_failover_timeout(self, post):
        post.return_value.raise_for_status.side_effect = TimeoutError('provider stalled')
        service = SimpleNamespace(_groq_keys=lambda: ['configured'], api_key='', base_url='')
        with self.assertRaises(TimeoutError):
            _provider_call(service, {'provider': 'groq', 'model': 'fixture'}, [], 20, task='SOURCE_UNDERSTANDING')
        self.assertEqual(post.call_args.kwargs['timeout'], (5, 18))

    @override_settings(AI_TASK_ROUTES={'SOURCE_UNDERSTANDING': [
        {'provider': 'groq', 'model': 'primary'}, {'provider': 'google', 'model': 'fallback'},
        {'provider': 'openrouter', 'model': 'last-resort'}]})
    @patch('ai_assistant.task_routing._provider_call', side_effect=[TimeoutError('primary stalled'), '{"accepted": true}'])
    def test_source_understanding_advances_to_next_provider_after_timeout(self, provider_call):
        result = run_task(SimpleNamespace(), [{'role': 'user', 'content': 'source'}],
                          'SOURCE_UNDERSTANDING', validator=lambda raw: __import__('json').loads(raw))
        self.assertEqual(result, {'accepted': True})
        self.assertEqual([call.args[1]['provider'] for call in provider_call.call_args_list], ['groq', 'google'])
        self.assertTrue(all(call.kwargs['task'] == 'SOURCE_UNDERSTANDING' for call in provider_call.call_args_list))


class ResourceStatusTests(TestCase):
    def test_lightweight_status_and_ready_semantics(self):
        from library.models import Resource
        user = get_user_model().objects.create_user(username='status-user')
        resource = Resource.objects.create(owner=user, title='Material', status='processing', processing_progress=100)
        payload = status_payload(resource)
        self.assertEqual(payload['progress'], 99)
        self.assertEqual(payload['stage'], 'ENRICHMENT')
        self.assertFalse(payload['ready'])
        resource.status, resource.has_study_kit = 'ready', True
        resource.save(update_fields=['status', 'has_study_kit'])
        client = APIClient(); client.force_authenticate(user)
        response = client.get(f'/api/library/resources/{resource.id}/status/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {'id','status','progress','stage','ready','error','message'})
        self.assertEqual(response.data['stage'], 'JOURNEY_READY')

    def test_event_stream_accept_header_is_supported(self):
        user = get_user_model().objects.create_user(username='stream-user')
        client = APIClient(); client.force_authenticate(user)
        response = client.get('/api/library/resources/status-stream/', HTTP_ACCEPT='text/event-stream')
        self.assertEqual(response.status_code, 200)
        response.close()

    def test_journey_preview_returns_recoverable_quality_state(self):
        from library.models import Resource
        from library.source_understanding import build_understanding
        user = get_user_model().objects.create_user(username='quality-user')
        resource = Resource.objects.create(owner=user, title='Cover', source_understanding=build_understanding('Cover', 'BOOK TITLE\nAuthor: A Person\nPublished by UNESCO-EOLSS\nCopyright 2024'))
        client = APIClient(); client.force_authenticate(user)
        response = client.post('/api/learning/paths/generate-preview/', {'goal': 'Learn it', 'resources': [resource.id], 'depth': 'standard'}, format='json')
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data['error'], 'material_understanding_uncertain')
        self.assertTrue(response.data['recoverable'])
