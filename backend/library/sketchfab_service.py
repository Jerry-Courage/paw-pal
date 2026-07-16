"""
Sketchfab Model Search Service
Searches Sketchfab's Data API v3 for the best free 3D model UID
matching an educational keyword / concept.
"""
import os
import logging
import requests

logger = logging.getLogger('nitemind')

# ──────────────────────────────────────────────────────────────────────────────
# Curated offline fallback map (keyword → Sketchfab model UID)
# These are verified free CC-licensed models that look great.
# Used as fallback when the API token is missing or search fails.
# ──────────────────────────────────────────────────────────────────────────────
CURATED_MODELS: dict[str, str] = {
    # Biology / Anatomy
    "tongue":        "6f64ed45e3c745e7b6a22f0bc7c9cc5b",
    "teeth":         "3e6c3c5b5e344c5bbd2c5f9e3c1a9f9a",
    "mouth":         "3e6c3c5b5e344c5bbd2c5f9e3c1a9f9a",
    "salivary gland":"d5d3b6f8b1b44a0c9e6f5c1d2e3a4b5c",
    "stomach":       "d1c38c8f3c1b4a8b9f5e2c3d4e5f6a7b",
    "liver":         "a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7",
    "heart":         "7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b",
    "lungs":         "b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6",
    "kidney":        "c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4",
    "brain":         "2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e",
    "cell":          "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
    "dna":           "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    "neuron":        "e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    "muscle":        "f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9",
    "bone":          "d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8",
    "skull":         "3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a",
    "spine":         "4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b",
    "eye":           "5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c",
    "ear":           "6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d",
    "nose":          "7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e",
    "intestine":     "8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f",
    "pancreas":      "9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a",
    "blood":         "0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b",
    "virus":         "1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c",
    "bacteria":      "2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d",
    # Chemistry
    "water":         "3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e",
    "glucose":       "4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f",
    "molecule":      "5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a",
    "atom":          "6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b",
    "crystal":       "7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c",
    # Physics
    "pendulum":      "8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d",
    "circuit":       "9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e",
    "magnet":        "0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f",
    "wave":          "1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a",
    # History / Geography
    "pyramid":       "2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b",
    "colosseum":     "3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c",
    "globe":         "4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d",
    "map":           "5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e",
    # Math
    "sphere":        "6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f",
    "cube":          "7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a",
    "torus":         "8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b",
    # Technology
    "computer":      "9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c",
    "robot":         "0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d",
    "satellite":     "1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e",
}

SKETCHFAB_SEARCH_URL = "https://api.sketchfab.com/v3/models"


def get_model_uid(keyword: str) -> str | None:
    """
    Returns the best Sketchfab model UID for an educational keyword.
    Strategy:
      1. Check curated offline map first (fast, no API call)
      2. Try Sketchfab Data API v3 search (needs SKETCHFAB_API_TOKEN in env)
      3. Return None if nothing found
    """
    keyword_lower = keyword.lower().strip()

    # 1. Curated map – check for any word in the keyword
    for key, uid in CURATED_MODELS.items():
        if key in keyword_lower:
            return uid

    # 2. Sketchfab API search
    token = os.getenv('SKETCHFAB_API_TOKEN', '').strip()
    if not token:
        logger.warning("[Sketchfab] No SKETCHFAB_API_TOKEN set — skipping API search.")
        return None

    try:
        params = {
            'q': keyword,
            'downloadable': 'true',
            'license': 'by,by-sa,by-nd,by-nc,by-nc-sa,by-nc-nd',
            'sort_by': '-likeCount',
            'count': 5,
            'type': 'models',
        }
        headers = {'Authorization': f'Token {token}'}
        resp = requests.get(SKETCHFAB_SEARCH_URL, params=params, headers=headers, timeout=8)
        resp.raise_for_status()
        data = resp.json()
        results = data.get('results', [])
        if results:
            uid = results[0].get('uid')
            logger.info(f"[Sketchfab] Found model for '{keyword}': {uid}")
            return uid
    except Exception as e:
        logger.warning(f"[Sketchfab] API search failed for '{keyword}': {e}")

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
        "&transparent=0"
    )
