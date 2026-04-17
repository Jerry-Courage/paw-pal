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
    
    # Matching the NEW 8k chunk size used in production
    text = ""
    for c in r.ai_concepts:
        if 'extracted_text' in c:
            text = c['extracted_text']
            break
            
    # Chunk 1 (0 to 8000)
    snippet = text[0:8000]
    
    prompt = (
        f"You are creating a FlowAI Study Kit. Analyze PART 1 of '{r.title}'.\n\n"
        f"Content Snippet:\n{snippet}\n\n"
        "Return ONLY a JSON object (STRICT JSON, no markdown outside the block, no unescaped quotes):\n"
        "- 'overview': {\"title\": str, \"icon\": emoji, \"summary\": str}\n"
        "- 'sections': [{\"icon\": emoji, \"title\": str, \"content\": str, \"page_refs\": [int], \"mermaid_diagram\": str}]\n"
        "  STRICT CONTENT RULES: Use **bold** for key terms. For formulas, use standard LaTeX ($$ for blocks, $ for inline). "
        "  content MUST be a single string. NEVER put a list or object inside 'content'. Escapes all internal quotes.\n"
        "- 'vocabulary': [{\"term\": str, \"definition\": str}]\n"
        "- 'exam_tips': [str]\n"
    )
    
    print("Requesting AI Response for 8k Chunk...")
    raw = ai.chat([{'role': 'user', 'content': prompt}], max_tokens=4096)
    
    # Save the RAW text to see punctuation/structure
    with open('res_26_raw_8k.txt', 'w', encoding='utf-8') as f:
        f.write(raw)
    
    # Try PARSING it with the current production _parse_json logic
    parsed = ai._parse_json(raw, {"ERROR": "Parsing Failed"})
    
    with open('res_26_parsed_8k.json', 'w', encoding='utf-8') as f:
        json.dump(parsed, f, indent=2, ensure_ascii=False)
        
    print(f"SUCCESS: Raw and Parsed files created.")
    print(f"SECTION COUNT IN PARSED: {len(parsed.get('sections', []))}")

except Exception as e:
    print(f"FAILED: {e}")
