import os
import sys
import time
import json
import django

# Setup Django context
from dotenv import load_dotenv
load_dotenv('backend/.env')

sys.path.append(os.path.join(os.getcwd(), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from library.pdf_extractor import extract_pdf_content
from ai_assistant.services import AIService

def run_pressure_test():
    pdf_path = "EBS301 CALCULUS - Units 1 and 2.pdf"
    print(f"🚀 Starting Math Matrix Pressure Test on: {pdf_path}")
    
    # 1. Extraction
    start_time = time.time()
    content = extract_pdf_content(pdf_path, max_pages=30)
    extract_time = time.time() - start_time
    print(f"✅ Extraction Complete: {len(content['text'])} chars extracted in {extract_time:.2f}s")
    
    # 2. Parallel AI Processing
    ai = AIService()
    resource_mock = type('Resource', (object,), {
        'title': 'EBS301 CALCULUS',
        'ai_summary': 'Calculus Units 1 and 2'
    })()
    
    print("🧠 Launching Parallel AI Processing (Math Matrix)...")
    ai_start = time.time()
    # Pass 'page_images' as vision_data to trigger Vision mode for scanned PDFs
    study_kit = ai.generate_study_kit(
        resource_mock, 
        context=content['text'], 
        vision_data=content['page_images']
    )
    ai_time = time.time() - ai_start
    
    print(f"🏁 AI Processing Complete in {ai_time:.2f}s!")
    if study_kit.get('overview', {}).get('title', '').startswith('[Vision Mode]'):
        print("✅ VISION MODE TRIGGERED: Scanned content successfully analyzed via AI Eyes.")
    
    # Check for Matrix Board markers (fenced math)
    math_boards = [s for s in study_kit.get('sections', []) if '```math' in (str(s.get('content', '')))]
    print(f"✨ Math Matrix Activation: {len(math_boards)} 'Digital Blackboard' units detected.")
    
    # Save a snippet for inspection
    with open('tmp_matrix_result.json', 'w') as f:
        json.dump(study_kit, f, indent=2)

if __name__ == "__main__":
    run_pressure_test()
