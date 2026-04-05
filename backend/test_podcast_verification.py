import os
import django
import json
import sys

# Setup Django environment
sys.path.append(os.path.join(os.getcwd(), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
try:
    django.setup()
except Exception as e:
    # Fallback if working directory is already inside backend
    sys.path.append(os.getcwd())
    django.setup()


from ai_assistant.podcast import generate_podcast_script

def verify_podcast():
    sample_notes = {
        "sections": [
            {
                "title": "The Powerhouse of the Cell",
                "content": "The mitochondria is a double-membrane-bound organelle found in most eukaryotic organisms. It generates most of the cell's supply of adenosine triphosphate (ATP)."
            }
        ]
    }
    
    sample_images = [
        {"id": 42, "page_number": 3, "description": "Highly detailed cross-section of a mitochondrion showing cristae and matrix."}
    ]
    
    print("--- GENERATING PODCAST SCRIPT ---")
    script = generate_podcast_script(
        sample_notes, 
        length_pref=5, 
        available_images=sample_images,
        name_a="Christopher",
        name_b="Jenny"
    )
    
    print(json.dumps(script, indent=2))
    
    # 1. Verify Names are used
    full_text = " ".join([s['text'] for s in script])
    if "Christopher" in full_text and "Jenny" in full_text:
        print("✅ SUCCESS: Host names 'Christopher' and 'Jenny' are used in the dialogue.")
    else:
        print("❌ FAILURE: Host names not found in dialogue.")
        
    # 2. Verify Visual Ref is used
    has_visual = any(s.get('visual_ref') == 42 for s in script)
    if has_visual:
        print("✅ SUCCESS: Visual ID 42 (Mitochondria) was correctly referenced.")
    else:
        print("❌ FAILURE: No visual_ref found for technical concept.")
        
    # 3. Verify Tone (No slang)
    slang_words = ["no cap", "vibes", "on god", "lit"]
    has_slang = any(word in full_text.lower() for word in slang_words)
    if not has_slang:
        print("✅ SUCCESS: Tone is professional. No Gen-Z slang detected.")
    else:
        print("❌ FAILURE: Tone is too casual. Slang detected.")

if __name__ == "__main__":
    verify_podcast()
