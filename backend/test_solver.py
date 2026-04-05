import os
import django
import json
import requests
import sys

# Setup Django
sys.path.append(os.path.join(os.getcwd(), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from ai_assistant.services import AIService
from library.models import Resource

def test_math_solver():
    print("🚀 Initializing Math Matrix Solver Test...")
    ai = AIService()
    
    # Let's pick a real Calculus formula from the notes
    problem_latex = r"f'(x) = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}"
    instruction = f"Explain the mathematical logic and derivation of: {problem_latex}"
    
    print(f"📝 Testing problem: {instruction}")
    
    # Use a dummy resource context if available
    resource = Resource.objects.first()
    context = ai._get_resource_context(resource) if resource else "Calculus differentiation rules"
    
    try:
        print("🧠 Calling AI Solver (v23)...")
        solution = ai.solve_math_problem(instruction, context=context)
        
        print("\n✅ AI RESPONSE (Parsed):")
        print(json.dumps(solution, indent=2))
        
        if solution.get('final_answer') == 'Unavailable':
            print("\n❌ FAIL: Solver returned 'Unavailable'. Fallback triggered.")
        else:
            print("\n✨ SUCCESS: Solver produced valid steps.")
            
    except Exception as e:
        print(f"\n💥 ERROR: {e}")

if __name__ == "__main__":
    test_math_solver()
