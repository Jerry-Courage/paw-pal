import os
import sys
import django
import json

# SETUP
sys.path.append('c:/Users/DONEX/Downloads/Compressed/paw-pal/paw-pal/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from library.models import Resource, Flashcard, Quiz

resource_ids = [69, 70, 71, 72]
harvest = {
    'resources': [],
    'flashcards': [],
    'quizzes': []
}

resources = Resource.objects.filter(id__in=resource_ids)
for r in resources:
    harvest['resources'].append({
        'local_id': r.id,
        'title': r.title,
        'resource_type': r.resource_type,
        'url': r.url,
        'subject': r.subject,
        'ai_summary': r.ai_summary,
        'ai_notes_json': r.ai_notes_json,
        'ai_concepts': r.ai_concepts,
        'has_study_kit': r.has_study_kit,
        'author_name': r.author_name,
        'is_public': True
    })

cards = Flashcard.objects.filter(resource_id__in=resource_ids)
for c in cards:
    harvest['flashcards'].append({
        'resource_local_id': c.resource_id,
        'question': c.question,
        'answer': c.answer,
        'subject': c.subject,
        'difficulty': c.difficulty,
        'is_public': c.is_public
    })

quizzes = Quiz.objects.filter(resource_id__in=resource_ids)
for q in quizzes:
    harvest['quizzes'].append({
        'resource_local_id': q.resource_id,
        'title': q.title,
        'format': q.format,
        'questions': q.questions,
        'academic_level': q.academic_level,
        'is_public': q.is_public
    })

output_path = 'c:/Users/DONEX/.gemini/antigravity/brain/8a9d2376-edf7-404c-8e7f-b6f5629338cc/curated_full_harvest.json'
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(harvest, f, indent=2)

print(f"--- FULL HARVEST COMPLETE ---")
print(f"Resources: {len(harvest['resources'])}")
print(f"Flashcards: {len(harvest['flashcards'])}")
print(f"Quizzes: {len(harvest['quizzes'])}")
print(f"--- END HARVEST ---")
