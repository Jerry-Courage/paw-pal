import logging
from django.conf import settings
from django.core.files.base import ContentFile

logger = logging.getLogger('flowstate')

def create_vector_embeddings(resource, text):
    if not text or len(text.strip()) < 50:
        return
    try:
        from langchain.text_splitter import RecursiveCharacterTextSplitter
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
        logger.info(f'[RAG] Successfully saved {len(doc_chunks)} vectors to Supabase.')
    except Exception as e:
        logger.error(f'[RAG Error] Failed to generate vectors for {resource.id}: {str(e)}')

def process_resource_task(res_id):
    """
    Background worker task to extract PDF text, images, and trigger AI study kit generation.
    Completely decoupled from the main request thread to allow heavy AI processing.
    """
    try:
        from library.models import Resource, ResourceImage
        from library.pdf_extractor import extract_pdf_content
        from ai_assistant.services import AIService
        
        res = Resource.objects.get(id=res_id)
        
        # ─── PDF EXTRACTION ───
        if res.resource_type == 'pdf' and res.file:
            try:
                # Read file bytes directly (Supports S3 remote storage where .path fails)
                file_bytes = res.file.read()
                pdf_data = extract_pdf_content(file_bytes=file_bytes)
                
                text = pdf_data['text']
                images = pdf_data.get('images', [])
                page_count = pdf_data.get('page_count', 0)
                logger.info(f'[Task Queue] Resource {res.id}: {page_count} pages, {len(images)} images extracted')

                page_image_map = {}  # {page_number: absolute_media_url}

                for img_data in images:
                    res_img = ResourceImage(
                        resource=res,
                        page_number=img_data['page']
                    )
                    image_name = f"res_{res.id}_p{img_data['page']}_{img_data.get('width',0)}x{img_data.get('height',0)}.{img_data['ext']}"
                    res_img.image.save(image_name, ContentFile(img_data['data']), save=False)
                    res_img.save()
                    page_image_map[img_data['page']] = res_img.image.url

                if text:
                    existing_concepts = [c for c in (res.ai_concepts or []) if 'extracted_text' not in c]
                    res.ai_concepts = existing_concepts + [{'extracted_text': text[:80000]}]

                if text:
                    res.status = 'vectorizing'
                    res.save()
                    create_vector_embeddings(res, text)

                res.status = 'generating'
                res.save()

                ai = AIService()
                try:
                    kit = ai.generate_study_kit(
                        res,
                        context=text or '',
                        page_image_map=page_image_map if page_image_map else None,
                        vision_data=pdf_data.get('page_images', [])
                    )
                    res.ai_notes_json = kit
                    res.has_study_kit = True
                    if not res.ai_summary:
                        res.ai_summary = kit.get('overview', {}).get('summary', '')[:1000]
                        
                except Exception as e:
                    logger.error(f'[Task Queue] AI Study kit failed for {res.id}: {e}')
                    res.status = 'failed'
                    res.save()

            except Exception as e:
                logger.error(f'[Task Queue] PDF extract failed for {res.id}: {e}')
                res.status = 'failed'
                res.save()

        # ─── YOUTUBE EXTRACTION ───
        elif res.resource_type == 'video' and res.url:
            try:
                from library.views import process_youtube_url # Import locally to avoid circular dependencies
                yt_data = process_youtube_url(res.url)
                
                if not yt_data.get('success'):
                    logger.error(f"[Task Queue] YouTube processing failed for {res.id}")
                    res.status = 'failed'
                    res.save()
                    return
                    
                if not res.title or res.title == 'YouTube Video':
                    res.title = yt_data.get('title', 'YouTube Video')
                
                ai = AIService()
                kit = ai.generate_study_kit(res, context=yt_data.get('transcript') or '')
                res.ai_notes_json = kit
                res.has_study_kit = True
                
                # ─── INJECT RAG VECTORS ───
                if yt_data.get('transcript'):
                    create_vector_embeddings(res, yt_data.get('transcript'))
                
            except Exception as e:
                logger.error(f'[Task Queue] YouTube processing failed for {res.id}: {e}')
                res.status = 'failed'
                res.save()
                return

        res.status = 'ready'
        res.save()
        logger.info(f'[Task Queue] Resource {res.id} marked as ready.')

    except Exception as e:
        logger.error(f'[Task Queue] Critical abort processing resource {res_id}: {e}')
