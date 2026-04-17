import os
from django.conf import settings
from django.http import FileResponse, JsonResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from library.models import Resource, PodcastSession
from .podcast import generate_podcast_script, generate_tts_file, handle_interruption, SUPPORTED_VOICES
import threading
import hashlib
import re
import io

def dialogue_bouncer(text):
    """Surgically strips visual prompts or instructions leaking into spoken text."""
    if not text: return ""
    # Remove patterns like [Visual: ...], (Image: ...), [visual_prompt: ...], etc.
    text = re.sub(r'\[.*?visual.*?\]', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\(.*?visual.*?\)', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\[.*?image.*?\]', '', text, flags=re.IGNORECASE)
    # Remove stage directions or third-person narration fragments like (laughs), *pauses*, etc.
    text = re.sub(r'\(.*?\)', '', text)
    text = re.sub(r'\*.*?\*', '', text)
    # Filter out common AI-leaking third-person descriptions
    text = re.sub(r'^(Host [AB]|Christopher|Jenny|Aria|Guy):?\s+', '', text, flags=re.IGNORECASE)
    return text.strip()

def bg_generate_script(session_id, notes):
    try:
        from library.models import ResourceImage, PodcastSession
        from .image_service import generate_ai_image, get_fallback_image
        log_path = os.path.join(settings.BASE_DIR, 'podcast_debug.log')
        session = PodcastSession.objects.get(id=session_id)
        resource = session.resource
        
        # 1. Identity Extraction
        def get_clean_name(voice_id):
            if not voice_id: return "Host"
            parts = voice_id.split('-')
            if len(parts) >= 3:
                return parts[2].replace('Neural', '')
            return "Host"

        name_a = get_clean_name(session.voice_a)
        name_b = get_clean_name(session.voice_b)

        # 2. Pre-generate 'Instant Interjections'
        safe_res = str(resource.id)
        safe_ses = str(session.id)
        out_dir = os.path.join(settings.MEDIA_ROOT, 'podcasts', safe_res, safe_ses)
        os.makedirs(out_dir, exist_ok=True)
        generate_tts_file(f"Oh! Looks like we have a question!", session.voice_a, os.path.join(out_dir, "Stop-A.mp3"))
        generate_tts_file(f"Wait! Someone wants to say something!", session.voice_b, os.path.join(out_dir, "Stop-B.mp3"))
        
        with open(log_path, 'a') as f:
            f.write(f"[INIT] Humanoid Interjections generated in {out_dir}\n")

        # 3. Fetch visuals
        images = ResourceImage.objects.filter(resource=resource).values('id', 'page_number', 'description', 'image')
        image_list = list(images)
        
        # 4. Generate script text (Instant)
        # Use None for system_instruction to trigger the Humanoid Naturalism default in podcast.py
        script = generate_podcast_script(
            notes, 
            available_images=image_list,
            name_a=name_a,
            name_b=name_b,
            system_instruction=None
        )

        if not script or not isinstance(script, list):
            session.status = 'error'
            session.save()
            with open(log_path, 'a') as f: f.write("\n[SIGNAL] Script generation failed or returned invalid type.\n")
            return

        # 5. DIALOGUE BOUNCER & SEQUENTIAL VISUALS
        visual_count = 0
        max_visuals = 5
        
        cleaned_script = []
        for i, chunk in enumerate(script):
            # 5.5. TYPE SAFETY SHIELD: Skip chunks that aren't valid dialogue objects
            if not isinstance(chunk, dict):
                continue
                
            # Clean text of any leaks using the universal bouncer
            raw_text = chunk.get('text') or chunk.get('line') or chunk.get('content') or ''
            chunk['text'] = dialogue_bouncer(raw_text)
            
            # 5.6. VISUAL MAPPING: Connect visual_ref IDs to actual image URLs
            v_ref = chunk.get('visual_ref')
            if v_ref:
                match = next((img for img in image_list if str(img['id']) == str(v_ref)), None)
                if match and match.get('image'):
                    # Use absolute URL for the image
                    image_path = match['image']
                    if not image_path.startswith('http'):
                        api_root = getattr(settings, 'API_URL', 'http://localhost:8000').rstrip('/')
                        media_url = settings.MEDIA_URL.strip('/')
                        img_path = image_path.lstrip('/')
                        # Building absolute URL without double/triple slashes
                        chunk['visual_url'] = f"{api_root}/{media_url}/{img_path}"
                    else:
                        chunk['visual_url'] = image_path

            # (5.7 was removed - consolidated into 5.8 for cleaner logic)

            # Auto-skip chunks with literally no spoken dialogue to prevent 500 edge-tts errors
            if not chunk['text'].strip():
                if chunk.get('visual_url') and len(cleaned_script) > 0:
                    if not cleaned_script[-1].get('visual_url'):
                        cleaned_script[-1]['visual_url'] = chunk['visual_url']
                continue
            
            # Generate MD5 Fingerprint for Audio Sync
            import hashlib
            f_hash = hashlib.md5(chunk['text'].strip().encode('utf-8')).hexdigest()
            chunk['audio_hash'] = f_hash
            
            cleaned_script.append(chunk)

        # 5.8. DYNAMIC VISUAL GENERATION (HF Fallbacks):
        # Instead of cycling, generate relevant images for segments that lack them OR
        # if the AI provided a specific 'visual_prompt' (which overrides generic refs).
        # 5.8. FAST READY SIGNAL: Save script and mark ready before long visual/audio generation
        session.script_chunks = cleaned_script
        session.status = 'ready'
        session.save()

        # 5.9. DYNAMIC VISUAL GENERATION (Parallel Background):
        import concurrent.futures
        
        # 1. IDENTIFY THE TARGETS (Max 4 visuals to generate)
        ai_gen_count = 0
        max_ai_gen = 4
        targets = [] # List of (index, prompt)
        
        last_url = None
        consecutive_same_url = 0
        
        for idx, chunk in enumerate(cleaned_script):
            if ai_gen_count >= max_ai_gen: break
            
            current_url = chunk.get('visual_url')
            if current_url and current_url == last_url:
                consecutive_same_url += 1
            else:
                consecutive_same_url = 0
            last_url = current_url
            
            has_specific_prompt = bool(chunk.get('visual_prompt'))
            is_stagnated = (consecutive_same_url >= 6 and idx > 0)
            
            if has_specific_prompt or not current_url or is_stagnated:
                gen_prompt = chunk.get('visual_prompt')
                if not gen_prompt:
                    dialogue = chunk.get('text', '')
                    gen_prompt = f"Educational illustration related to: {dialogue[:120]}..."
                
                targets.append((idx, gen_prompt))
                ai_gen_count += 1
                consecutive_same_url = 0
                last_url = "PENDING" # Stop subsequent segments from being 'stagnated' during target selection

        # 2. DEFINE THE PARALLEL WORKER
        def task_gen_image(i, p):
            try:
                res_url = generate_ai_image(p)
                if res_url:
                    cleaned_script[i]['visual_url'] = res_url
                    # INCREMENTAL SAVE: Real-time update for the player
                    session.script_chunks = cleaned_script
                    session.save()
                    return True
            except Exception as e:
                with open(log_path, 'a') as f: f.write(f"[SIGNAL] AI Visual Gen Failed for segment {i}: {str(e)}\n")
            return False

        # 3. EXECUTE PARALLEL (Non-blocking but we wait for them to start)
        if targets:
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
                # We use list() to ensure they are all submitted before moving to TTS
                list(executor.map(lambda x: task_gen_image(*x), targets))

        # 7. ASYNC AUDIO GENERATION (TTS) - Sequential 
        def generate_segment_audio(text, voice, res_id, ses_id, h):
            try:
                out_dir = os.path.join(settings.MEDIA_ROOT, 'podcasts', str(res_id), str(ses_id))
                os.makedirs(out_dir, exist_ok=True)
                f_path = os.path.join(out_dir, f"{h}.mp3")
                if not os.path.exists(f_path):
                    # We import here to ensure freshness in the background thread
                    from .podcast import generate_tts_file
                    generate_tts_file(text, voice, f_path)
            except Exception as e:
                with open(os.path.join(settings.BASE_DIR, 'podcast_error.log'), 'a') as f:
                    f.write(f"\nTTS Worker Error: {str(e)}")

        for chunk in cleaned_script:
            # --- SPEAKER MAPPING SHIELD ---
            # Ensures that names like "Jenny" or "Christopher" are correctly mapped back to B and A
            s_val = str(chunk.get('speaker', 'A')).upper()
            if 'B' in s_val or name_b.upper() in s_val:
                v_id = session.voice_b
            else:
                v_id = session.voice_a
            # --- END SHIELD ---
            
            generate_segment_audio(chunk['text'], v_id, session.resource.id, session.id, chunk['audio_hash'])

    except Exception as e:
        import traceback
        with open(os.path.join(settings.BASE_DIR, 'podcast_error.log'), 'w') as f:
            f.write(f"--- PODCAST ERROR REPORT ---\n{traceback.format_exc()}")
        session.status = 'error'
        session.save()



