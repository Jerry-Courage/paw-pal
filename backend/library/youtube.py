"""
YouTube resource processor.
Extracts video metadata and transcript.
"""
import sys
import os
import re
import tempfile
import subprocess
import requests
from typing import Optional


def extract_video_id(url: str) -> Optional[str]:
    """Extract YouTube video ID from various URL formats."""
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com/shorts/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def get_video_metadata(video_id: str) -> dict:
    """Get video title, description, channel via oEmbed (no API key needed)."""
    try:
        res = requests.get(
            f'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json',
            timeout=10
        )
        if res.status_code == 200:
            data = res.json()
            return {
                'title': data.get('title', 'YouTube Video'),
                'author': data.get('author_name', ''),
                'thumbnail': data.get('thumbnail_url', ''),
            }
    except Exception:
        pass
    return {'title': 'YouTube Video', 'author': '', 'thumbnail': ''}


def get_transcript(video_id: str) -> Optional[str]:
    """Get transcript using youtube-transcript-api v1.2.4+ (fetch/list API)."""
    
    # 1. PRIMARY: youtube-transcript-api
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        api = YouTubeTranscriptApi()
        
        # Try fetching with English language preference first
        try:
            result = api.fetch(video_id, languages=['en', 'en-US', 'en-GB'])
            snippets = list(result)
            if snippets:
                text = ' '.join([s.text for s in snippets])
                if text.strip():
                    print(f"[YouTube] Got transcript via fetch() for {video_id}: {len(text)} chars")
                    return text
        except Exception as e:
            print(f"[YouTube] English fetch failed: {e}")
        
        # Try any available language
        try:
            result = api.fetch(video_id)
            snippets = list(result)
            if snippets:
                text = ' '.join([s.text for s in snippets])
                if text.strip():
                    print(f"[YouTube] Got transcript (any lang) for {video_id}: {len(text)} chars")
                    return text
        except Exception as e:
            print(f"[YouTube] Any-language fetch failed: {e}")

        # Try listing available transcripts
        try:
            transcript_list = api.list(video_id)
            for transcript in transcript_list:
                try:
                    result = transcript.fetch()
                    snippets = list(result)
                    if snippets:
                        text = ' '.join([s.text for s in snippets])
                        if text.strip():
                            print(f"[YouTube] Got transcript via list() for {video_id}: {len(text)} chars")
                            return text
                except Exception:
                    continue
        except Exception as e:
            print(f"[YouTube] list() failed: {e}")
                
    except ImportError:
        print("[YouTube] youtube-transcript-api not installed")
    except Exception as e:
        print(f"[YouTube] Transcript library error: {e}")
            
    # 2. FALLBACK: Download Audio + Transcribe with Groq Whisper
    print(f"[YouTube] Trying audio fallback for {video_id}...")
    try:
        groq_key = os.getenv('GROQ_API_KEY')
        if groq_key:
            url = f"https://www.youtube.com/watch?v={video_id}"
            with tempfile.TemporaryDirectory() as tmpdir:
                out_tmpl = os.path.join(tmpdir, 'audio.%(ext)s')
                cmd = [
                    sys.executable, "-m", "yt_dlp",
                    "-f", "worstaudio[ext=m4a]/worstaudio",
                    "--max-filesize", "24M",
                    "--no-playlist",
                    "-o", out_tmpl,
                    url
                ]
                print(f"[YouTube] Running yt-dlp for {video_id}...")
                result = subprocess.run(
                    cmd, capture_output=True, text=True, 
                    encoding='utf-8', errors='ignore', timeout=120
                )
                
                files = os.listdir(tmpdir)
                if files:
                    audio_path = os.path.join(tmpdir, files[0])
                    print(f"[YouTube] Transcribing {audio_path} via Groq Whisper...")
                    
                    with open(audio_path, 'rb') as audio_file:
                        res = requests.post(
                            "https://api.groq.com/openai/v1/audio/transcriptions",
                            headers={"Authorization": f"Bearer {groq_key}"},
                            files={"file": (files[0], audio_file)},
                            data={"model": "whisper-large-v3", "response_format": "text"}
                        )
                    if res.status_code == 200 and res.text.strip():
                        print(f"[YouTube] Whisper transcript: {len(res.text)} chars")
                        return res.text
                    else:
                        print(f"[YouTube] Whisper failed: {res.status_code} {res.text[:200]}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[YouTube] Audio fallback failed: {e}")
        
    return None



def process_youtube_url(url: str) -> dict:
    """
    Full processing pipeline for a YouTube URL.
    Returns metadata + transcript text for AI processing.
    """
    video_id = extract_video_id(url)
    if not video_id:
        return {'success': False, 'error': 'Invalid YouTube URL'}

    metadata = get_video_metadata(video_id)
    transcript = get_transcript(video_id)

    return {
        'success': True,
        'video_id': video_id,
        'title': metadata['title'],
        'author': metadata['author'],
        'thumbnail': metadata['thumbnail'],
        'transcript': transcript,
        'has_transcript': transcript is not None and len(transcript) > 50,
        'embed_url': f'https://www.youtube.com/embed/{video_id}',
    }
