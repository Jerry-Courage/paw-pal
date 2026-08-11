# SHS Curriculum Experience — Implementation Plan

## Vision

SHS students get their full NaCCA curriculum built into FlowState:
- Browse 16 subjects, 64 topics organized by category and year
- Read AI-generated lesson content for each topic
- Personalised tutor pre-fed with curriculum content
- Quiz generation from any topic
- Progress tracking across curriculum topics

No PDF parsing. No external content uploads needed. The curriculum IS the content library.

---

## Architecture

### Content Strategy: On-Demand AI Generation

When a student opens a curriculum topic for the first time:
1. Check if lesson content exists (cached in `Resource.ai_notes_json`)
2. If not → generate structured lesson using Groq (fast, free)
3. Cache the generated content in the Resource
4. Student reads the lesson, tutor has access to it

**Why on-demand:** Generating all 64 topics upfront costs ~$2 in API calls and takes minutes. On-demand means instant first load, zero cost for unused topics.

### Data Flow

```
Student opens /curriculum/core-math/algebra
    ↓
GET /api/curriculum/core-math/algebra/lesson/
    ↓
Backend checks: does a Resource exist with curriculum_topic_id='algebra'?
    ├─ YES → return cached content from ai_notes_json
    └─ NO → generate lesson via AI → cache in new Resource → return
    ↓
Student reads lesson (markdown)
    ↓
"Ask Tutor" button → opens personalised tutor with topic context pre-loaded
"Quiz Me" button → POST /api/curriculum/core-math/algebra/quiz/
    ↓
Progress tracked: ResourceProgress created for this topic
```

### Tutor Integration

The personalised tutor's context builder (`consumers_personalized.py`) currently reads `ResourceProgress` to know what the student has studied. For curriculum topics:

1. When student opens a topic → auto-create `ResourceProgress(user, resource, xp_earned=0)`
2. Tutor context builder picks it up naturally (already reads last 10 ResourceProgress records)
3. The Resource's `ai_notes_json` contains the lesson content → tutor can reference it

**Additionally:** When starting a tutor session from a curriculum topic page, pass `curriculum_context` via the WebSocket `start` message. The consumer injects the topic's lesson content directly into the system prompt.

---

## Backend Changes

### 1. Curriculum Lesson API

**New file:** `backend/curriculum/__init__.py`, `backend/curriculum/views.py`, `backend/curriculum/urls.py`

```
GET  /api/curriculum/<subject_id>/<topic_id>/lesson/
POST /api/curriculum/<subject_id>/<topic_id>/lesson/   (force regenerate)
GET  /api/curriculum/<subject_id>/<topic_id>/quiz/
```

**Lesson endpoint logic:**
```python
def get_or_generate_lesson(subject_id, topic_id):
    # 1. Look up topic metadata from a backend copy of curriculum.ts
    topic = get_topic(subject_id, topic_id)
    
    # 2. Check for existing Resource with this curriculum_topic_id
    resource = Resource.objects.filter(
        curriculum_topic_id=topic_id,
        curriculum_subject=subject_id,
        is_public=True
    ).first()
    
    # 3. If exists and has ai_notes_json['curriculum_lesson'] → return it
    if resource and resource.ai_notes_json.get('curriculum_lesson'):
        return resource.ai_notes_json['curriculum_lesson']
    
    # 4. Generate lesson via AI
    lesson_content = generate_curriculum_lesson(topic)
    
    # 5. Cache in Resource (create or update)
    if not resource:
        resource = Resource.objects.create(
            owner=admin_user,
            title=topic['title'],
            subject=subject_id,
            curriculum_topic_id=topic_id,
            curriculum_subject=subject_id,
            curriculum_year=topic['year'],
            resource_type='other',
            status='ready',
            is_public=True,
            author_name='FlowState Curriculum',
        )
    
    notes = resource.ai_notes_json or {}
    notes['curriculum_lesson'] = lesson_content
    resource.ai_notes_json = notes
    resource.save(update_fields=['ai_notes_json'])
    
    return lesson_content
```

**Quiz endpoint:** Uses existing `AIService.generate_quiz_from_topic()` — no Resource needed.

### 2. AI Lesson Generator

**File:** `backend/ai_assistant/services.py` — add method to AIService

