# Full AI service test with correct model
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
import django
django.setup()

from ai_assistant.services import AIService

ai = AIService()
print(f"Model: {ai.model}")
print(f"Key: {ai.api_key[:20]}...\n")

# Test 1: Basic chat
print("=== TEST 1: Basic Chat ===")
reply = ai.chat([{"role": "user", "content": "Say exactly: FLOWSTATE_AI_WORKING"}])
print(f"Reply: {reply}\n")

# Test 2: Study nudge
print("=== TEST 2: Study Nudge ===")

class FakeUser:
    first_name = "Felix"
    username = "felix"

nudge = ai.generate_study_nudge(FakeUser(), ["Neural Networks", "Linear Algebra"])
print(f"Nudge: {nudge}\n")

# Test 3: Flashcard generation
print("=== TEST 3: Flashcard Generation ===")

class FakeResource:
    title = "Introduction to Neural Networks"
    subject = "Computer Science"
    ai_concepts = []
    ai_summary = ""

cards = ai.generate_flashcards(FakeResource(), count=3, level="undergrad")
print(f"Generated {len(cards)} flashcards:")
for i, c in enumerate(cards, 1):
    print(f"  {i}. Q: {c.get('question', '?')[:60]}")
    print(f"     A: {c.get('answer', '?')[:60]}")
print()

# Test 4: Quiz generation
print("=== TEST 4: Quiz Generation (MCQ) ===")
questions = ai.generate_quiz(FakeResource(), "mcq", "undergrad", 2)
print(f"Generated {len(questions)} questions:")
for i, q in enumerate(questions, 1):
    print(f"  {i}. {str(q)[:100]}")
print()

# Test 5: Summarize
print("=== TEST 5: Summarize Resource ===")
summary = ai.summarize_resource(FakeResource())
print(f"Summary: {summary[:200]}...\n")

print("=== ALL AI TESTS COMPLETE ===")
