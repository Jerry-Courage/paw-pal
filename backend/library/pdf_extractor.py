"""
PDF text and image extraction using PyMuPDF (fitz).
Provides high-fidelity content for FlowState Study Kits.
Extracts ALL pages of text and significant images for comprehensive coverage.
"""
import os
import io
import logging
from typing import Dict, List, Any

logger = logging.getLogger('flowstate')

# Minimum image dimensions to avoid tiny icons/bullets
MIN_IMAGE_WIDTH = 80
MIN_IMAGE_HEIGHT = 80


def extract_pdf_content(file_path: str = None, file_bytes: bytes = None, max_pages: int = 500) -> Dict[str, Any]:
    """
    Extract text, images, and Table of Contents (TOC) from a PDF file.
    Accepts either a local file_path or raw file_bytes (for S3 storage).
    Returns: {
        'text': str,
        'images': [{'page': int, 'data': bytes, 'ext': str, 'width': int, 'height': int}],
        'page_images': [{'page': int, 'data': bytes}],  # FULL PAGE IMAGES FOR VISION OCR
        'toc': [{'level': int, 'title': str, 'page': int}],
        'page_count': int
    }
    """
    content = {'text': '', 'images': [], 'page_images': [], 'toc': [], 'page_count': 0}
    text_parts = []

    try:
        import fitz  # PyMuPDF
        if file_bytes:
            doc = fitz.open("pdf", file_bytes)
        elif file_path:
            doc = fitz.open(file_path)
        else:
            raise ValueError("Either file_path or file_bytes must be provided")
        total_pages = len(doc)
        content['page_count'] = total_pages
        pages_to_read = min(total_pages, max_pages)
        
        # 1. Extract TOC (Structural Map)
        try:
            toc = doc.get_toc()
            content['toc'] = [{'level': t[0], 'title': t[1], 'page': t[2]} for t in toc]
        except Exception as e:
            logger.warning(f'TOC extraction failed: {e}')

        logger.info(f'Extracting PDF: {total_pages} total pages, reading {pages_to_read}')

        seen_xrefs = set()  # Avoid duplicate images across pages

        for i in range(pages_to_read):
            page = doc[i]

            # 2. Extract text with high-fidelity markers
            page_text = page.get_text()
            if page_text.strip():
                text_parts.append(f'\n[PAGE_{i + 1}_START]\n{page_text}\n[PAGE_{i + 1}_END]')
            
            # 2b. Capture high-resolution full-page image for Vision OCR fallback
            try:
                pix = page.get_pixmap(matrix=fitz.Matrix(3, 3)) # 3x zoom (300DPI equivalent) for superior OCR
                content['page_images'].append({'page': i + 1, 'data': pix.tobytes('png')})
            except Exception as e:
                logger.warning(f'Page snapshot failed on {i+1}: {e}')

            # 3. Extract meaningful images (limit to prevent bloat)
            image_list = page.get_images(full=True)
            imgs_on_page = 0
            for img in image_list:
                if imgs_on_page >= 5: 
                    break
                try:
                    xref = img[0]
                    if xref in seen_xrefs:
                        continue
                    seen_xrefs.add(xref)

                    base_image = doc.extract_image(xref)
                    w = base_image.get('width', 0)
                    h = base_image.get('height', 0)

                    # Filter out logos/bullets
                    if w < MIN_IMAGE_WIDTH or h < MIN_IMAGE_HEIGHT:
                        continue

                    content['images'].append({
                        'page': i + 1,
                        'data': base_image['image'],
                        'ext': base_image['ext'],
                        'width': w,
                        'height': h,
                    })
                    imgs_on_page += 1
                except Exception as e:
                    logger.warning(f'Image extraction skipped on page {i + 1}: {e}')

        content['text'] = '\n'.join(text_parts)
        doc.close()
        logger.info(f'Extracted: {len(content["text"])} chars, {len(content["toc"])} TOC entries, {len(content["images"])} images')

    except ImportError:
        logger.warning('PyMuPDF (fitz) not installed. PDF power limited.')
    except Exception as e:
        logger.error(f'Critical PDF extraction error: {e}')

    return content


def extract_pdf_text(file_path: str = None, file_bytes: bytes = None, max_pages: int = 500) -> str:
    """Legacy wrapper for backward compatibility."""
    res = extract_pdf_content(file_path=file_path, file_bytes=file_bytes, max_pages=max_pages)
    return res['text']