class PodcastInitView(APIView):
    def post(self, request, resource_id):
        # Create the podcast session
        try:
            resource = Resource.objects.get(id=resource_id, owner=request.user)
        except Resource.DoesNotExist:
            return Response({'error': 'Resource not found'}, status=status.HTTP_404_NOT_FOUND)

        voice_a = request.data.get('voice_a', 'Ava')
        voice_b = request.data.get('voice_b', 'Andrew')

        session = PodcastSession.objects.create(
            resource=resource,
            owner=request.user,
            voice_a=SUPPORTED_VOICES.get(voice_a, SUPPORTED_VOICES['Ava']),
            voice_b=SUPPORTED_VOICES.get(voice_b, SUPPORTED_VOICES['Andrew']),
            status='generating',
            script_chunks=[]
        )

        # Kick off background dialogue generator
        notes = resource.ai_notes_json
        pref_length = request.data.get('length', 15)
        
        # Log the attempt
        with open(os.path.join(settings.BASE_DIR, 'podcast_debug.log'), 'a') as f:
            f.write(f"\n[INIT] Starting podcast for resource {resource_id} with length {pref_length}\n")

        t = threading.Thread(target=bg_generate_script, args=(session.id, notes))
        t.start()

        return Response({'session_id': session.id, 'status': session.status})

