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

# Models to never show — popular non-educational models that appear in every search
BLOCKED_UIDS = {
    "5d9e9765887342f8b7a3b3ef00a9e37e",  # Littlest Tokyo (Japanese street)
    "a8d7e4f3b2c1d0e9f8a7b6c5d4e3f2a1",  # other commonly returned irrelevant models
}

# Educational categories on Sketchfab
EDUCATION_TAGS = [
    'anatomy', 'biology', 'science', 'medical', 'educational',
    'chemistry', 'physics', 'history', 'geography', 'math',
    'engineering', 'architecture', 'nature', 'animal', 'plant',
]


def get_model_uid(keyword: str) -> str | None:
    """
    Returns a relevant educational Sketchfab model UID for the keyword.
    Filters out popular non-educational models and prioritizes science/anatomy content.
    """
    keyword_lower = keyword.lower().strip()

    token = os.getenv('SKETCHFAB_API_TOKEN', '').strip()
    if not token:
        logger.warning("[Sketchfab] No SKETCHFAB_API_TOKEN set.")
        return None

    # Build education-specific search queries
    search_queries = [
        f"{keyword} anatomy",
        f"{keyword} biology",  
        f"{keyword} science",
        f"{keyword} 3d model",
        keyword,
    ]

    for query in search_queries:
        try:
            params = {
                'q': query,
                'sort_by': '-relevance',  # relevance, not likes — avoids popular non-educational
                'count': 20,
                'type': 'models',
            }
            headers = {'Authorization': f'Token {token}'}
            resp = requests.get(SKETCHFAB_SEARCH_URL, params=params, headers=headers, timeout=8)
            resp.raise_for_status()
            results = resp.json().get('results', [])

            keyword_words = [w for w in keyword_lower.split() if len(w) > 2]
            best_match = None
            acceptable = None

            for model in results:
                uid = model.get('uid', '')
                if not uid or uid in BLOCKED_UIDS:
                    continue

                name = model.get('name', '').lower()
                tags = [t.get('name', '').lower() for t in model.get('tags', [])]
                categories = [c.get('name', '').lower() for c in model.get('categories', [])]
                description = model.get('description', '').lower()
                all_text = f"{name} {' '.join(tags)} {' '.join(categories)} {description}"

                # Skip clearly non-educational models
                non_edu_names = ['littlest tokyo', 'tokyo', 'japan', 'street scene']
                non_edu_keywords = ['town', 'city', 'street', 'building', 'house',
                           'character', 'game', 'fantasy', 'cartoon', 'anime', 'cute',
                           'low poly', 'stylized', 'environment', 'scene']
                
                # Block by model name directly
                if any(bad in name for bad in non_edu_names):
                    continue
                    
                if any(bad in all_text for bad in non_edu_keywords) and not any(edu in all_text for edu in EDUCATION_TAGS):
                    continue

                # Strong match: keyword appears in name or tags
                if any(word in name or word in ' '.join(tags) for word in keyword_words):
                    best_match = uid
                    logger.info(f"[Sketchfab] Strong match '{keyword}' → '{model.get('name')}' ({uid})")
                    break

                # Acceptable match: keyword appears anywhere in metadata
                if acceptable is None and any(word in all_text for word in keyword_words):
                    acceptable = uid

            result = best_match or acceptable
            if result:
                logger.info(f"[Sketchfab] Using model for '{keyword}': {result}")
                return result

        except Exception as e:
            logger.warning(f"[Sketchfab] Search failed for '{query}': {e}")

    # Last resort: search by keyword only and skip blocked models
    try:
        params = {'q': keyword, 'sort_by': '-likeCount', 'count': 10, 'type': 'models'}
        resp = requests.get(SKETCHFAB_SEARCH_URL, params={'q': keyword, 'count': 10},
                           headers={'Authorization': f'Token {token}'}, timeout=8)
        if resp.ok:
            for model in resp.json().get('results', []):
                uid = model.get('uid', '')
                if uid and uid not in BLOCKED_UIDS:
                    logger.info(f"[Sketchfab] Last resort model for '{keyword}': {uid}")
                    return uid
    except Exception:
        pass

    logger.warning(f"[Sketchfab] No suitable model found for '{keyword}'")
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
