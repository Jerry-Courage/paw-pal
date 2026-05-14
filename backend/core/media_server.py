import os
import re
from django.http import FileResponse, Http404
from django.views.static import serve
from django.conf import settings

def range_re_match(range_header):
    """Parses the Range header. Returns (start, end) or (None, None)."""
    if not range_header:
        return None, None
    match = re.match(r'bytes=(\d+)-(\d*)', range_header)
    if not match:
        return None, None
    
    start = int(match.group(1))
    end = match.group(2)
    end = int(end) if end else None
    return start, end

def mediacors_serve(request, path, document_root=None, show_indexes=False):
    """
    Enhanced media server with CORS support and Range Request handling.
    Critical for iOS/Safari media playback stability.
    """
    fullpath = os.path.join(document_root, path)
    if not os.path.exists(fullpath):
        raise Http404("Media file not found")

    file_size = os.path.getsize(fullpath)
    range_header = request.META.get('HTTP_RANGE')
    
    # 1. Handle Range Requests
    if range_header:
        start, end = range_re_match(range_header)
        if start is not None:
            if end is None:
                end = file_size - 1
            
            # Ensure boundaries are sane
            start = max(0, min(start, file_size - 1))
            end = max(start, min(end, file_size - 1))
            
            content_length = end - start + 1
            
            # We open the file and seek to the start position
            f = open(fullpath, 'rb')
            f.seek(start)
            
            response = FileResponse(f, status=206)
            response['Content-Range'] = f'bytes {start}-{end}/{file_size}'
            response['Content-Length'] = content_length
            response['Accept-Ranges'] = 'bytes'
        else:
            # Fallback if range parsing failed
            response = FileResponse(open(fullpath, 'rb'))
    else:
        # Standard non-range request
        response = FileResponse(open(fullpath, 'rb'))

    # 2. Add CORS and Vibe Headers
    response["Access-Control-Allow-Origin"] = "*"
    response["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Range"
    response["Access-Control-Expose-Headers"] = "Content-Range, Content-Length, Accept-Ranges"
    response["X-Content-Type-Options"] = "nosniff"
    
    # 3. MIME Type Fixes (Especially for iOS)
    if path.lower().endswith('.pdf'):
        response["Content-Type"] = "application/octet-stream"
        if "Content-Disposition" in response:
            del response["Content-Disposition"]
    elif path.lower().endswith('.m4a'):
        response["Content-Type"] = "audio/mp4"
    elif path.lower().endswith('.webm'):
        response["Content-Type"] = "audio/webm"
    elif path.lower().endswith('.mp3'):
        response["Content-Type"] = "audio/mpeg"

    return response
