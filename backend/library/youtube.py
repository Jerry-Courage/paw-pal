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
    """Try to get transcript using youtube-transcript-api with version compatibility check."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        
        # 1. TRADITIONAL FAST PATH
        try:
            transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
            # Handle both dict (legacy) and object (2026+) formats
            return ' '.join([(t['text'] if isinstance(t, dict) else getattr(t, 'text', '')) for t in transcript_list])
        except Exception:
            # 2. FALLBACK: METADATA & LANGUAGE DETECTION
            try:
                # Handle Bound vs Unbound methods (Static vs Instance)
                # Some versions (like 2026.2.25) may require an instance if not properly patched
                api = YouTubeTranscriptApi()
                
                # Try modern method names first
                try:
                    transcript_metadata = api.list_transcripts(video_id)
                except (AttributeError, TypeError):
                    # Try 'list' attribute (seen in user diagnostic)
                    try:
                        transcript_metadata = api.list(video_id)
                    except (AttributeError, TypeError):
                        # Final resort: Class-level call
                        transcript_metadata = YouTubeTranscriptApi.list_transcripts(video_id)
                
                # High-Fidelity Language Guard: Prioritize English variants
                try:
                    # Preferred order: Manual English -> Auto-Generated English
                    transcript = transcript_metadata.find_transcript(['en', 'en-US', 'en-GB'])
                except Exception:
                    # If no English variant is found, we checks if the available tracks are reliable
                    try:
                        # Grab the list of available languages
                        available_langs = [t.language_code for t in transcript_metadata]
                        # If the ONLY available transcript is auto-generated and NOT English, 
                        # we reject it to force the high-fidelity Whisper fallback.
                        if 'hi' in available_langs and 'en' not in available_langs:
                            print(f"[Guard] Rejecting mismatched auto-transcript (hi) for {video_id} to force Whisper.")
                            return None
                    except:
                        pass
                    transcript = next(iter(transcript_metadata), None)
                    
                if transcript:
                    data = transcript.fetch()
                    # 2026+ versions use objects (FetchedTranscriptSnippet) instead of dicts
                    return ' '.join([(t['text'] if isinstance(t, dict) else getattr(t, 'text', '')) for t in data])
            except Exception as e:
                print(f"YouTube Transcript fallback failed (Hybrid Bridge Error): {e}")
                
    except Exception as e:
        print(f"YouTube Transcript library error: {e}")
            
    # 3. ADVANCED FALLBACK: Download Audio + Transcribe with Whisper
    print("Trying advanced fallback: Audio Transcription via Groq/Whisper")
    try:
        import os, tempfile, subprocess, requests
        groq_key = os.getenv('GROQ_API_KEY')
        if groq_key:
            url = f"https://www.youtube.com/watch?v={video_id}"
            import sys
            with tempfile.TemporaryDirectory() as tmpdir:
                out_tmpl = os.path.join(tmpdir, 'audio.%(ext)s')
                # Grab a tiny audio stream to stay under APIs 25MB limit and maximize speed
                cmd = [
                    sys.executable, "-m", "yt_dlp",
                    "-f", "worstaudio[ext=m4a]/worstaudio",
                    "--max-filesize", "24M",
                    "--no-playlist",
                    "-o", out_tmpl,
                    url
                ]
                print(f"Running yt-dlp for {video_id} using {sys.executable}...")
                result = subprocess.run(
                    cmd, 
                    capture_output=True, 
                    text=True, 
                    encoding='utf-8', 
                    errors='ignore',
                    timeout=120  # 2 minute safety timeout for info extraction
                )
                
                files = os.listdir(tmpdir)
                if files:
                    audio_path = os.path.join(tmpdir, files[0])
                    print(f"Transcribing {audio_path} via Groq Whisper...")
                    
                    with open(audio_path, 'rb') as audio_file:
                        res = requests.post(
                            "https://api.groq.com/openai/v1/audio/transcriptions",
                            headers={"Authorization": f"Bearer {groq_key}"},
                            files={"file": (files[0], audio_file)},
                            data={"model": "whisper-large-v3", "response_format": "text"}
                        )
                    if res.status_code == 200:
                        return res.text
                    else:
                        print(f"Whisper failed: {res.text}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Audio fallback failed: {e}")
        
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