```python
def generate_curriculum_lesson(self, topic: dict) -> dict:
    """Generate a structured lesson for a curriculum topic."""
    prompt = f"""
    Generate a comprehensive SHS lesson for: {topic['title']}
    Subject: {topic['subject_name']}
    Year: {topic['year']}
    Description: {topic['description']}
    
    Return JSON with:
    {{
        "title": "...",
        "overview": "2-3 sentence summary",
        "sections": [
            {{
                "heading": "...",
                "content": "Detailed explanation with examples...",
                "key_points": ["point 1", "point 2"]
            }}
        ],
        "key_concepts": ["concept 1", "concept 2"],
        "examples": ["example 1", "example 2"],
        "common_mistakes": ["mistake 1"],
        "exam_tips": ["tip 1"],
        "vocabulary": [{{"term": "...", "definition": "..."}}]
    }}
    Use Ghanaian examples where relevant. Align with NaCCA/WASSCE standards.
    Write for SHS students — clear, engaging, no jargon.
    """
    # Use Groq for speed (free, 1000 t/s)
    result = self.chat_sync([{'role': 'user', 'content': prompt}])
    return parse_json(result, {})
```

### 3. Curriculum Data on Backend

**New file:** `backend/curriculum/data.py`

Copy the essential structure from `frontend/lib/curriculum.ts` to Python:
- `SHS_CURRICULUM` — list of subjects with topics
- `get_topic(subject_id, topic_id)` — lookup helper
- `get_all_topics()` — flat list of all 64 topics

This avoids a DB migration — the curriculum structure lives in code, not in models.

### 4. Tutor Context Enhancement

**File:** `backend/ai_assistant/consumers_personalized.py`

Add to `_get_personalized_context`:
```python
# Curriculum topics studied
curriculum_resources = Resource.objects.filter(
    owner=user,
    curriculum_subject__isnull=False,
    ai_notes_json__curriculum_lesson__isnull=False
).order_by('-updated_at')[:10]

if curriculum_resources:
    curriculum_str = "\n".join([
        f"- {r.title} ({r.curriculum_subject}, {r.curriculum_year})"
        for r in curriculum_resources
    ])
    # Add to context
```

**File:** `backend/ai_assistant/consumers_personalized.py` — WebSocket start handler

When `start` message includes `curriculum_context`:
```python
if data.get('curriculum_context'):
    topic_id = data['curriculum_context']
    resource = Resource.objects.filter(curriculum_topic_id=topic_id).first()
    if resource and resource.ai_notes_json.get('curriculum_lesson'):
        lesson = resource.ai_notes_json['curriculum_lesson']
        system_prompt += f"\n\nCURRENT TOPIC: {lesson['title']}\n{lesson['overview']}\n..."
        # Sections available for detailed reference
```

### 5. Progress Tracking

When a student opens a curriculum topic:
```python
# Auto-create progress entry so tutor knows about it
ResourceProgress.objects.get_or_create(
    user=user,
    resource=curriculum_resource,
    defaults={'xp_earned': 0, 'mastery': 0}
)
```

---

## Frontend Changes

### 1. Curriculum Browser Page

**New file:** `frontend/app/(dashboard)/curriculum/page.tsx`

A dedicated `/curriculum` page (separate from library):
- Category tabs: All / Core / Science / Business / Arts / Agriculture
- Year filter: All / SHS 1 / SHS 2 / SHS 3
- Subject cards showing: icon, name, topic count, description
- Click subject → `/curriculum/[subjectId]`

This is the SHS equivalent of the library — but structured by curriculum, not by uploaded files.

### 2. Subject Detail Page (Upgrade Existing)

**File:** `frontend/app/(dashboard)/library/curriculum/[id]/page.tsx`

Upgrade to show:
- Topic list with lesson status (generated / not generated)
- "Start Learning" button per topic → opens lesson page
- Year filter tabs
- Remove the URL form / kit generation UI (not needed for SHS)

### 3. Topic Lesson Page

**New file:** `frontend/app/(dashboard)/curriculum/[subjectId]/[topicId]/page.tsx`

The main learning experience:
- **Lesson content** — rendered markdown from AI-generated content
- **Tutor button** — "Ask Tutor about this topic" → opens personalised tutor with context
- **Quiz button** — "Quiz Me" → generates and shows a quiz
- **Progress** — marks topic as explored
- **Navigation** — prev/next topic within the subject

