import io
import logging
from typing import Dict, Any

logger = logging.getLogger('flowstate')

def extract_text_from_bytes(file_bytes: bytes, extension: str) -> Dict[str, Any]:
    """
    Extract text from common document formats.
    Returns: {'text': str, 'status': 'success'|'error', 'error': str}
    """
    content = {'text': '', 'status': 'success'}
    
    try:
        ext = extension.lower()
        if ext == '.pdf':
            from .pdf_extractor import extract_pdf_content
            pdf_data = extract_pdf_content(file_bytes=file_bytes)
            content['text'] = pdf_data['text']
            content['pdf_data'] = pdf_data # Keep images etc for caller
        
        elif ext in ['.docx', '.doc']:
            import docx
            doc = docx.Document(io.BytesIO(file_bytes))
            full_text = []
            for para in doc.paragraphs:
                full_text.append(para.text)
            content['text'] = '\n'.join(full_text)
            
        elif ext in ['.txt', '.md', '.py', '.js', '.ts', '.css', '.html']:
            content['text'] = file_bytes.decode('utf-8', errors='ignore')

        elif ext in ['.pptx', '.ppt']:
            from pptx import Presentation
            prs = Presentation(io.BytesIO(file_bytes))
            slides_text = []
            for i, slide in enumerate(prs.slides):
                slide_parts = [f"--- Slide {i+1} ---"]
                for shape in slide.shapes:
                    if hasattr(shape, 'text') and shape.text.strip():
                        slide_parts.append(shape.text.strip())
                if len(slide_parts) > 1:
                    slides_text.append('\n'.join(slide_parts))
            content['text'] = '\n\n'.join(slides_text)
            
        else:
            content['status'] = 'error'
            content['error'] = f'Unsupported extension: {ext}'
            
    except Exception as e:
        logger.error(f'Extraction error for {extension}: {e}')
        content['status'] = 'error'
        content['error'] = str(e)
        
    return content
