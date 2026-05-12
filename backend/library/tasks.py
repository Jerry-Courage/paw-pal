import logging
from django.conf import settings
from django.core.files.base import ContentFile

logger = logging.getLogger('flowstate')
print("!!! IMPERIAL WORKER LOADED: tasks.py is LIVE !!!")
logger.error("!!! IMPERIAL WORKER HEARTBEAT: tasks.py initialized !!!")

def create_vector_embeddings(resource, text):
    if not text or len(text.strip()) < 50:
        return
    try:
        try:
            from langchain_text_splitters import RecursiveCharacterTextSplitter
        except ImportError:
            import sys
            logger.error(f"[RAG Task Critical] Missing Splitting package: {sys.modules.get('langchain_text_splitters')}")
            return
        
        from library.models import DocumentChunk
        from ai_assistant.services import AIService
        
        logger.info(f'[RAG] Initializing Cloud Engine for Resource {resource.id}...')
        ai = AIService()
        
        logger.info(f'[RAG] Splitting {len(text)} chars for {resource.id}...')
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len
        )
        chunks = text_splitter.split_text(text)
        
        logger.info(f'[RAG] Generating {len(chunks)} vectors via Cloud Engine...')
        # Batch in groups of 50 to respect API limits
        BATCH_SIZE = 50
        all_vectors = []
        for batch_start in range(0, len(chunks), BATCH_SIZE):
            batch = chunks[batch_start:batch_start + BATCH_SIZE]
            batch_vectors = ai.embed_text_cloud(batch, is_query=False)
            if not batch_vectors:
                logger.error(f"[RAG Error] Batch {batch_start}-{batch_start+len(batch)} failed for {resource.id}")
                # Pad with None so indices stay aligned with chunks
                all_vectors.extend([None] * len(batch))
                continue
            # Pad with None if fewer vectors returned than chunks (partial failure)
            if len(batch_vectors) < len(batch):
                batch_vectors = list(batch_vectors) + [None] * (len(batch) - len(batch_vectors))
            all_vectors.extend(batch_vectors)
            valid_count = sum(1 for v in all_vectors if v is not None)
            logger.info(f'[RAG] Embedded {valid_count}/{len(all_vectors)} chunks...')
        if not any(v is not None for v in all_vectors):
            logger.error(f"[RAG Error] Failed to generate cloud vectors for {resource.id}")
            return

        # Build doc_chunks — skip any chunk whose vector is None
        doc_chunks = []
        for chunk_text, vec in zip(chunks, all_vectors):
            if vec is not None:
                doc_chunks.append(DocumentChunk(
                    resource=resource,
                    text_content=chunk_text,
                    embedding=vec
                ))
            
        DocumentChunk.objects.bulk_create(doc_chunks)
        logger.info(f'[RAG] Successfully saved {len(doc_chunks)} cloud vectors to Database.')
    except Exception as e:
        logger.error(f'[RAG Error] Failed to generate vectors for {resource.id}: {str(e)}')


