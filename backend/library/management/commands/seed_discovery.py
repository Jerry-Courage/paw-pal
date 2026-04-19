import json
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction
from library.models import Resource, Flashcard, Quiz

User = get_user_model()

class Command(BaseCommand):
    help = 'Seeds the library with curated academic materials and associated tool data.'

    def handle(self, *args, **options):
        # 1. Ensure Curator exists
        curator, created = User.objects.get_or_create(
            username='flowstate_curator',
            defaults={
                'email': 'curator@flowstate.ai',
                'first_name': 'FlowState',
                'last_name': 'Curator'
            }
        )
        if created:
            curator.set_unusable_password()
            curator.save()
            self.stdout.write(self.style.SUCCESS('Created curator user.'))

        # 2. Ensure Imperial Superuser exists
        admin_pass = 'AdminFlow2026!'
        admin, created = User.objects.get_or_create(
            username='AdminFlow',
            defaults={
                'email': 'admin@flowstate.ai',
                'is_staff': True,
                'is_superuser': True
            }
        )
        if created:
            admin.set_password(admin_pass)
            admin.save()
            self.stdout.write(self.style.SUCCESS(f'Created Superuser: AdminFlow | Password: {admin_pass}'))
        else:
            self.stdout.write(self.style.WARNING('Superuser AdminFlow already exists.'))

        # 3. Load harvested data
        # Data is embedded to ensure portability to Render
        harvest_data = {
            "resources": [
                {
                    "local_id": 72,
                    "title": "General Relativity: Space-Time and the Fabric of Gravity",
                    "resource_type": "video",
                    "url": "https://www.youtube.com/watch?v=tzQC3uYL67U",
                    "subject": "Physics",
                    "ai_summary": "An exhaustive 13-chapter masterclass on Albert Einstein's greatest achievement. This guide takes you from the Equivalence Principle to the Einstein Field Equations, the geometry of curved space, and the fascinating physics of Black Holes and Gravitational Waves.",
                    "ai_notes_json": {
                        "mind_map": {
                            "center": "General Relativity",
                            "branches": [
                                {"topic": "Foundations", "subtopics": ["Equivalence Principle", "Special Relativity Context", "Unified Spacetime"]},
                                {"topic": "Physics of Gravity", "subtopics": ["Space-Time Curvature", "Geodesics", "Field Equations"]},
                                {"topic": "Cosmic Effects", "subtopics": ["Time Dilation", "Gravitational Lensing", "Black Holes"]}
                            ]
                        },
                        "overview": {
                            "title": "General Relativity: Geometry and Gravitation",
                            "summary": "General Relativity is the study of how mass and energy warp the fabric of space and time. This kit explores the mathematical and physical logic of a universe where gravity is not a force, but geometry itself."
                        }
                    },
                    "ai_concepts": [{"title": "Event Horizon", "explanation": "The boundary around a black hole beyond which nothing can escape."}],
                    "has_study_kit": True,
                    "author_name": "Science-Phile x FlowAI",
                    "is_public": True
                },
                {
                    "local_id": 71,
                    "title": "Bioenergetics: The Complete Krebs Masterclass",
                    "resource_type": "video",
                    "url": "https://www.youtube.com/watch?v=juM2ROSLWfw",
                    "subject": "Biology",
                    "ai_summary": "An exhaustive biochemical investigation into Cellular Respiration. This resource covers the thermodynamics, stoichiometry, and enzymatic regulation of the Citric Acid Cycle with pre-med-level precision.",
                    "ai_notes_json": {
                        "mind_map": {
                            "center": "Bioenergetics",
                            "branches": [
                                {"topic": "The Portal Step", "subtopics": ["Pyruvate to Acetyl-CoA", "Mitochondrial Matrix", "Enzyme Gatekeepers"]},
                                {"topic": "Cycle Dynamics", "subtopics": ["Citrate Synthesis", "Oxidative Decarboxylation", "Oxaloacetate Regen"]},
                                {"topic": "Energy Output", "subtopics": ["3x NADH", "1x FADH2", "1x ATP/GTP"]}
                            ]
                        }
                    },
                    "ai_concepts": [{"title": "Thermodynamics", "explanation": "The study of energy transfer that determines the forward direction of biochemical pathways."}],
                    "has_study_kit": True,
                    "author_name": "Khan Academy x BioMed Collective",
                    "is_public": True
                },
                {
                    "local_id": 70,
                    "title": "Quantum Mechanics: The Analytical Deep-Dive",
                    "resource_type": "video",
                    "url": "https://www.youtube.com/watch?v=JhHMJCUmq28",
                    "subject": "Physics",
                    "ai_summary": "The definitive analytical guide to Quantum Theory. This exhaustive resource covers the mathematical derivations of the wavefunction and the physical logic of quantum entanglement.",
                    "ai_notes_json": {
                        "mind_map": {
                            "center": "Quantum Mechanics",
                            "branches": [
                                {"topic": "Wave Theory", "subtopics": ["Wave-Particle Duality", "Schrödinger Equation", "Probability Density"]},
                                {"topic": "Subatomic Reality", "subtopics": ["Heisenberg Uncertainty", "Pauli Exclusion", "Quantum Tunneling"]},
                                {"topic": "Quantum Paradoxes", "subtopics": ["Entanglement", "Superposition", "Schrödinger's Cat"]}
                            ]
                        }
                    },
                    "ai_concepts": [{"title": "Wave-Particle Duality", "explanation": "The fundamental reality that energy and matter exhibit both wave and particle characteristics."}],
                    "has_study_kit": True,
                    "author_name": "Kurzgesagt x Max Planck Institute",
                    "is_public": True
                },
                {
                    "local_id": 69,
                    "title": "Deep Learning: The Analytical Masterclass",
                    "resource_type": "video",
                    "url": "https://www.youtube.com/watch?v=aircAruvnKk",
                    "subject": "Computer Science",
                    "ai_summary": "The comprehensive analytical guide to modern Artificial Intelligence. Exploring the mathematical derivations of backpropagation and the architectural evolution of transformers.",
                    "ai_notes_json": {
                        "mind_map": {
                            "center": "Deep Learning",
                            "branches": [
                                {"topic": "Neural Foundations", "subtopics": ["Artificial Neurons", "Activation Functions", "Loss Functions"]},
                                {"topic": "Architectures", "subtopics": ["CNNs (Vision)", "RNNs (Sequential)", "Transformers"]},
                                {"topic": "Training", "subtopics": ["Backpropagation", "Gradient Descent", "Regularization"]}
                            ]
                        }
                    },
                    "ai_concepts": [],
                    "has_study_kit": True,
                    "author_name": "3Blue1Brown x FlowAI Research",
                    "is_public": True
                }
            ],
            # We'll use a representative set of flashcards and quizzes per resource for the seeder
            "flashcards": [
                {"res_id": 72, "q": "What is the 'Equivalence Principle'?", "a": "Gravity and acceleration are indistinguishable.", "subj": "Physics"},
                {"res_id": 71, "q": "What molecule enters the Krebs Cycle?", "a": "Acetyl-CoA", "subj": "Biology"},
                {"res_id": 70, "q": "What is Quantum Entanglement?", "a": "Spooky action at a distance connecting particles.", "subj": "Physics"},
                {"res_id": 69, "q": "What is Backpropagation?", "a": "Calculus engine for AI learning.", "subj": "AI"}
            ],
            "quizzes": [
                 {
                    "res_id": 72,
                    "title": "General Relativity Mastery Quiz",
                    "questions": [
                        {"question": "Who developed General Relativity?", "options": ["Einstein", "Newton"], "answer": "Einstein"}
                    ]
                 }
            ]
        }

        with transaction.atomic():
            id_map = {}
            for res in harvest_data["resources"]:
                resource, created = Resource.objects.update_or_create(
                    url=res['url'],
                    defaults={
                        'owner': curator,
                        'title': res['title'],
                        'resource_type': res['resource_type'],
                        'subject': res['subject'],
                        'ai_summary': res['ai_summary'],
                        'ai_notes_json': res['ai_notes_json'],
                        'ai_concepts': res['ai_concepts'],
                        'has_study_kit': res['has_study_kit'],
                        'author_name': res['author_name'],
                        'is_public': res['is_public'],
                        'status': 'ready'
                    }
                )
                id_map[res['local_id']] = resource
                self.stdout.write(f'{"Created" if created else "Updated"} resource: {resource.title}')

            # Seed representative flashcards for tools
            for card in harvest_data["flashcards"]:
                target_res = id_map.get(card['res_id'])
                if target_res:
                    Flashcard.objects.get_or_create(
                        resource=target_res,
                        question=card['q'],
                        defaults={
                            'owner': curator,
                            'answer': card['a'],
                            'subject': card['subj'],
                            'is_public': True
                        }
                    )

            # Seed representative quizzes for tools
            for quiz in harvest_data["quizzes"]:
                target_res = id_map.get(quiz['res_id'])
                if target_res:
                    Quiz.objects.get_or_create(
                        resource=target_res,
                        title=quiz['title'],
                        defaults={
                            'owner': curator,
                            'questions': quiz['questions'],
                            'is_public': True
                        }
                    )

        self.stdout.write(self.style.SUCCESS('Imperial Vault successfully seeded!'))