Layout:
```
┌─────────────────────────────────────┐
│ ← Back to Subject                   │
│ Topic Title                         │
│ SHS 1 · Core Mathematics            │
├─────────────────────────────────────┤
│ OVERVIEW                            │
│ 2-3 sentence summary                │
│                                     │
│ SECTIONS                            │
│ 1. Heading                          │
│    Content with examples...         │
│    Key points: • • •                │
│                                     │
│ 2. Heading                          │
│    Content...                       │
│                                     │
│ KEY CONCEPTS                        │
│ • Concept 1                         │
│ • Concept 2                         │
│                                     │
│ EXAM TIPS                           │
│ • Tip 1                             │
│                                     │
│ VOCABULARY                          │
│ Term: Definition                    │
├─────────────────────────────────────┤
│ [Ask Tutor]  [Quiz Me]  [Mark Done]│
└─────────────────────────────────────┘
```

### 4. SecondaryDashboard Upgrade

**File:** `frontend/components/dashboard/SecondaryDashboard.tsx`

Replace hardcoded 4 subjects with real curriculum data:
- Import `SHS_CURRICULUM` from `lib/curriculum.ts`
- Show all subjects grouped by category
- Add year filter
- Link to `/curriculum/[subjectId]` instead of `/library?subject=...`
- Add recent curriculum activity
- Add "Continue Learning" section (last opened topic)

### 5. Navigation Updates

**File:** `frontend/components/layout/Sidebar.tsx`
**File:** `frontend/components/layout/MobileNav.tsx`

For secondary users, add "Curriculum" nav item (or rename "Library" to "Curriculum").

### 6. Tutor Context Passing

**File:** `frontend/app/(dashboard)/curriculum/[subjectId]/[topicId]/page.tsx`

When "Ask Tutor" is clicked:
```typescript
// Navigate to personalised tutor with curriculum context
router.push(`/dashboard/personalised?curriculum=${topicId}`)
```

**File:** `frontend/app/(dashboard)/dashboard/personalised/page.tsx`

On mount, check for `curriculum` query param:
```typescript
const curriculumTopic = searchParams.get('curriculum')
// Send to WebSocket on start:
ws.send(JSON.stringify({ type: 'start', voice, curriculum_context: curriculumTopic }))
```

---

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `backend/curriculum/__init__.py` | Package init |
| `backend/curriculum/data.py` | Python copy of curriculum structure |
| `backend/curriculum/views.py` | Lesson + quiz API endpoints |
| `backend/curriculum/urls.py` | URL routing |
| `frontend/app/(dashboard)/curriculum/page.tsx` | Curriculum browser page |
| `frontend/app/(dashboard)/curriculum/[subjectId]/[topicId]/page.tsx` | Topic lesson page |

### Modified Files
| File | Change |
|------|--------|
| `backend/ai_assistant/services.py` | Add `generate_curriculum_lesson()` method |
| `backend/ai_assistant/consumers_personalized.py` | Add curriculum context to tutor system prompt |
| `backend/core/urls.py` | Add `api/curriculum/` route |
| `frontend/components/dashboard/SecondaryDashboard.tsx` | Replace hardcoded subjects with curriculum data |
| `frontend/app/(dashboard)/library/curriculum/[id]/page.tsx` | Upgrade to show lesson status, link to lesson page |
| `frontend/components/layout/Sidebar.tsx` | Add Curriculum nav for secondary users |
| `frontend/components/layout/MobileNav.tsx` | Add Curriculum nav for secondary users |
| `frontend/app/(dashboard)/dashboard/personalised/page.tsx` | Accept curriculum_context query param |

---

## Execution Order

### Phase 1: Backend Foundation (do first)
1. Create `backend/curriculum/data.py` — copy curriculum structure
2. Create `backend/curriculum/views.py` — lesson + quiz endpoints
3. Create `backend/curriculum/urls.py` — wire up routes
4. Add `generate_curriculum_lesson()` to AIService
5. Update `backend/core/urls.py` to include curriculum routes

### Phase 2: Curriculum Browser
6. Create `/curriculum/page.tsx` — browse all subjects
7. Upgrade SecondaryDashboard — use real curriculum data
8. Update Sidebar/MobileNav for secondary users

### Phase 3: Topic Learning Experience
9. Create `/curriculum/[subjectId]/[topicId]/page.tsx` — lesson page
10. Upgrade existing curriculum subject detail page

### Phase 4: Tutor Integration
11. Update `consumers_personalized.py` — accept curriculum_context
12. Update personalised tutor page — pass curriculum context
13. Auto-create ResourceProgress on topic open

### Phase 5: Polish
14. Progress tracking across curriculum
15. "Continue Learning" on dashboard
16. Testing all 64 topics
