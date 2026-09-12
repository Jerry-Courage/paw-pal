import json
from pathlib import Path
from types import SimpleNamespace

from django.test import SimpleTestCase

from library.source_understanding import (
    RELATIONSHIP_TYPES, SEMANTIC_TYPES, build_understanding, grounding_bundle,
)
from learning.material_grounding import grounded_objectives
from learning.teaching_plan import generate_teaching_plan, select_representation


FIXTURE_PATH = Path(__file__).parent / 'fixtures/domain_generalization.json'
FIXTURES = json.loads(FIXTURE_PATH.read_text(encoding='utf-8'))
RESPIRATION = (Path(__file__).parent / 'fixtures/respiration_front_matter.txt').read_text(encoding='utf-8')


def concept_for(name, model, subject):
    resource = SimpleNamespace(id=name, title=name.replace('_', ' ').title(), source_understanding=model)
    return SimpleNamespace(
        id=name, title=resource.title, summary='', description='', difficulty='medium',
        source_resource=resource, source_resource_id=name, source_section='', source_page=None,
        path=SimpleNamespace(goal=f'Understand {resource.title}', subject=subject),
    )


class DomainGeneralizationAcceptanceTests(SimpleTestCase):
    expected = {
        'respiration': ({'DEFINITION', 'PROCESS'}, 'PROCESS_FLOW'),
        'finite_differencing': ({'DEFINITION', 'FORMULA', 'WORKED_EXAMPLE'}, 'WORKED_EXAMPLE'),
        'software_architecture': ({'DEFINITION', 'ARCHITECTURE'}, 'ARCHITECTURE'),
        'literature': ({'CLAIM', 'EVIDENCE', 'QUOTATION', 'RELATIONSHIP'}, 'EVIDENCE_HIGHLIGHT'),
        'history': ({'TIMELINE_EVENT', 'CAUSE_EFFECT'}, 'TIMELINE'),
        'chemistry': ({'DEFINITION', 'DATA_TABLE', 'CAUSE_EFFECT', 'RULE'}, 'CAUSE_EFFECT'),
    }
    subjects = {
        'respiration': 'Biology', 'finite_differencing': 'Mathematics',
        'software_architecture': 'Computer Science', 'literature': 'Literature',
        'history': 'History', 'chemistry': 'Chemistry',
    }
    queries = {
        'respiration': 'gas exchange respiration',
        'finite_differencing': 'forward difference derivative',
        'software_architecture': 'client interface request',
        'literature': 'claim honesty evidence',
        'history': 'strike settlement chronology',
        'chemistry': 'reaction temperature catalyst',
    }

    def setUp(self):
        sources = {'respiration': RESPIRATION, **FIXTURES}
        self.models = {name: build_understanding(name, text) for name, text in sources.items()}

    def test_six_domains_infer_semantic_primitives_and_representations(self):
        for name, (required_types, representation) in self.expected.items():
            with self.subTest(name=name):
                model = self.models[name]
                detected = {item['semantic_type'] for item in model['knowledge']['semantic_units']}
                self.assertTrue(required_types <= detected, (name, required_types - detected, detected))
                grounding = grounding_bundle(model, self.queries[name])
                self.assertEqual(select_representation(self.subjects[name], name, grounding), representation)
                self.assertTrue(detected <= set(SEMANTIC_TYPES))
        math = self.models['finite_differencing']['knowledge']
        self.assertTrue({'f', 'x', 'h'} <= {item['symbol'] for item in math['variables']})
        self.assertIn('approximation', math['worked_examples'][0]['interpretation'])

    def test_first_teaching_arcs_vary_with_semantics(self):
        results = {}
        for name in self.expected:
            model = self.models[name]
            concept = concept_for(name, model, self.subjects[name])
            grounding = grounding_bundle(model, self.queries[name])
            items = [item for kind in ('worked_examples', 'definitions', 'processes', 'sequences', 'relationships', 'formulas', 'quotations', 'concepts', 'semantic_units')
                     for item in grounding['knowledge'].get(kind, []) if item.get('support') == 'source']
            self.assertTrue(items, name)
            target = items[0]
            objective = {'id': f'{name}-objective', 'text': self.queries[name],
                         'source_refs': target['source_refs'], 'knowledge_ids': [target['id']],
                         'source_statement': target['text']}
            plan = generate_teaching_plan(concept, objective, grounding, allow_ai=False)
            results[name] = (
                plan['recommended_representation'],
                tuple(moment['arc_phase'] for moment in plan['teaching_moments']),
                plan['teaching_moments'][-1]['interaction'],
                tuple(moment['type'] for moment in plan['teaching_moments']),
            )
        self.assertGreaterEqual(len({value[0] for value in results.values()}), 5)
        self.assertTrue(all(value[1][-1] == 'VERIFY' for value in results.values()))
        self.assertTrue(all(value[2] == 'SHORT_ANSWER' for value in results.values()))
        self.assertTrue(all(value[3][0] in {'EXPLAIN', 'DEMONSTRATE', 'VISUALIZE', 'SHOW', 'COMPARE'} for value in results.values()))
        self.assertGreaterEqual(len({value[3][0] for value in results.values()}), 3)

    def test_relationships_are_typed_and_not_only_a_topic_tree(self):
        observed = {item['relationship_type'] for model in self.models.values()
                    for item in model['knowledge']['knowledge_relationships']}
        self.assertTrue({'LEADS_TO', 'CAUSES', 'EVIDENCE_FOR', 'PRECEDES'} <= observed)
        self.assertTrue(observed <= set(RELATIONSHIP_TYPES))

    def test_document_shape_diversity(self):
        self.assertTrue(any(page['kind'] == 'slide' for page in self.models['finite_differencing']['pages']))
        self.assertTrue(self.models['finite_differencing']['knowledge']['worked_examples'])
        self.assertTrue(self.models['chemistry']['knowledge']['tables'])
        metadata = {block['category'] for page in self.models['respiration']['pages'] for block in page['blocks']}
        self.assertIn('PUBLISHER_METADATA', metadata)
        self.assertGreater(sum(len(page['instructional_text'].split()) for page in self.models['software_architecture']['pages']), 40)

    def test_subject_labels_do_not_control_representation(self):
        grounding = grounding_bundle(self.models['software_architecture'], self.queries['software_architecture'])
        choices = {select_representation(label, 'trace the data flow', grounding)
                   for label in ('Biology', 'Literature', 'History', 'Unfamiliar Domain')}
        self.assertEqual(choices, {'ARCHITECTURE'})

    def test_metadata_filtering_is_domain_independent(self):
        source = 'ECONOMIC POLICY NOTES\nAuthor: R. Vale\nPublished by Civic Press\nCopyright 2025\nInflation means a sustained rise in the general price level.\nInterest rates influence borrowing costs and aggregate demand.'
        model = build_understanding('Economics', source)
        excerpt = grounding_bundle(model, 'inflation and interest rates')['excerpt']
        self.assertNotIn('Civic Press', excerpt)
        self.assertNotIn('Author:', excerpt)
        self.assertIn('Inflation means', excerpt)

    def test_counts_depth_and_plan_length_are_data_driven(self):
        topic_counts = {len(model['topics']) for model in self.models.values()}
        hierarchy_depths = {max(item['level'] for item in model['topic_hierarchy']) for model in self.models.values()}
        self.assertGreater(len(topic_counts), 1)
        self.assertGreater(len(hierarchy_depths), 1)
        plan_lengths = set()
        for name, model in self.models.items():
            concept = concept_for(name, model, self.subjects[name])
            grounding = grounding_bundle(model, self.queries[name])
            target = next(item for kind in ('worked_examples', 'definitions', 'processes', 'sequences', 'relationships', 'formulas', 'quotations', 'concepts', 'semantic_units')
                          for item in grounding['knowledge'].get(kind, []) if item.get('support') == 'source')
            objective = {'id': f'{name}-objective', 'text': self.queries[name],
                         'source_refs': target['source_refs'], 'knowledge_ids': [target['id']],
                         'source_statement': target['text']}
            plan_lengths.add(len(generate_teaching_plan(
                concept, objective, grounding_bundle(model, self.queries[name]), allow_ai=False,
            )['teaching_moments']))
        minimal = build_understanding('Neutral note', 'Momentum means mass multiplied by velocity.')
        minimal_concept = concept_for('minimal', minimal, 'Unfamiliar Domain')
        minimal_grounding = grounding_bundle(minimal, 'momentum velocity')
        minimal_target = minimal_grounding['knowledge']['definitions'][0]
        minimal_objective = {'id': 'minimal-objective', 'text': 'momentum velocity',
                             'source_refs': minimal_target['source_refs'], 'knowledge_ids': [minimal_target['id']],
                             'source_statement': minimal_target['text']}
        plan_lengths.add(len(generate_teaching_plan(
            minimal_concept, minimal_objective, minimal_grounding, allow_ai=False,
        )['teaching_moments']))
        self.assertEqual(plan_lengths, {2})

    def test_acceptance_phrases_are_not_special_cases_in_production(self):
        production = '\n'.join(path.read_text(encoding='utf-8') for path in (
            Path(__file__).parent / 'teaching_plan.py',
            Path(__file__).parents[1] / 'library/source_understanding.py',
            Path(__file__).parents[1] / 'ai_assistant/youtube_search.py',
        )).casefold()
        for phrase in ('respiration', 'invisible servants', 'finite differenc', 'mara slipped', 'dock workers'):
            self.assertNotIn(phrase, production)

    def test_fixture_titles_cannot_change_inference(self):
        text = FIXTURES['software_architecture']
        first = build_understanding('software_architecture', text)
        renamed = build_understanding('Botany field notes', text)
        first_types = [item['semantic_type'] for item in first['knowledge']['semantic_units']]
        renamed_types = [item['semantic_type'] for item in renamed['knowledge']['semantic_units']]
        self.assertEqual(first_types, renamed_types)
        self.assertEqual(
            select_representation('Computer Science', 'trace flow', grounding_bundle(first, 'trace flow')),
            select_representation('Botany', 'trace flow', grounding_bundle(renamed, 'trace flow')),
        )
