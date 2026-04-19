import logging
from django.conf import settings
from django.core.files.base import ContentFile

logger = logging.getLogger('flowstate')

def create_vector_embeddings(resource, text):
    if not text or len(text.strip()) < 50:
        return
    try:
        try:
            from langchain_text_splitters import RecursiveCharacterTextSplitter
        except ImportError:
            from langchain_text_splitters import RecursiveCharacterTextSplitter
        
        from langchain_huggingface import HuggingFaceEmbeddings
        from library.models import DocumentChunk
        
        logger.info(f'[RAG] Initializing Embeddings model for {resource.id}...')
        embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
        
        logger.info(f'[RAG] Splitting {len(text)} chars for {resource.id}...')
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len
        )
        chunks = text_splitter.split_text(text)
        
        logger.info(f'[RAG] Generating {len(chunks)} vectors...')
        vector_data = embeddings.embed_documents(chunks)
        
        doc_chunks = []
        for i, chunk_text in enumerate(chunks):
            doc_chunks.append(DocumentChunk(
                resource=resource,
                text_content=chunk_text,
                embedding=vector_data[i]
            ))
            
        DocumentChunk.objects.bulk_create(doc_chunks)
        logger.info(f'[RAG] Successfully saved {len(doc_chunks)} vectors to Database.')
    except Exception as e:
        logger.error(f'[RAG Error] Failed to generate vectors for {resource.id}: {str(e)}')


def process_resource_task(res_id):
    """
    Background worker task to extract content and trigger AI study kit generation.
    Supports PDF, DOCX, TXT, and YouTube videos.
    """
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
                            res_img = ResourceImage(resource=res, page_number=img_data['page'])
                            image_name = f"res_{res.id}_p{img_data['page']}_{img_data.get('width',0)}x{img_data.get('height',0)}.{img_data['ext']}"
                            res_img.image.save(image_name, ContentFile(img_data['data']), save=False)
                            res_img.save()
                            
                            image_objs.append({
                                'img': res_img,
                                'data': img_data['data'],
                                'page': img_data['page'],
                                'ext': img_data['ext'],
                                'is_large': img_data.get('width', 0) > 250 and img_data.get('height', 0) > 250
                            })

                        def get_desc(item):
                            if item['is_large']:
                                try:
                                    ai = AIService()
                                    desc = ai.describe_image_for_notes(item['data'], item['page'], item['ext'])
                                    item['img'].description = desc
                                    item['img'].save()
                                    return desc
                                except:
                                    return ""
                            return ""

                        # Parallelize descriptions to save time
                        try:
                            with ThreadPoolExecutor(max_workers=5) as executor:
                                list(executor.map(get_desc, image_objs))
                        except RuntimeError:
                            # Catch interpreter shutdown errors during reloads
                            logger.info("[Task Queue] Parallel execution interrupted by shutdown.")
                        except Exception as e:
                            logger.error(f"[Task Queue] Thread pool error: {e}")
                            
                        # Build the multi-image map
                        for item in image_objs:
                            if item['page'] not in page_image_map:
                                page_image_map[item['page']] = []
                            page_image_map[item['page']].append({
                                'url': item['img'].image.url,
                                'description': item['img'].description or f"Illustration on page {item['page']}"
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

                # Trigger Vectorization for RAG
                res.status = 'vectorizing'
                res.save()
                create_vector_embeddings(res, text)
                
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

    except Exception as e:
        logger.error(f'[Task Queue] Critical abort processing resource {res_id}: {e}')
        try:
            res = Resource.objects.get(id=res_id)
            res.status = 'ready' # Reset to ready so user can at least see the file
            res.save()
        except:
            pass

def heartbeat_task():
    """
    Diagnostic task to verify worker health in logs.
    """
    import datetime
    logger.info(f'[Heartbeat] Worker Healthy at {datetime.datetime.now().isoformat()}')
