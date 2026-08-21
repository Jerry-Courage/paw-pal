"""
YouTube search module — finds educational videos for study sections.
Uses yt-dlp for search (no API key needed).
"""
import logging
import re
import hashlib

logger = logging.getLogger(__name__)

# Simple in-memory cache to avoid repeated searches
_search_cache: dict = {}


def _cache_key(query: str) -> str:
    return hashlib.md5(query.lower().strip().encode()).hexdigest()


def search_youtube(query: str, max_results: int = 3, duration_limit: int = 900) -> list:
    """
    Search YouTube for educational videos matching a query.
    Returns list of {title, url, video_id, channel, duration, thumbnail}.
    
    Args:
        query: Search query (e.g. "MOSFET pinch off explanation")
        max_results: Number of results to return (1-5)
        duration_limit: Max video duration in seconds (default 15 min)
    """
    import yt_dlp
    
    key = _cache_key(query)
    if key in _search_cache:
        return _search_cache[key][:max_results]
    
    # Enhance query for educational content
    educational_query = f"{query} tutorial explanation"
    
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'default_search': 'ytsearch',
        'extract_flat': True,
        'noplaylist': True,
        'skip_download': True,
    }
    
    results = []
    try:
        search_url = f"ytsearch{max_results * 2}:{educational_query}"
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(search_url, download=False)
            entries = info.get('entries', [])
            
            for entry in entries:
                if not entry:
                    continue
                    
                video_id = entry.get('id', '')
                title = entry.get('title', '')
                channel = entry.get('channel', '') or entry.get('uploader', '')
                duration = entry.get('duration') or 0
                
                # Filter: skip shorts, very long videos, non-educational
                if duration and (duration < 60 or duration > duration_limit):
                    continue
                
                # Boost educational channels
                is_educational = any(kw in channel.lower() for kw in [
                    'khan academy', 'mit', 'stanford', 'crash course', '3blue1brown',
                    'professor', 'lecture', 'tutorial', 'engineering', 'science',
                    'learn', 'study', 'explained', 'education', 'physics',
                    'math', 'chemistry', 'biology', 'computer', 'tech',
                ])
                
                # Boost title relevance
                title_lower = title.lower()
                has_educational_title = any(kw in title_lower for kw in [
                    'tutorial', 'lecture', 'explained', 'introduction', 'basics',
                    'fundamentals', 'concept', 'understand', 'learn', 'overview',
                    'crash course', 'deep dive', 'complete guide',
                ])
                
                score = 0
                if is_educational:
                    score += 10
                if has_educational_title:
                    score += 5
                
                thumbnail = f"https://img.youtube.com/vi/{video_id}/mqdefault.jpg"
                
                results.append({
                    'title': title,
                    'url': f"https://www.youtube.com/watch?v={video_id}",
                    'video_id': video_id,
                    'channel': channel,
                    'duration': duration,
                    'duration_str': f"{duration // 60}:{duration % 60:02d}" if duration else '',
                    'thumbnail': thumbnail,
                    'score': score,
                })
            
            # Sort by score (educational content first), then by view count proxy
            results.sort(key=lambda x: x['score'], reverse=True)
            results = results[:max_results]
            
    except Exception as e:
        logger.warning(f"[YouTube Search] Failed for '{query}': {e}")
    
    _search_cache[key] = results
    return results[:max_results]


def search_section_video(section_title: str, resource_title: str = '', subject: str = '') -> dict | None:
    """
    Search for the best YouTube video for a study section.
    Returns the best match or None.
    
    Args:
        section_title: The section/topic title (e.g. "NMOS Transistor Physical Structure")
        resource_title: The parent resource title for context
        subject: The subject area (e.g. "Electronics", "Mathematics")
    """
    # Build a targeted search query
    query_parts = [section_title]
    if subject:
        query_parts.append(subject)
    
    query = ' '.join(query_parts)
    
    results = search_youtube(query, max_results=3, duration_limit=900)
    
    if not results:
        return None
    
    # Return the best educational match
    return results[0] if results else None
