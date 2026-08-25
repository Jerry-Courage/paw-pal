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
    
    # Enhance query for educational content — use lighter suffix for specific topics
    query_lower = query.lower()
    has_suffix = any(kw in query_lower for kw in [
        'tutorial', 'lecture', 'explained', 'introduction', 'overview',
        'basics', 'fundamentals', 'guide', 'course', 'crash course',
    ])
    if has_suffix:
        educational_query = query
    else:
        educational_query = f"{query} explained"
    
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
    # Build a targeted search query with context
    query_parts = [section_title]
    if subject and subject.lower() not in section_title.lower():
        query_parts.append(subject)
    if resource_title:
        # Add a short form of resource title for context, skip if redundant
        short_title = resource_title[:60]
        if not any(word in section_title.lower() for word in short_title.lower().split()[:3]):
            query_parts.append(short_title)
    
    query = ' '.join(query_parts)
    
    # Use section-specific cache key to avoid cross-section pollution
    cache_key = f"{section_title}|{resource_title}|{subject}"
    key = _cache_key(cache_key)
    if key in _search_cache:
        cached = _search_cache[key]
        return cached[0] if cached else None
    
    results = search_youtube(query, max_results=3, duration_limit=900)
    
    _search_cache[key] = results
    return results[0] if results else None