def process_resource_task(res_id):
    """
    Background worker task to extract content and trigger AI study kit generation.
    Supports PDF, DOCX, TXT, and YouTube videos.
    """
    from library.models import Resource
    res_init = Resource.objects.get(id=res_id)
    res_init.status_text = "🧬 Imperial Engine Initializing..."
    res_init.status = 'processing'
    res_init.save(update_fields=['status_text', 'status'])
    print(f"--- [TASK START] Resource {res_id} entered the Imperial processing line ---")
    
    try:
        from library.models import Resource, ResourceImage
        from library.text_extractor import extract_text_from_bytes
        from ai_assistant.services import AIService
        from django.core.files.base import ContentFile
        
        res = Resource.objects.get(id=res_id)
        text = ""
        page_image_map = {}
        vision_data = None
        total_pages = 0
        
        # ─── DOCUMENT EXTRACTION (PDF, DOCX, TXT, etc) ───
        if res.file:
            import os
            ext = os.path.splitext(res.file.name)[1].lower()
            
            try:
                res.file.open('rb')
                file_bytes = res.file.read()
                extraction = extract_text_from_bytes(file_bytes, ext)
                
                if extraction['status'] == 'success':
                    text = extraction['text']
                    
                    # Special handling for PDF images/metadata
                    if ext == '.pdf' and 'pdf_data' in extraction:
                        pdf_data = extraction['pdf_data']
                        total_pages = pdf_data.get('page_count', 0)
                        images = pdf_data.get('images', [])
                        vision_data = pdf_data.get('page_images', [])
                        
                        # High-Fidelity Cover Extraction: Use the first page of the PDF as the thumbnail
                        if vision_data and not res.cover_image:
                            try:
                                first_page = vision_data[0]
                                cover_name = f"cover_res_{res.id}.png"
                                res.cover_image.save(cover_name, ContentFile(first_page['data']), save=False)
                            except Exception as e:
                                logger.warning(f"Failed to save PDF cover for {res.id}: {e}")
                        
                        # Selective Vision: Only describe significant diagrams (> 250px) to keep generation fast
                        from concurrent.futures import ThreadPoolExecutor
                        from ai_assistant.services import AIService
                        image_objs = []
                        
                        for img_data in images:
                            import base64
                            res_img = ResourceImage(resource=res, page_number=img_data['page'])
                            # Store as base64 data URI in description so it survives redeploys
                            mime = f"image/{img_data['ext']}" if img_data['ext'] != 'jpg' else 'image/jpeg'
                            b64 = base64.b64encode(img_data['data']).decode('utf-8')
                            res_img.description = f"data:{mime};base64,{b64}"
                            res_img.save()
                            
                            image_objs.append({
                                'img': res_img,
                                'data': img_data['data'],
                                'page': img_data['page'],
                                'ext': img_data['ext'],
                                'is_large': img_data.get('width', 0) > 250 and img_data.get('height', 0) > 250
                            })

                        def get_desc(idx_item_tuple):
                            idx, item = idx_item_tuple
                            if item['is_large']:
                                try:
                                    res.status_text = f"👁️ Scanning Diagram {idx+1}/{len(image_objs)}..."
                                    res.save(update_fields=['status_text'])
                                    ai = AIService()
                                    desc = ai.describe_image_for_notes(item['data'], item['page'], item['ext'])
                                    # Don't overwrite the base64 data URI — it's stored in description
                                    # Store AI caption in page_image_map instead
                                    return desc
                                except Exception as e:
                                    logger.error(f"Image desc error: {e}")
                                    return ""
                            return ""

                        # Parallelize descriptions to save time
                        try:
                            with ThreadPoolExecutor(max_workers=5) as executor:
                                # Use enumerate to track progress count
                                list(executor.map(get_desc, enumerate(image_objs)))
                        except RuntimeError:
                            # Catch interpreter shutdown errors during reloads
                            logger.info("[Task Queue] Parallel execution interrupted by shutdown.")
                        except Exception as e:
                            logger.error(f"[Task Queue] Thread pool error: {e}")
                            
                        # Build the multi-image map using base64 data URIs
                        for item in image_objs:
                            if item['page'] not in page_image_map:
                                page_image_map[item['page']] = []
                            # Use the base64 data URI stored in description
                            img_url = item['img'].description if item['img'].description and item['img'].description.startswith('data:') else None
                            if img_url:
                                page_image_map[item['page']].append({
                                    'url': img_url,
                                    'description': f"Illustration on page {item['page']}"
                                })
                else:
                    logger.error(f"[Task Queue] Extraction failed for {res.id}: {extraction.get('error')}")
            except Exception as e:
                logger.error(f'[Task Queue] Document extract failed for {res.id}: {e}')

        # ─── YOUTUBE EXTRACTION ───
        elif res.resource_type == 'video' and res.url:
            try:
                # Progress Update: Start Extraction
                res.status_text = "🔗 Fetching video metadata..."
                res.processing_progress = 10
                res.save()
                
                from library.youtube import process_youtube_url
                yt_data = process_youtube_url(res.url)
                
                if yt_data.get('success'):
                    # HIGH-FIDELITY: Persist title and thumbnail IMMEDIATELY
                    # This allows the library UI to update while AI is still working
                    if not res.title or res.title == 'YouTube Video':
                        res.title = yt_data.get('title', 'YouTube Video')
                    
                    if yt_data.get('thumbnail'):
                        res.thumbnail_url = yt_data.get('thumbnail')
                    
                    # Save metadata now
                    res.save()
                    
                    res.status_text = "📝 Extracting transcript..."
                    res.processing_progress = 25
                    res.save()
                    
                    text = yt_data.get('transcript', '')
                    vision_data = [] # [FIX] Initialize for video frames

                    # Log what context we have
                    if text:
                        if yt_data.get('has_transcript'):
                            logger.info(f"[Task Queue] YouTube transcript: {len(text)} chars for {res.id}")
                        else:
                            logger.info(f"[Task Queue] YouTube description fallback: {len(text)} chars for {res.id}")
                            res.status_text = "📋 Using video description as context..."
                            res.save()

                    # 📸 NEW: VISUAL ANALYZER (Watching the video)
                    try:
                        res.status_text = "👁️ Analyzing video frames for slides..."
                        res.save()
                        from library.video_analyzer import VideoAnalyzer
                        visual_insights = VideoAnalyzer.extract_visual_insights(res.url)
                        
                        if visual_insights:
                            logger.info(f"[Task] Extracted {len(visual_insights)} visual insights for {res.id}")
                            for idx, insight in enumerate(visual_insights):
                                from django.core.files.base import ContentFile
                                from .models import ResourceImage
                                r_img = ResourceImage(
                                    resource=res,
                                    page_number=idx + 1,
                                    description=insight['label']
                                )
                                r_img.image.save(f"frame_{res.id}_{idx}.png", ContentFile(insight['data']), save=True)
                                
                                # Add to vision data for AI processing
                                vision_data.append({
                                    'data': insight['data'],
                                    'page': idx + 1,
                                    'label': insight['label']
                                })
                    except Exception as ve:
                        logger.error(f"[Task] Visual analysis failed for {res.id}: {ve}")

                    if not text:
                        logger.warning(f"[Task Queue] No transcript for {res.id}. Falling back to Topic-Based synthesis.")
                        res.status_text = "🔍 No transcript found; using topic/visual analysis..."
                        res.save()
                else:
                    logger.error(f"[Task Queue] YouTube processing failed for {res.id}")
            except Exception as e:
                logger.error(f'[Task Queue] YouTube processing failed for {res.id}: {e}')

        # ─── VECTORIZATION & AI PROCESSING ───
        if text or res.resource_type == 'video':
            logger.info(f"[Task Queue] Processing Study Kit for Resource {res.id} (Context size: {len(text) if text else 'TITLE-ONLY'})")
            
            if text:
                existing_concepts = [c for c in (res.ai_concepts or []) if 'extracted_text' not in c]
                res.ai_concepts = existing_concepts + [{'extracted_text': text[:300000]}]
                res.status_text = "Vectorizing content for RAG..."
                res.processing_progress = 30
                res.save()

                # Trigger Vectorization for RAG (non-blocking — embedding failures don't stop kit generation)
                res.status = 'vectorizing'
                res.save()
                try:
                    create_vector_embeddings(res, text)
                except Exception as embed_err:
                    logger.warning(f"[RAG] Embedding failed for {res.id}, skipping: {embed_err}")
                
                # Save after vectorization
                res.processing_progress = 40
                res.status_text = "🧠 Content vectorized. Starting AI synthesis..."
                res.save()
            else:
                # Skip vectorization but still mark progress for topic-based generation
                res.processing_progress = 40
                res.status_text = "🧠 Topic analysis complete. Starting AI synthesis..."
                res.save()

            # Generate Study Kit
            res.status = 'generating'
            res.save()
            
            ai = AIService()
            try:
                kit = ai.generate_study_kit(
                    res,
                    context=text,
                    page_image_map=page_image_map if page_image_map else None,
                    vision_data=vision_data,
                    page_count=total_pages
                )
                
                # SELF-HEALING RETRY: If sections are empty but text is substantial, retry once
                if not kit.get('sections') and len(text) > 1000:
                    logger.warning(f'[Task Queue] Empty sections detected for {res.id}. Retrying once with Recovery Signal...')
                    kit = ai.generate_study_kit(
                        res,
                        context=text + "\n\nCRITICAL FIX: Your previous JSON response for this material was malformed or empty. Please ensure you return a valid JSON object with detailed 'sections'.",
                        page_image_map=page_image_map if page_image_map else None,
                        vision_data=vision_data
                    )

                res.ai_notes_json = kit
                res.has_study_kit = True
                res.processing_progress = 100
                res.status_text = "Polishing complete!"
                if not res.ai_summary:
                    res.ai_summary = kit.get('overview', {}).get('summary', '')[:1000]
            except Exception as e:
                logger.exception(f'[Task Queue] AI Study kit failed for {res.id}: {e}')
                # Don't fail the whole task if just the kit fails, but mark status
                res.status = 'ready' # Still ready to use even without high-end kit
                res.save()
                return

        res.status = 'ready'
        res.save()
        logger.info(f'[Task Queue] Resource {res.id} marked as ready.')

        # ─── AUTO-GENERATE SELECTED FEATURES ───
        features = [f for f in (res.selected_features or []) if f != 'notes']
        if features:
            # Keep status as generating so SSE stays open during feature generation
            res.status = 'generating'
            res.processing_progress = 80
            res.status_text = f"⚡ Generating {', '.join(features)}..."
            res.save()
            logger.info(f'[Task Queue] Auto-generating features {features} for Resource {res.id}')
            _generate_selected_features(res, features)
            # Now truly done
            res.refresh_from_db()
            res.status = 'ready'
            res.processing_progress = 100
            res.save()

    except Exception as e:
        error_msg = str(e)
        logger.error(f'[Task Queue] Critical abort processing resource {res_id}: {error_msg}')
        try:
            res = Resource.objects.get(id=res_id)
            res.status = 'failed'
            # Check for common storage errors to provide a helpful hint
            if "AWS_ACCESS_KEY_ID" in error_msg or "SignatureDoesNotMatch" in error_msg:
                res.status_text = "❌ Failed: Storage Key Mismatch (Check GitHub Secrets)"
            elif "ConnectionError" in error_msg or "Timeout" in error_msg:
                res.status_text = "❌ Failed: Connection to Cloudflare Denied"
            else:
                res.status_text = f"❌ Failed: {error_msg[:100]}"
            res.save()
        except:
            pass

