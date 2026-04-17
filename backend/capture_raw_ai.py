import os
import django
import json
from dotenv import load_dotenv

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
load_dotenv()
django.setup()

from library.models import Resource
from ai_assistant.services import AIService

try:
    r = Resource.objects.get(id=26)
    ai = AIService()
    
    # We simulate the exact prompt used for chunk 0
    text = ""
    for c in r.ai_concepts:
        if 'extracted_text' in c:
            text = c['extracted_text']
            break
            
    prompt = (
        f"You are creating a FlowAI Study Kit. Analyze PART 1 of '{r.title}'.\n\n"
        f"Content Snippet:\n{text[:12000]}\n\n"
        "Return ONLY a JSON object (STRICT JSON, no markdown outside the block, no unescaped quotes):\n"
        "- 'overview': {\"title\": str, \"icon\": emoji, \"summary\": str}\n"
        "- 'sections': [{\"icon\": emoji, \"title\": str, \"content\": str, \"page_refs\": [int], \"mermaid_diagram\": str}]\n"
        "  STRICT CONTENT RULES: Use **bold** for key terms. For formulas, use standard LaTeX ($$ for blocks, $ for inline). "
        "  content MUST be a single string. NEVER put a list or object inside 'content'. Escapes all internal quotes.\n"
        "- 'vocabulary': [{\"term\": str, \"definition\": str}]\n"
        "- 'exam_tips': [str]\n"
    )
    
    print("Requesting AI Response...")
    raw = ai.chat([{'role': 'user', 'content': prompt}], max_tokens=4096)
    
    with open('res_26_raw_ai.txt', 'w', encoding='utf-8') as f:
        f.write(raw)
    
    print("SUCCESS: res_26_raw_ai.txt captured.")
    print(f"RAW PREVIEW: {raw[:300]}...")
except Exception as e:
    print(f"FAILED: {e}")
