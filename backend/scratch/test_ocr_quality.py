import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

import io
import base64
import fitz
from ai_assistant.services import AIService
from django.conf import settings

def test_ocr():
    doc = fitz.open('Reproduction.pdf')
    page = doc[0]
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
    img_data = pix.tobytes('png')
    
    ai = AIService()
    messages = [{
        "role": "user",
        "content": [
            {"type": "text", "text": "OCR this page. Extract ALL text including diagram labels and headers. Be extremely detailed."},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64.b64encode(img_data).decode('utf-8')}"}}
        ]
    }]
    
    print("Sending to Vision API...")
    result = ai._call_vision(messages)
    print("\n--- VISION OCR RESULT ---")
    print(result)
    print("-------------------------\n")

if __name__ == '__main__':
    test_ocr()