def heartbeat_task():
    """
    Diagnostic task to verify worker health in logs.
    """
    import datetime
    logger.info(f'[Heartbeat] Worker Healthy at {datetime.datetime.now().isoformat()}')


def _generate_selected_features(resource, features: list):
    """
    Auto-generate all selected features in parallel threads after study kit is ready.
    Called at the end of process_resource_task.
    """
    import threading
    from ai_assistant.services import AIService
    from library.models import Flashcard, Quiz, Deck

    ai = AIService()
    threads = []

    def gen_flashcards():
        try:
            resource.status_text = "🃏 Generating flashcards..."
            resource.save(update_fields=['status_text'])
            cards = ai.generate_flashcards(resource, count=30, level='undergrad')
            if cards and isinstance(cards, list):
                deck, _ = Deck.objects.get_or_create(
                    owner=resource.owner,
                    title=f"{resource.title} — Flashcards",
                    defaults={'subject': resource.subject or ''}
                )
                for card in cards[:40]:
                    Flashcard.objects.get_or_create(
                        deck=deck,
                        resource=resource,
                        question=card.get('question', ''),
                        defaults={
                            'answer': card.get('answer', ''),
                            'subject': resource.subject or '',
                            'difficulty': card.get('difficulty', 'medium'),
                            'owner': resource.owner,
                        }
                    )
                logger.info(f'[AutoGen] Flashcards done for {resource.id} ({len(cards)} cards)')
        except Exception as e:
            logger.error(f'[AutoGen] Flashcards failed for {resource.id}: {e}')

    def gen_quiz():
        try:
            resource.status_text = "❓ Generating quiz..."
            resource.save(update_fields=['status_text'])
            questions = ai.generate_quiz(resource, fmt='multiple_choice', level='undergrad', count=30)
            if questions and isinstance(questions, list):
                # Filter out questions missing required fields
                valid_qs = [q for q in questions if isinstance(q, dict) and q.get('question') and q.get('options')]
                if not valid_qs:
                    logger.warning(f'[AutoGen] Quiz for {resource.id}: {len(questions)} raw questions but 0 valid after filter. Sample: {str(questions[0])[:200]}')
                    valid_qs = questions  # save anyway so we can debug
                Quiz.objects.create(
                    resource=resource,
                    owner=resource.owner,
                    title=f"{resource.title} — Quiz",
                    format='mcq',
                    questions=valid_qs[:40],
                    academic_level='undergrad',
                )
                logger.info(f'[AutoGen] Quiz done for {resource.id} ({len(valid_qs)} valid questions)')
            else:
                logger.warning(f'[AutoGen] Quiz for {resource.id} returned empty/invalid: {type(questions)} len={len(questions) if isinstance(questions, list) else "N/A"}')
        except Exception as e:
            logger.error(f'[AutoGen] Quiz failed for {resource.id}: {e}', exc_info=True)

    def gen_practice():
        try:
            resource.status_text = "📝 Generating practice test..."
            resource.save(update_fields=['status_text'])
            questions = ai.generate_practice_questions(resource, difficulty='medium', count=30)
            if questions and isinstance(questions, list):
                # Store in ai_concepts as practice_questions
                existing = [c for c in (resource.ai_concepts or []) if 'practice_questions' not in c]
                resource.ai_concepts = existing + [{'practice_questions': questions[:40]}]
                resource.save(update_fields=['ai_concepts'])
                logger.info(f'[AutoGen] Practice test done for {resource.id} ({len(questions)} questions)')
        except Exception as e:
            logger.error(f'[AutoGen] Practice test failed for {resource.id}: {e}')

    def gen_mindmap():
        try:
            resource.status_text = "🗺️ Generating mind map..."
            resource.save(update_fields=['status_text'])
            mindmap = ai.generate_mind_map(resource)
            if mindmap and isinstance(mindmap, dict) and mindmap.get('center'):
                notes = resource.ai_notes_json or {}
                notes['mind_map'] = mindmap
                resource.ai_notes_json = notes
                resource.save(update_fields=['ai_notes_json'])
                logger.info(f'[AutoGen] Mind map done for {resource.id}')
            else:
                logger.warning(f'[AutoGen] Mind map for {resource.id} returned invalid structure: {str(mindmap)[:200]}')
        except Exception as e:
            logger.error(f'[AutoGen] Mind map failed for {resource.id}: {e}', exc_info=True)

    def gen_podcast():
        try:
            resource.status_text = "🎙️ Generating podcast..."
            resource.save(update_fields=['status_text'])
            from library.models import PodcastSession
            from ai_assistant.views_podcast import bg_generate_script
            notes = resource.ai_notes_json or {}
            session = PodcastSession.objects.create(
                resource=resource,
                owner=resource.owner,
                status='generating',
            )
            bg_generate_script(session.id, notes)
            logger.info(f'[AutoGen] Podcast done for {resource.id}')
        except Exception as e:
            logger.error(f'[AutoGen] Podcast failed for {resource.id}: {e}')

    feature_map = {
        'flashcards': gen_flashcards,
        'quiz': gen_quiz,
        'practice': gen_practice,
        'mindmap': gen_mindmap,
        'podcast': gen_podcast,
    }

    active = [f for f in features if f != 'notes' and f in feature_map]
    total = len(active)
    completed = [0]  # mutable counter for threads

    def wrap(fn, feat_name):
        def wrapped():
            fn()
            completed[0] += 1
            try:
                pct = 80 + int((completed[0] / total) * 18)  # 80→98%
                resource.refresh_from_db()
                resource.processing_progress = pct
                resource.status_text = f"✅ {feat_name.title()} done ({completed[0]}/{total})"
                resource.save(update_fields=['processing_progress', 'status_text'])
            except Exception:
                pass
        return wrapped

    for feat in active:
        fn = feature_map.get(feat)
        if fn:
            t = threading.Thread(target=wrap(fn, feat), daemon=True)
            threads.append(t)
            t.start()

    for t in threads:
        t.join(timeout=600)

    resource.refresh_from_db()
    resource.status_text = "✅ All features ready!"
    resource.save(update_fields=['status_text'])
    logger.info(f'[AutoGen] All features complete for {resource.id}')

