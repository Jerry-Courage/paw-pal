"""
Scene Planner — AI-powered educational 3D scene generation.

Uses the existing AIService provider chain to generate SceneSpec
from FlowState study material. The AI references only assets from
the FlowState asset manifest — never arbitrary URLs.
"""

import json
import logging
import math
from typing import Any, Optional

from ai_assistant.services import AIService

logger = logging.getLogger(__name__)

# ── Asset manifest (must match frontend lib/vr/assetManifest.ts) ──────────
AVAILABLE_ASSETS = {
    'box': {
        'id': 'box',
        'name': 'Cube',
        'subject': 'general',
        'keywords': ['box', 'cube', 'test', 'placeholder'],
    },
    'heart': {
        'id': 'heart',
        'name': 'Human Heart',
        'subject': 'biology',
        'keywords': [
            'heart', 'cardiac', 'ventricle', 'atrium', 'aorta',
            'cardiovascular', 'blood pump', 'valve', 'mitral',
            'pulmonary', 'myocardium',
        ],
    },
}

# ── Layout safety constants ───────────────────────────────────────────────
MAX_POSITION = 10.0       # metres from origin
MIN_POSITION = -10.0
MAX_SCALE = 5.0
MIN_SCALE = 0.1
DEFAULT_SCALE = 1.0
MIN_OBJECT_DISTANCE = 0.4  # prevent overlap
SCENE_RADIUS = 8.0         # max distance from centre


def _available_assets_text() -> str:
    """Build a text block listing available assets for the AI prompt."""
    lines = []
    for aid, a in AVAILABLE_ASSETS.items():
        kws = ', '.join(a['keywords'][:6])
        lines.append(f'  {aid}: {a["name"]} ({a["subject"]}) — keywords: {kws}')
    return '\n'.join(lines)


def _validate_vec3(val: Any, default: dict = None) -> dict:
    """Validate a Vec3 value. Returns safe default if invalid."""
    default = default or {'x': 0, 'y': 0.8, 'z': 0}
    if not isinstance(val, dict):
        return default
    result = {}
    for axis in ('x', 'y', 'z'):
        v = val.get(axis)
        if isinstance(v, (int, float)) and math.isfinite(v):
            result[axis] = max(MIN_POSITION, min(MAX_POSITION, float(v)))
        else:
            result[axis] = default[axis]
    return result


def _validate_scale(val: Any) -> float:
    """Validate scale value."""
    if isinstance(val, (int, float)) and math.isfinite(val):
        return max(MIN_SCALE, min(MAX_SCALE, float(val)))
    return DEFAULT_SCALE


def _validate_object(obj: dict, index: int) -> dict:
    """Validate and sanitise a single scene object."""
    obj_id = obj.get('id', f'obj_{index}')
    label = obj.get('label', f'Object {index}')

    position = _validate_vec3(obj.get('position'), {'x': 0, 'y': 0.8, 'z': index * 1.5})
    rotation = _validate_vec3(obj.get('rotation'))
    scale = _validate_scale(obj.get('scale'))

    # Asset ID must be from manifest or null
    asset_id = obj.get('assetId')
    if asset_id and asset_id not in AVAILABLE_ASSETS:
        asset_id = None

    return {
        'id': str(obj_id)[:64],
        'conceptId': str(obj.get('conceptId', obj_id))[:64],
        'assetId': asset_id,
        'label': str(label)[:120],
        'description': str(obj.get('description', ''))[:500],
        'type': 'model' if asset_id else 'placeholder',
        'position': position,
        'rotation': rotation,
        'scale': scale,
        'visible': bool(obj.get('visible', True)),
        'interactive': bool(obj.get('interactive', True)),
        'color': str(obj.get('color', '#6366f1'))[:20],
    }


def _validate_scene_layout(objects: list[dict]) -> list[dict]:
    """
    Prevent object overlap by enforcing minimum distance.
    Simple O(n²) check — fine for <50 objects.
    """
    if len(objects) <= 1:
        return objects

    validated = [objects[0]]
    for obj in objects[1:]:
        pos = obj['position']
        too_close = False
        for existing in validated:
            ep = existing['position']
            dx = pos['x'] - ep['x']
            dz = pos['z'] - ep['z']
            dist = math.sqrt(dx * dx + dz * dz)
            if dist < MIN_OBJECT_DISTANCE:
                too_close = True
                break
        if too_close:
            # Nudge position outward from nearest object
            angle = math.atan2(pos['z'], pos['x'])
            pos['x'] = max(-SCENE_RADIUS, min(SCENE_RADIUS,
                pos['x'] + math.cos(angle) * MIN_OBJECT_DISTANCE))
            pos['z'] = max(-SCENE_RADIUS, min(SCENE_RADIUS,
                pos['z'] + math.sin(angle) * MIN_OBJECT_DISTANCE))
            obj['position'] = pos
        validated.append(obj)
    return validated