class PodcastStatusView(APIView):
    def get(self, request, session_id):
        try:
            session = PodcastSession.objects.get(id=session_id, owner=request.user)
        except PodcastSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=404)

        safe_res = str(session.resource.id)
        safe_ses = str(session.id)
        base_url = f"{settings.MEDIA_URL}podcasts/{safe_res}/{safe_ses}/"

        # Check if interjections exist before returning URLs
        inter_a_path = os.path.join(settings.MEDIA_ROOT, 'podcasts', safe_res, safe_ses, "Stop-A.mp3")
        inter_b_path = os.path.join(settings.MEDIA_ROOT, 'podcasts', safe_res, safe_ses, "Stop-B.mp3")

        inter_urls = {}
        api_root = getattr(settings, 'API_URL', 'http://localhost:8000').rstrip('/')
        if os.path.exists(inter_a_path):
            inter_urls['A'] = f"{api_root}{base_url}Stop-A.mp3"
        if os.path.exists(inter_b_path):
            inter_urls['B'] = f"{api_root}{base_url}Stop-B.mp3"

        return Response({
            'status': session.status,
            'chunks_total': len(session.script_chunks),
            'script': session.script_chunks,
            'interjection_urls': inter_urls
        })



class PodcastChunkAudioView(APIView):
    def get(self, request, session_id, chunk_index):
        # Fetches or dynamically generates the chunk audio file
        try:
            session = PodcastSession.objects.get(id=session_id, owner=request.user)
        except PodcastSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=404)
            
        script = session.script_chunks
        if chunk_index >= len(script):
            return Response({'error': 'Chunk out of bounds'}, status=404)
            
        chunk = script[chunk_index]
        speaker_id = session.voice_a if chunk.get('speaker', 'A') == 'A' else session.voice_b
        
        safe_res = str(session.resource.id)
        safe_ses = str(session.id)
        out_dir = os.path.join(settings.MEDIA_ROOT, 'podcasts', safe_res, safe_ses)
        os.makedirs(out_dir, exist_ok=True)
        
        # Use an MD5 hash of the chunk's text to ensure prefetch caching doesn't break interruptions
        text_content = dialogue_bouncer(chunk.get('text', ''))
        if not text_content:
            text_content = "..." # Fallback for empty chunks to prevent edge-tts 500
            
        file_hash = hashlib.md5(text_content.encode('utf-8')).hexdigest()
        file_path = os.path.join(out_dir, f"{file_hash}.mp3")
        
        if not os.path.exists(file_path):
            success = generate_tts_file(text_content, speaker_id, file_path)
            if not success:
                return Response({'error': 'TTS failed'}, status=500)
                
        return FileResponse(open(file_path, 'rb'), content_type='audio/mpeg')

