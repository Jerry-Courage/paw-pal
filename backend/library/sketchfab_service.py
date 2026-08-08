"""
Sketchfab Model Search Service
Searches Sketchfab's Data API v3 for the best educational 3D model
matching a concept keyword. Uses relevance-sorted search with
subject-specific query boosting.
"""
import os
import logging
import requests

logger = logging.getLogger('nitemind')

SKETCHFAB_SEARCH_URL = "https://api.sketchfab.com/v3/models"

# Known non-educational models that appear in every search due to popularity
BLOCKED_UIDS = {
    "5d9e9765887342f8b7a3b3ef00a9e37e",  # Littlest Tokyo - Japanese street scene
}

# Subject domains to help bias search queries
SCIENCE_SUBJECTS = [
    'anatomy', 'biology', 'chemistry', 'physics', 'medical',
    'science', 'nature', 'space', 'geology', 'botany',
]


def get_model_uid(keyword: str) -> str | None:
    """
    Searches Sketchfab live for the best educational 3D model matching keyword.
    Uses subject-specific query variations and filters out known irrelevant models.
    """
    keyword_lower = keyword.lower().strip()
    token = os.getenv('SKETCHFAB_API_TOKEN', '').strip()
    if not token:
        logger.warning("[Sketchfab] No SKETCHFAB_API_TOKEN — cannot search.")
        return None

    headers = {'Authorization': f'Token {token}'}

    # Build search queries — most specific first
    queries = [
        f"human {keyword}",               # "human liver", "human stomach" etc
        f"{keyword} anatomy",             # "liver anatomy"
        f"{keyword} model anatomy",       # "liver model anatomy"
        keyword,                          # just the keyword
    ]

    for i, query in enumerate(queries):
        try:
            # First query: sort by likes (most popular "human liver" = high quality anatomy)
            # Subsequent queries: sort by relevance
            sort_by = '-likeCount' if i == 0 else '-relevance'

            # Add science/medical category filter for anatomy/biology topics
            params = {
                'q': query,
                'sort_by': sort_by,
                'count': 24,
                'type': 'models',
                'categories': 'science-technology',  # Sketchfab category filter
            }
            resp = requests.get(
                SKETCHFAB_SEARCH_URL,
                params=params,
                headers=headers,
                timeout=10,
            )

            # If category filter returns nothing, try without it
            if not resp.ok or not resp.json().get('results'):
                resp = requests.get(
                    SKETCHFAB_SEARCH_URL,
                    params={
                        'q': query,
                        'sort_by': sort_by,
                        'count': 24,
                        'type': 'models',
                    },
                    headers=headers,
                    timeout=10,
                )
            if not resp.ok:
                continue

            results = resp.json().get('results', [])
            keyword_words = [w for w in keyword_lower.split() if len(w) > 2]

            for model in results:
                uid = model.get('uid', '')
                if not uid or uid in BLOCKED_UIDS:
                    continue

                name = (model.get('name') or '').lower()
                tags = ' '.join(t.get('name', '').lower() for t in (model.get('tags') or []))
                description = (model.get('description') or '').lower()[:200]
                all_text = f"{name} {tags} {description}"

                # Hard block: model name contains "tokyo", "street", "city scene"
                if any(bad in name for bad in ['tokyo', 'littlest', 'street scene', 'city scene']):
                    continue

                # Score model: name match > tag match > description match
                name_matches = sum(1 for w in keyword_words if w in name)
                tag_matches = sum(1 for w in keyword_words if w in tags)
                desc_matches = sum(1 for w in keyword_words if w in description)
                total_score = name_matches * 3 + tag_matches * 2 + desc_matches

                # Require at least 2 keyword matches OR name contains the full keyword
                full_keyword_in_name = keyword_lower in name
                if total_score >= 2 or (full_keyword_in_name and name_matches >= 1):
                    logger.info(f"[Sketchfab] '{keyword}' matched '{model.get('name')}' ({uid}) score={total_score}")
                    return uid

            # Fallback: first non-blocked model with name containing the keyword
            if i > 0:
                for model in results:
                    uid = model.get('uid', '')
                    name = (model.get('name') or '').lower()
                    if uid and uid not in BLOCKED_UIDS:
                        if not any(bad in name for bad in ['tokyo', 'littlest', 'street', 'warehouse', 'interior', 'house', 'building', 'city']):
                            # Extra check: name should contain at least one keyword
                            if any(w in name for w in keyword_words):
                                logger.info(f"[Sketchfab] '{keyword}' fallback '{model.get('name')}' ({uid})")
                                return uid

        except Exception as e:
            logger.warning(f"[Sketchfab] Search error for '{query}': {e}")

    logger.warning(f"[Sketchfab] No model found for '{keyword}'")
    return None


def get_embed_url(uid: str) -> str:
    """Returns the Sketchfab iframe embed URL for a given model UID."""
    return (
        f"https://sketchfab.com/models/{uid}/embed"
        "?autostart=1"
        "&preload=1"
        "&ui_theme=dark"
        "&ui_infos=0"
        "&ui_stop=0"
        "&ui_inspector=0"
        "&ui_watermark=0"
        "&ui_ar=0"
        "&ui_help=0"
        "&ui_settings=0"
        "&ui_vr=1"
        "&ui_fullscreen=1"
        "&ui_annotations=1"
        "&annotations_visible=1"
        "&camera=0"
    )