def validate_scene_spec(raw: dict, resource_id: str, title: str = '') -> dict:
    """
    Validate and sanitise AI-generated scene data into a clean SceneSpec.
    Returns a fully validated dict, or raises ValueError if unrecoverable.
    """
    if not isinstance(raw, dict):
        raise ValueError('SceneSpec is not a dict')

    objects_raw = raw.get('objects', [])
    if not isinstance(objects_raw, list):
        objects_raw = []

    # Validate each object
    objects = [_validate_object(obj, i) for i, obj in enumerate(objects_raw)]

    # Validate layout (prevent overlap)
    objects = _validate_scene_layout(objects)

    # Validate interactions
    valid_object_ids = {o['id'] for o in objects}
    interactions_raw = raw.get('interactions', [])
    interactions = []
    if isinstance(interactions_raw, list):
        for ix in interactions_raw:
            if not isinstance(ix, dict):
                continue
            obj_ref = ix.get('objectId', '')
            if obj_ref not in valid_object_ids:
                continue  # skip interactions referencing removed objects
            interactions.append({
                'id': str(ix.get('id', f'ix-{len(interactions)}'))[:64],
                'objectId': str(obj_ref)[:64],
                'type': str(ix.get('type', 'select'))[:20],
                'action': str(ix.get('action', 'inspect'))[:40],
                'payload': ix.get('payload') if isinstance(ix.get('payload'), dict) else {},
            })

    # Validate learning path — only reference existing object IDs
    learning_path_raw = raw.get('learningPath', [])
    learning_path = []
    if isinstance(learning_path_raw, list):
        for step in learning_path_raw:
            if isinstance(step, str) and step in valid_object_ids:
                learning_path.append(step)

    # Learning objectives
    objectives_raw = raw.get('learningObjectives', [])
    objectives = []
    if isinstance(objectives_raw, list):
        for obj in objectives_raw:
            if isinstance(obj, str) and len(obj) > 5:
                objectives.append(obj[:300])

    return {
        'id': f'scene-{resource_id}',
        'resourceId': str(resource_id),
        'title': str(raw.get('title', title))[:200],
        'description': str(raw.get('description', ''))[:500],
        'subject': str(raw.get('subject', ''))[:100],
        'environment': raw.get('environment') or {
            'type': 'dark',
            'background': '#0a0014',
            'fog': {'color': '#0a0014', 'near': 5, 'far': 50},
            'floor': {'visible': True, 'color': '#0d0d1a', 'grid': True},
            'lighting': {
                'ambient': {'intensity': 0.4, 'color': '#c4b5fd'},
                'directional': {'intensity': 0.8, 'position': {'x': 5, 'y': 8, 'z': 5}},
            },
        },
        'objects': objects,
        'interactions': interactions,
        'learningObjectives': objectives[:10],
        'learningPath': learning_path[:20],
        'generatedAt': raw.get('generatedAt', ''),
        'version': int(raw.get('version', 1)),
    }


def generate_scene_spec(resource, refresh: bool = False) -> Optional[dict]:
    """
    Generate a SceneSpec for a resource using the AI Scene Planner.

    1. Read existing scene from ai_notes_json if cached (unless refresh)
    2. Build minimal context from study material
    3. Call AI with structured prompt
    4. Parse + validate output
    5. Fall back to deterministic generator if AI fails

    Returns validated SceneSpec dict or None.
    """
    notes = resource.ai_notes_json or {}

    # Return cached scene unless refresh requested
    cached = notes.get('vr_scene')
    if cached and not refresh:
        return cached

    # ── Build minimal context from existing study material ──────────────
    overview = notes.get('overview', {})
    sections = notes.get('sections', [])
    vocabulary = notes.get('vocabulary', [])

    # Use smallest sufficient context
    summary = overview.get('summary', '')[:400]
    section_titles = [s.get('title', '') for s in sections[:10]]
    section_brief = '\n'.join(
        f"- {s.get('title', '')}: {s.get('content', '')[:120]}"
        for s in sections[:7]
    )
    vocab_text = ', '.join(
        v.get('term', '') for v in vocabulary[:15]
    ) if vocabulary else ''

    subject = resource.subject or resource.title or ''

    # ── AI prompt ──────────────────────────────────────────────────────
    prompt = (
        "You are an educational 3D scene planner for a VR learning app.\n"
        "Generate a structured SceneSpec for the following study material.\n\n"
        f"Subject: {subject}\n"
        f"Title: {resource.title}\n"
        f"Summary: {summary}\n"
        f"Key Sections:\n{section_brief}\n"
    )
    if vocab_text:
        prompt += f"Key Terms: {vocab_text}\n"

    prompt += (
        f"\nAVAILABLE 3D ASSETS (use ONLY these assetId values):\n"
        f"{_available_assets_text()}\n\n"
        "RULES:\n"
        "1. Only visualize concepts that benefit from 3D representation\n"
        "   (anatomical structures, physical systems, spatial relationships, mechanisms).\n"
        "2. DO NOT force 3D for definitions, dates, or abstract terms.\n"
        "3. Use assetId ONLY from the available list above. Set assetId to null if no match.\n"
        "4. Each object needs: id, conceptId, assetId, label, description, position, color.\n"
        "5. Position objects in a circle around origin (radius 1.5-3.0).\n"
        "6. Include 3-7 objects (quality over quantity).\n"
        "7. Add a learningPath array with ordered object IDs for guided exploration.\n"
        "8. Add learningObjectives (3-5 strings describing what the student learns).\n"
        "9. Interactions: use types 'inspect', 'explain', 'highlight', 'navigate', 'quiz', 'sequence'.\n\n"
        "Return ONLY valid JSON matching this structure:\n"
        "{\n"
        '  "title": "...",\n'
        '  "description": "...",\n'
        '  "subject": "...",\n'
        '  "objects": [\n'
        '    {"id": "...", "conceptId": "...", "assetId": "heart" or null, '
        '"label": "...", "description": "...", "position": {"x": 0, "y": 0.8, "z": 2}, '
        '"rotation": {"x": 0, "y": 0, "z": 0}, "scale": 1, "visible": true, '
        '"interactive": true, "color": "#ef4444"}\n'
        "  ],\n"
        '  "interactions": [\n'
        '    {"id": "...", "objectId": "...", "type": "inspect", "action": "show_detail"}\n'
        "  ],\n"
        '  "learningObjectives": ["..."],\n'
        '  "learningPath": ["obj_id_1", "obj_id_2"]\n'
        "}"
    )

    # ── Call AI ────────────────────────────────────────────────────────
    try:
        ai = AIService()
        raw_result = ai.chat_sync([{'role': 'user', 'content': prompt}])
        parsed = ai._parse_json(raw_result, {})

        if not parsed or not parsed.get('objects'):
            raise ValueError('AI returned empty or objectless scene')

        # Validate and sanitise
        scene = validate_scene_spec(parsed, str(resource.id), resource.title)
        return scene

    except Exception as e:
        logger.warning(f'AI Scene Planner failed for resource {resource.id}: {e}')
        return None