class PodcastInterruptView(APIView):
    def post(self, request, session_id):
        try:
            session = PodcastSession.objects.get(id=session_id, owner=request.user)
        except PodcastSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=404)
            
        # 1. Receive the audio blob (MediaRecorder .webm) from frontend
        audio_file = request.FILES.get('audio')
        chunk_index = int(request.data.get('current_index', 0))
        
        if not audio_file:
            return Response({'error': 'No audio blob provided'}, status=400)
            
        # 2. Transcribe via Groq Whisper API
        import requests
        groq_key = os.getenv('GROQ_API_KEY')
        
        # LOG: STT Start
        log_path = os.path.join(settings.BASE_DIR, 'podcast_debug.log')
        with open(log_path, 'a') as f: 
            f.write(f"\n[INTERRUPT] Session {session_id} - Audio Size: {audio_file.size} bytes\n")
        
        try:
            # We use io.BytesIO to ensure we have a clean stream for requests
            audio_data = audio_file.read()
            audio_io = io.BytesIO(audio_data)
            
            res = requests.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {groq_key}"},
                files={"file": ('interrupt.webm', audio_io)},
                data={"model": "whisper-large-v3", "response_format": "text"},
                timeout=20
            )
            
            if res.status_code != 200:
                with open(log_path, 'a') as f: f.write(f"[INTERRUPT] STT Failed (Status {res.status_code}): {res.text}\n")
                return Response({'error': 'STT Transcription failed'}, status=500)
                
            user_query = res.text.strip()
            with open(log_path, 'a') as f: f.write(f"[INTERRUPT] Transcribed Query: \"{user_query}\"\n")
            
            if not user_query:
                # Early exit if we heard nothing to prevent Guru from hallucinating an answer to silence
                return Response({'status': 'success', 'transcribed_query': '', 'bridge_length': 0, 'script': session.script_chunks})

        except Exception as e:
            with open(log_path, 'a') as f: f.write(f"[INTERRUPT] STT Exception: {str(e)}\n")
            return Response({'error': 'STT Exception'}, status=500)
        
        print("User raised hand and asked:", user_query)
        
        # 3. Identify names and visuals
        from library.models import ResourceImage
        images = ResourceImage.objects.filter(resource=session.resource).values('id', 'page_number', 'description', 'image')
        image_list = list(images)
        
        # Identify names
        def get_clean_name(voice_id):
            parts = voice_id.split('-')
            if len(parts) >= 3:
                return parts[2].replace('Neural', '')
            return "Host"

        name_a = get_clean_name(session.voice_a)
        name_b = get_clean_name(session.voice_b)

        # 3.5. Extract full material text for the 'Answer Guru'
        full_material = ""
        try:
            notes = session.resource.ai_notes_json
            if isinstance(notes, dict) and 'sections' in notes:
                for s in notes['sections']:
                    full_material += f"{s.get('title', '')}: {s.get('content', '')}\n"
        except Exception:
            full_material = str(session.resource.ai_notes_json)

        script = session.script_chunks
        bridge = handle_interruption(
            user_query, 
            script, 
            chunk_index, 
            full_material=full_material,
            available_images=image_list,
            name_a=name_a,
            name_b=name_b
        )
        
        with open(log_path, 'a') as f: 
            f.write(f"[INTERRUPT] Guru Response Type: {type(bridge)} - Count: {len(bridge) if isinstance(bridge, list) else 'N/A'}\n")

        # 3.7. VISUAL MAPPING (Guru)
        # Connect visual_ref IDs to actual image URLs or generate one via AI
        from .image_service import generate_ai_image, get_fallback_image
        if isinstance(bridge, list):
            for chunk in bridge:
                if not isinstance(chunk, dict): continue
                
                v_ref = chunk.get('visual_ref')
                if v_ref:
                    match = next((img for img in image_list if str(img['id']) == str(v_ref)), None)
                    if match and match.get('image'):
                        image_path = match['image']
                        if not image_path.startswith('http'):
                            api_root = getattr(settings, 'API_URL', 'http://localhost:8000').rstrip('/')
                            chunk['visual_url'] = f"{api_root}{settings.MEDIA_URL}{image_path}"
                        else:
                            chunk['visual_url'] = image_path

                if chunk.get('visual_prompt') and not chunk.get('visual_url'):
                    # SKIP synchronous AI generation for interruptions to achieve sub-second response times.
                    # The host will speak while remaining on the current slide or show a focus state.
                    pass

        # 3.8. PRE-WARM AUDIO: Serialized Background Rendering
        if isinstance(bridge, list) and len(bridge) > 0:
            def serialized_prewarm(chunks, v_a, v_b, n_b, res_id, ses_id):
                try:
                    import hashlib, time
                    out_dir = os.path.join(settings.MEDIA_ROOT, 'podcasts', str(res_id), str(ses_id))
                    os.makedirs(out_dir, exist_ok=True)
                    
                    for chunk in chunks:
                        if not isinstance(chunk, dict): continue
                        
                        # CLEAN AND SIGN every Guru chunk before rendering
                        raw_text = chunk.get('text') or chunk.get('line') or chunk.get('content') or ''
                        chunk_text = dialogue_bouncer(raw_text)
                        if not chunk_text.strip(): continue

                        # Identifying Voice (Shield Logic)
                        s_val = str(chunk.get('speaker', 'A')).upper()
                        v_id = v_b if ('B' in s_val or n_b.upper() in s_val) else v_a
                        
                        h = hashlib.md5(chunk_text.strip().encode('utf-8')).hexdigest()
                        f_path = os.path.join(out_dir, f"{h}.mp3")
                        
                        if not os.path.exists(f_path):
                            # Sequential generation prevents 503 errors
                            generate_tts_file(chunk_text, v_id, f_path)
                            time.sleep(0.3) # Avoid throttling
                except Exception as e:
                    with open(log_path, 'a') as f: f.write(f"[PREWARM-FATAL] {str(e)}\n")

            threading.Thread(
                target=serialized_prewarm, 
                args=(bridge, session.voice_a, session.voice_b, name_b, session.resource.id, session.id)
            ).start()

        # 4. Splice the bridge into the script immediately after current_index
        if isinstance(bridge, list) and len(bridge) > 0:
            # We use a combined list slice to ensure atomicity in the session.script_chunks update
            new_script_full = script[:chunk_index + 1] + list(bridge) + script[chunk_index + 1:]
            session.script_chunks = new_script_full
            session.save()
            # Log for server verification
            print(f"Guru Brain inserted {len(bridge)} chunks. New total: {len(new_script_full)}")
        else:
            print("Guru Brain warning: No bridge generated or bridge was not a list.")
            new_script_full = script
        
        # 5. Tell the frontend to advance to the immediate next chunk (the bridge)
        return Response({
            'status': 'success',
            'transcribed_query': user_query,
            'bridge_length': len(bridge),
            'new_total': len(new_script_full),
            'script': new_script_full # RETURN THE UPDATED SCRIPT
        })
