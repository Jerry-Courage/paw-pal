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
        keyword,                          # exact keyword first
        f"{keyword} anatomy",
        f"{keyword} 3d model",
        f"{keyword} biology",
        f"{keyword} science",
    ]

    for query in queries:
        try:
            resp = requests.get(
                SKETCHFAB_SEARCH_URL,
                params={
                    'q': query,
                    'sort_by': '-relevance',
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

                # Good match: keyword word appears in model name or tags
                if any(w in name or w in tags for w in keyword_words):
                    logger.info(f"[Sketchfab] '{keyword}' matched '{model.get('name')}' ({uid})")
                    return uid

            # If no strong match, return the first non-blocked result
            for model in results:
                uid = model.get('uid', '')
                name = (model.get('name') or '').lower()
                if uid and uid not in BLOCKED_UIDS:
                    if not any(bad in name for bad in ['tokyo', 'littlest', 'street scene']):
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
        "&ui_vr=0"
        "&ui_fullscreen=1"
        "&ui_annotations=0"
        "&camera=0"
    )
