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
                        images = pdf_data.get('images', [])
                        vision_data = pdf_data.get('page_images', [])
                        
                        for img_data in images:
                            res_img = ResourceImage(resource=res, page_number=img_data['page'])
                            image_name = f"res_{res.id}_p{img_data['page']}_{img_data.get('width',0)}x{img_data.get('height',0)}.{img_data['ext']}"
                            res_img.image.save(image_name, ContentFile(img_data['data']), save=False)
                            res_img.save()
                            page_image_map[img_data['page']] = res_img.image.url
                else:
                    logger.error(f"[Task Queue] Extraction failed for {res.id}: {extraction.get('error')}")
            except Exception as e:
                logger.error(f'[Task Queue] Document extract failed for {res.id}: {e}')

        # ─── YOUTUBE EXTRACTION ───
        elif res.resource_type == 'video' and res.url:
            try:
                from library.youtube import process_youtube_url
                yt_data = process_youtube_url(res.url)
                
                if yt_data.get('success'):
                    if not res.title or res.title == 'YouTube Video':
                        res.title = yt_data.get('title', 'YouTube Video')
                    text = yt_data.get('transcript', '')
                else:
                    logger.error(f"[Task Queue] YouTube processing failed for {res.id}")
            except Exception as e:
                logger.error(f'[Task Queue] YouTube processing failed for {res.id}: {e}')

        # ─── VECTORIZATION & AI PROCESSING ───
        if text:
            existing_concepts = [c for c in (res.ai_concepts or []) if 'extracted_text' not in c]
            res.ai_concepts = existing_concepts + [{'extracted_text': text[:80000]}]
            res.save()

            # Trigger Vectorization for RAG
            res.status = 'vectorizing'
            res.save()
            create_vector_embeddings(res, text)

            # Generate Study Kit
            res.status = 'generating'
            res.save()
            ai = AIService()
            try:
                kit = ai.generate_study_kit(
                    res,
                    context=text,
                    page_image_map=page_image_map if page_image_map else None,
                    vision_data=vision_data
                )
                res.ai_notes_json = kit
                res.has_study_kit = True
                if not res.ai_summary:
                    res.ai_summary = kit.get('overview', {}).get('summary', '')[:1000]
            except Exception as e:
                logger.error(f'[Task Queue] AI Study kit failed for {res.id}: {e}')
                # Don't fail the whole task if just the kit fails, but mark status
                res.status = 'ready' # Still ready to use even without high-end kit
                res.save()
                return

        res.status = 'ready'
        res.save()
        logger.info(f'[Task Queue] Resource {res.id} marked as ready.')

    except Exception as e:
        logger.error(f'[Task Queue] Critical abort processing resource {res_id}: {e}')
