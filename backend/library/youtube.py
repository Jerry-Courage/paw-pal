"""
YouTube resource processor.
Extracts video metadata, description, and transcript.
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


def get_video_description(video_id: str) -> str:
    """
    Fetch video description, tags, and chapters via yt-dlp (no download).
    Used as fallback context when transcript is unavailable from cloud IPs.
    """
    try:
        import yt_dlp
        ydl_opts = {'quiet': True, 'no_warnings': True, 'skip_download': True}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(
                f'https://www.youtube.com/watch?v={video_id}',
                download=False
            )
            desc = info.get('description', '') or ''
            tags = info.get('tags', []) or []
            chapters = info.get('chapters', []) or []

            parts = []
            if desc:
                parts.append(f"VIDEO DESCRIPTION:\n{desc[:4000]}")
            if tags:
                parts.append(f"TAGS: {', '.join(tags[:30])}")
            if chapters:
                chapter_text = '\n'.join([
                    f"- {c.get('title', '')} ({int(c.get('start_time', 0))}s)"
                    for c in chapters[:30]
                ])
                parts.append(f"CHAPTERS:\n{chapter_text}")

            result = '\n\n'.join(parts)
            if result:
                print(f"[YouTube] Got description/metadata: {len(result)} chars")
            return result
    except Exception as e:
        print(f"[YouTube] Description fetch failed: {e}")
        return ''


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
    If transcript unavailable (cloud IP block), falls back to description/metadata.
    """
    video_id = extract_video_id(url)
    if not video_id:
        return {'success': False, 'error': 'Invalid YouTube URL'}

    metadata = get_video_metadata(video_id)
    transcript = get_transcript(video_id)

    # If transcript failed (cloud IP block), use description as context
    description_context = ''
    if not transcript:
        print(f"[YouTube] Transcript unavailable — fetching description as fallback context")
        description_context = get_video_description(video_id)

    # Combine transcript + description for maximum context
    combined_context = transcript or description_context or ''

    return {
        'success': True,
        'video_id': video_id,
        'title': metadata['title'],
        'author': metadata['author'],
        'thumbnail': metadata['thumbnail'],
        'transcript': combined_context,
        'has_transcript': bool(transcript),
        'has_description': bool(description_context),
        'has_context': bool(combined_context),
        'embed_url': f'https://www.youtube.com/embed/{video_id}',
    }
