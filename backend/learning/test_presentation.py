from types import SimpleNamespace

from django.test import SimpleTestCase

from learning.presentation import build_teaching_object, classify_presentation, decide_teaching_representation, grounded_distractors


class JourneyPresentationTests(SimpleTestCase):
    def concept(self, title='A useful idea'):
        return SimpleNamespace(id='c1', title=title, difficulty='easy', path=SimpleNamespace(goal='Understand it'))

    def test_classifies_comparison(self): self.assertEqual(classify_presentation('Compare mechanical vs chemical digestion'), 'COMPARISON')
    def test_classifies_formula(self): self.assertEqual(classify_presentation('Use the formula x = y + 1'), 'FORMULA')
    def test_classifies_sequence(self): self.assertEqual(classify_presentation('Food travels from mouth to stomach'), 'SEQUENCE')
    def test_classifies_cause_effect(self): self.assertEqual(classify_presentation('Why chewing leads to more surface area'), 'CAUSE_EFFECT')
    def test_classifies_relationship_before_structure(self):
        self.assertEqual(classify_presentation('The heart has two sides: one sends blood to the lungs while the other sends it to the body'), 'RELATIONSHIP')
    def test_classifies_algorithm_as_process(self): self.assertEqual(classify_presentation('Use the bisection algorithm to refine the interval'), 'PROCESS')
    def test_classifies_definition(self): self.assertEqual(classify_presentation('Convergence means the iterates approach a limit'), 'DEFINITION')
    def test_process_decision(self): self.assertEqual(decide_teaching_representation({'text': 'Follow the steps in this process'}, {})['primary'], 'sequence')

    def test_object_is_grounded_and_scoped(self):
        obj = build_teaching_object(self.concept(), {'id': 'o1', 'index': 0, 'text': 'Food first enters through the mouth'}, {'resource_title': 'Digestion.pdf', 'excerpt': 'Food first enters through the mouth.'}, 'p1')
        self.assertEqual(obj['objective_id'], 'o1'); self.assertEqual(obj['grounding']['resource_title'], 'Digestion.pdf')
        self.assertIn('mouth', str(obj['content']).lower())

    def test_process_object_has_steps(self):
        obj = build_teaching_object(self.concept(), {'id': 'o1', 'text': 'First food enters. Then teeth break it down. Finally it is swallowed.'}, {'excerpt': 'First food enters. Then teeth break it down. Finally it is swallowed.'}, 'p1')
        self.assertIn(obj['type'], {'sequence', 'process'}); self.assertGreaterEqual(len(obj['content']['steps']), 2)

    def test_title_is_not_duplicated_as_first_step(self):
        obj = build_teaching_object(self.concept('Digestion'), {'id': 'o1', 'text': 'First food enters. Then teeth break it down.'}, {'excerpt': 'First food enters. Then teeth break it down.'}, 'p1')
        self.assertNotEqual(obj['title'].strip().lower(), obj['content']['steps'][0].strip().lower())

    def test_comparison_object_has_columns(self):
        obj = build_teaching_object(self.concept(), {'id': 'o1', 'text': 'Compare mechanical versus chemical digestion'}, {'excerpt': 'Mechanical digestion changes size. Chemical digestion changes molecules.'}, 'p1')
        self.assertEqual(obj['type'], 'comparison'); self.assertEqual(len(obj['content']['columns']), 2)

    def test_recent_representation_is_avoided(self):
        decision = decide_teaching_representation({'text': 'A definition is concise'}, {}, recent_representations=['concept'])
        self.assertEqual(decision['primary'], 'example')

    def test_distractors_are_grounded_not_cross_domain(self):
        options = grounded_distractors('Food first enters through the mouth')
        joined = ' '.join(options).lower()
        self.assertNotRegex(joined, r'algorithm|variable|repeatable method|exact result')
        self.assertTrue(any(word in joined for word in ('food', 'mouth')))
