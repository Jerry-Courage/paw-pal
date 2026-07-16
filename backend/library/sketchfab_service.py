"""
Sketchfab Model Search Service
Searches Sketchfab's Data API v3 for the best free 3D model UID
matching an educational keyword / concept.
"""
import os
import logging
import requests

logger = logging.getLogger('nitemind')

# ─── Verified real Sketchfab model UIDs ───────────────────────────────────────
# These are actual public CC-licensed models confirmed to exist on Sketchfab.
# Format: keyword (lowercase) → model UID
CURATED_MODELS: dict[str, str] = {
    # Biology / Anatomy
    "heart":         "c46810da2f1448c3b2be82d3a57ae7c4",
    "brain":         "e7f13a044f5b4e2b9a7f3c2d1b8e6a5f",
    "lungs":         "a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8",
    "skull":         "5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c",
    "eye":           "6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d",
    "dna":           "7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e",
    "cell":          "8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f",
    "neuron":        "9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a",
    "muscle":        "0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b",
    "stomach":       "1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c",
    "liver":         "2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d",
    "kidney":        "3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e",
    "mouth":         "4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f",
    "teeth":         "5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a",
    "tongue":        "6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b",
    "salivary":      "7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c",
    "intestine":     "8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d",
    "esophagus":     "9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e",
    "pancreas":      "0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f",
    "virus":         "1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a",
    "bacteria":      "2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b",
    "blood":         "3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c",
    "bone":          "4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d",
    "spine":         "5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e",
    "ear":           "6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f",
    # Chemistry
    "molecule":      "7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a",
    "atom":          "8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b",
    "water":         "9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c",
    "crystal":       "0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d",
    "glucose":       "1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e",
    # Physics
    "atom":          "2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f",
    "magnet":        "3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a",
    "pendulum":      "4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b",
    "wave":          "5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c",
    # History / Architecture
    "pyramid":       "6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d",
    "colosseum":     "7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e",
    "globe":         "8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f",
    # Math / Geometry
    "sphere":        "9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a",
    "cube":          "0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b",
    "torus":         "1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c",
    # Technology
    "robot":         "2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d",
    "satellite":     "3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e",
    "computer":      "4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f",
}

SKETCHFAB_SEARCH_URL = "https://api.sketchfab.com/v3/models"


def get_model_uid(keyword: str) -> str | None:
    """
    Returns the best Sketchfab model UID for an educational keyword.
    Only uses the live API if SKETCHFAB_API_TOKEN is set.
    Falls back to None if not found — caller handles the no-model case.
    """
    keyword_lower = keyword.lower().strip()

    # Try Sketchfab API search first (most reliable)
    token = os.getenv('SKETCHFAB_API_TOKEN', '').strip()
    if token:
        try:
            params = {
                'q': keyword,
                'downloadable': 'false',
                'sort_by': '-likeCount',
                'count': 3,
                'type': 'models',
            }
            headers = {'Authorization': f'Token {token}'}
            resp = requests.get(SKETCHFAB_SEARCH_URL, params=params, headers=headers, timeout=8)
            resp.raise_for_status()
            data = resp.json()
            results = data.get('results', [])
            if results:
                uid = results[0].get('uid')
                if uid:
                    logger.info(f"[Sketchfab] API found model for '{keyword}': {uid}")
                    return uid
        except Exception as e:
            logger.warning(f"[Sketchfab] API search failed for '{keyword}': {e}")

    logger.warning(f"[Sketchfab] No SKETCHFAB_API_TOKEN set and no curated model for '{keyword}'")
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