def generate_deterministic_scene(resource) -> dict:
    """
    Fallback: generate a SceneSpec deterministically from VR layout nodes.
    Used when AI Scene Planner fails.
    """
    notes = resource.ai_notes_json or {}
    vr_layout = notes.get('vr_layout', {})
    nodes = vr_layout.get('nodes', [])

    if not nodes:
        # Create minimal scene from resource metadata
        return {
            'id': f'scene-{resource.id}',
            'resourceId': str(resource.id),
            'title': resource.title or 'Learning Scene',
            'description': '',
            'subject': resource.subject or '',
            'environment': {
                'type': 'dark',
                'background': '#0a0014',
                'fog': {'color': '#0a0014', 'near': 5, 'far': 50},
                'floor': {'visible': True, 'color': '#0d0d1a', 'grid': True},
            },
            'objects': [],
            'interactions': [],
            'learningObjectives': [],
            'learningPath': [],
            'generatedAt': '',
            'version': 1,
        }

    # Circular layout
    import math as _m
    count = len(nodes)
    radius = max(1.5, count * 0.3)
    objects = []
    for i, node in enumerate(nodes):
        angle = (i / count) * _m.pi * 2 - _m.pi / 2
        label = node.get('label', f'Concept {i}')
        desc = node.get('description', '')
        color = node.get('color', '#6366f1')
        nid = node.get('id', f'n{i}')

        # Try asset resolution from manifest
        asset_id = None
        label_lower = label.lower()
        for aid, adef in AVAILABLE_ASSETS.items():
            for kw in adef['keywords']:
                if kw in label_lower or label_lower in kw:
                    asset_id = aid
                    break
            if asset_id:
                break

        objects.append({
            'id': nid,
            'conceptId': nid,
            'assetId': asset_id,
            'label': label,
            'description': desc[:500],
            'type': 'model' if asset_id else 'placeholder',
            'position': {
                'x': round(_m.cos(angle) * radius, 2),
                'y': 0.8,
                'z': round(_m.sin(angle) * radius, 2),
            },
            'rotation': {'x': 0, 'y': 0, 'z': 0},
            'scale': 1.0,
            'visible': True,
            'interactive': True,
            'color': color,
        })

    interactions = [
        {
            'id': f'inspect-{o["id"]}',
            'objectId': o['id'],
            'type': 'inspect',
            'action': 'show_detail',
        }
        for o in objects
    ]

    return {
        'id': f'scene-{resource.id}',
        'resourceId': str(resource.id),
        'title': resource.title or 'Learning Scene',
        'description': '',
        'subject': resource.subject or '',
        'environment': {
            'type': 'dark',
            'background': '#0a0014',
            'fog': {'color': '#0a0014', 'near': 5, 'far': 50},
            'floor': {'visible': True, 'color': '#0d0d1a', 'grid': True},
        },
        'objects': objects,
        'interactions': interactions,
        'learningObjectives': [f'Understand the key concepts of {resource.title}'],
        'learningPath': [o['id'] for o in objects],
        'generatedAt': '',
        'version': 1,
    }
