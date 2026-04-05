import os
import sys
import django
import time
import concurrent.futures

# Set up Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from ai_assistant.image_service import generate_ai_image

def measure_parallel_vision():
    prompts = [
        "Interactive diagram human heart anatomy", # Hit Lexica
        "3D render medical drone flying in hospital", # Hit Pollinations
        "Abstract futuristic GI tract visualization", # Hit Horde
        "Microscopic red cells with oxygen molecules" # Hit Lexica
    ]
    
    print("\n🚀 --- FINAL PARALLEL BENCHMARK (Batch of 4) ---")
    start_total = time.time()
    
    # We use a wrapper to capture individual times
    def timed_generate(p):
        s = time.time()
        res = generate_ai_image(p)
        e = time.time()
        return res, e - s

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        future_to_prompt = {executor.submit(timed_generate, p): p for p in prompts}
        
        for future in concurrent.futures.as_completed(future_to_prompt):
            p = future_to_prompt[future]
            try:
                res, duration = future.result()
                status = "✅ SUCCESS" if res and res.startswith("data:image") else "❌ FAILED"
                print(f"[{status}] Prompt: '{p[:25]}...' (Took {duration:.2f}s)")
            except Exception as e:
                print(f"❌ ERROR: {e}")

    end_total = time.time()
    print(f"\n⏱️  TOTAL WALL-CLOCK BATCH TIME: {end_total - start_total:.2f} seconds")
    print(f"Previously (Sequential): ~60.00 seconds")
    print(f"Speedup: {((60 - (end_total - start_total)) / 60) * 100:.1f}% faster.")

if __name__ == "__main__":
    measure_parallel_vision()
