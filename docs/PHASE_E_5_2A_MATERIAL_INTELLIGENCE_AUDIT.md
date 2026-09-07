# E.5.2A — Material intelligence audit and foundation

Review date: 2026-09-07. Base commit: `f4cfc9c74027124f1793cfc719f1a7a13c05e819`.
Local implementation only. No commit, push, deployment, production migration, or live paid-model evaluation was performed.

## 1. Discovered upload → Journey pipeline

| Stage | Actual implementation before this change | Persistence / fallback |
| --- | --- | --- |
| Upload | `library.urls`: `resources/`; `ResourceListCreateView.create/perform_create`; `ResourceUploadSerializer` validates and creates `Resource` | File, owner, title, subject, type, selected features; existing Cloudinary/R2 storage paths |
| Background work | Initial upload starts a daemon thread calling `library.tasks.process_resource_task`; reprocess and transcript retry use Django-Q | Resource status/progress and existing study-kit cache |
| Parse PDF | `text_extractor.extract_text_from_bytes` → `pdf_extractor.extract_pdf_content` | PyMuPDF text with `[PAGE_n_START/END]`, TOC, embedded images, sampled page images; maximum 500 text pages |
| Parse slides | LibreOffice conversion → PDF path; otherwise python-pptx text frames, pipe-delimited table rows, speaker notes, image/render fallback | Slide markers exist in fallback text; original structured table cells were not retained |
| Parse documents | python-docx paragraph text | Tables and paragraph styles were omitted; `.doc` was routed through a DOCX parser despite not being the same format |
| Visual interpretation | Worker describes selected PDF/page images through the existing AI service and supplies vision data to study-kit synthesis | ResourceImage and study-kit image references; not a validated diagram graph |
| Raw text | Worker places `extracted_text` in `Resource.ai_concepts` | Truncated to 300,000 characters; mixed abstraction with generated concepts |
| Chunks | `create_vector_embeddings`, RecursiveCharacterTextSplitter: 1,000 characters, 200 overlap; cloud embedding batches of 50 | `DocumentChunk` has text, vector and nullable page number, but page_number was never populated by this worker; repeat processing appended rows |
| Summaries | `AIService.generate_study_kit` → `kit_chat_sync`, with retry and `get_fallback_study_kit` | `ai_notes_json`, `ai_summary`, `has_study_kit`; section summaries are generated content, not original extraction |
| Journey concepts | `LearningPathViewSet.generate_preview/build` → `_extract_resource_concepts` → `_generate_preview_structure` | Uses generated concepts when at least three exist; otherwise study-kit sections. Titles deduplicated and grouped deterministically by depth; persists LearningPath, Unit, ConceptNode and a linear prerequisite chain |
| Objectives | `_get_teaching_session` → `_teaching_objectives` | Hardcoded iterative-method objectives for certain titles; otherwise first four summary sentences plus a generic application objective. Not an independent objective AI call |
| Grounding | `_grounding` selects a section by source_section/title-word overlap | Prefers plain_english/quick_summary/content, truncated to 700 characters; no neighbor retrieval or structured math/data |
| TeachingPlan | `get_or_create_teaching_plan` → `generate_teaching_plan` → `validate_teaching_plan` | AIService.chat_sync(task=TEACHING_GENERATION, max_tokens=1800); JSON validation; session.state cache and deterministic fallback |
| Moments | `teaching_activities_from_plan` converts explain/visualize/demonstrate/example/remediate moments; `_objective_activities` separately builds checks | Existing EncounterAttempt, TeachingTurn, TeachingSession evidence/controller remain authoritative |
| Player | `_session_data` → `sync_player_state` / `decide_learning_sequence` | Objective-scoped stages; Continue advances presentation; practice requires an attempt |
| Render | JourneyWorld → JourneyLearningObject → TeachingCanvas/specialized renderers | Worked renderer falls back to Example without steps; unknown types render Idea; relationship canvas currently shows nodes but omits edge labels/direction |

Related serializers remain explicit field lists: ResourceSerializer/ResourceListSerializer, LearningPath serializers, ConceptNode serializers. The new material record is deliberately absent from learner resource serializers. New diagnostics are a management command, not a learner endpoint.

## 2. Information loss and preservation audit

Raw text is not evidence that a semantic structure exists. Before this phase:

| Material feature | Original behavior | Foundation behavior / boundary |
| --- | --- | --- |
| Document title | Resource title preserved | Retained in versioned material record |
| Headings/section hierarchy | PDF TOC extracted; downstream mainly generated section titles | TOC persisted; DOCX heading styles and Markdown heading blocks retain levels and section paths |
| Page/slide boundaries | Markers in text, mostly lost in grounding/chunks | Explicit ordered pages/slides, stable page IDs, previous/next links, blocks and page numbers |
| Neighbor context | None in Journey grounding | Objective location plus preceding/following page; zero lexical overlap does not select an arbitrary first page |
| Definitions/terminology/concepts | Generated notes or undifferentiated raw text | Conservative extractive classifiers and optional validated AI collections |
| Formulas/variables | Plain extraction, then prose truncation; no math confidence model | Original and normalized plain text, uncertainty flag, original page reference; variables may be AI-classified with quoted evidence |
| Superscripts/subscripts | Parser text, no reliable mathematical reconstruction | DOCX run flags retained; PDF math layout remains uncertain. No invented LaTeX/fraction reconstruction |
| Greek symbols, matrices, fractions | Whatever the text parser returned; layout could be lost | Original text retained. No claim of reliable matrix/fraction semantics or OCR recovery |
| Examples/worked examples | Summaries; fallback fabricated steps | Optional semantic payload; deterministic extraction of explicitly labelled problem/known/operation/steps/result; incomplete worked examples downgrade |
| Processes/sequences/relationships | No consistent structured source record; some hardcoded fallback routes | Explicit arrow sequences retained; optional AI classification; inferred relationships are labelled separately |
| Comparisons | Could be fabricated from title/summary | Two entities and comparable dimensions required for structured representation; otherwise prose |
| Tables/data | PDF structure omitted, DOCX tables omitted, PPTX flattened | Parser-provided headers/rows, preserved empty cells in structured PPTX tables, DOCX tables in document order; conservative delimited-table recognition |
| Units/labels/captions | Not independently preserved | Optional fields retained when supplied; blank when unavailable, not invented |
| Diagrams | Image/page references and generated descriptions | Page/block visual reference with interpretation unavailable; no inferred arrows from image position |
| Code | Raw text | Literal code blocks/snippets supported; not executable UI |
| Quotations/evidence | Raw/generated excerpts | Source quotations and assessment context retained with provenance |
| Entities/roles | Raw text or subject-specific hardcoding | Conservative explicit “X is …” extraction; optional semantic payloads for roles |
| Prerequisites/dependencies/misconceptions | Linear concept prerequisites / generated pedagogy | Optional AI classifications require supporting excerpts and explicit inferred/source/enrichment classification |

## 3. Finite-differencing failure attribution

Confirmed code-level causes span multiple layers: generated summaries replace source grounding; 700-character selection loses later material; summary sentences become objectives; fallback WORKED_EXAMPLE literally supplied “Substitute the known information” without values, a formula or result; checks were constructed independently of the actual lesson. The shared Groq chat path also compresses long user messages to 2,000 characters.

The exact production upload and its stored extraction were not supplied. Consequently this audit does **not** claim that the original PDF extractor specifically dropped its finite-difference formula. It establishes several downstream failure mechanisms and reproduces the failure category with a synthetic source fixture.

## 4–7. New architecture, deterministic/AI split and provenance

`Resource.source_understanding` is a versioned JSON knowledge record attached to the existing material. It contains title, sections, pages, blocks, a content fingerprint, origin and optional semantic collections. It does not replace Resource, duplicate file storage, or use study-kit summaries as original document text.

Deterministic work includes parser structure, original text, tables supplied by parsers, source references, explicit formula candidates, labelled examples, arrow sequences, validation, objective selection, neighboring context, cache fingerprints and persistence. File-derived records use the original parser output, not subsequently generated vision captions.

Optional AI work classifies source concepts, variables, roles, relationships, prerequisites, misconceptions and subject-specific semantic payloads. It uses overlapping windows of three pages plus one preceding context page; windows exceeding 24,000 text characters retain deterministic results. Output must be JSON with known collections, typed sequences and exact quoted evidence. Source-labelled facts and structured worked-example fields must occur in cited text. Inferences remain labelled; enrichment is excluded from objective grounding. Invalid/failed windows retain deterministic extraction. No arbitrary HTML/JSX or chain-of-thought is requested or returned by diagnostics.

Every extracted semantic element carries stable element IDs and source references. AI references are canonicalized against the actual supplied page window; untrusted extra citation fields are discarded. DOCX pagination is explicitly unknown rather than fabricated.

## 8–10. Grounding, quality gates and assessment

`objective_grounding` / `grounding_bundle` select actual pages and neighboring context, retaining semantic collections and a source fingerprint. Objectives derived from the material have source statements, knowledge IDs and page references. They ask for explanation of an actual relationship or use the stated problem of a worked example; they do not append the former unconditional “apply in a concrete situation” objective on the material-backed path.

TeachingPlan receives the complete selected bundle, not only a vague title and 700-character generated summary. The exact input and objective are stored with the cached plan for diagnostics. Cache version changed so old filler plans do not survive the new validation.

WORKED_EXAMPLE requires an actual problem, known information, operation, multiple transformations and result. Overlong examples/formulas that cannot fit without losing meaning are rejected or downgraded. PROCESS requires ordered stages; COMPARISON requires two entities and dimensions; relationships need connections; evidence display needs real excerpts. Unknown graph/diagram semantics are not manufactured. Because the existing relationship canvas omits edges, the deterministic fallback retains the source explanation instead of showing a misleading map. Uncertain formulas remain source prose rather than being passed off as normalized LaTeX.

The plan validator rejects generic filler and checks whose evidence concepts were not established earlier in teaching or explicit prerequisites. Material-backed Journey checks use content from representations that are actually visible. `_next_journey_check` and the submission endpoint gate these checks until teaching stages have been completed, or prior persisted successful evidence exists. Continue still grants no mastery or reward. A test proves early direct submission is rejected and the check becomes reachable after teaching.

**Compatibility boundary:** historical resources with no stored original extraction retain the existing summary/concept compatibility path. This phase does not invent provenance for those records, rewrite existing session objectives, or retrofit the material-backed submission gate onto every legacy voice/encounter route. Reprocessing the original stored material is needed to bring summary-only records under the new guarantees. Therefore the universal invariant across every historical/voice route is not claimed as fully solved by this foundation.

## 11. AI routing audit

The code, rather than comments naming a model family, is the basis for this audit. Deployed environment variables and successful production inference traces were not available.

| Task | Routing now |
| --- | --- |
| SOURCE_UNDERSTANDING | New optional `chat_sync` task label; same shared chat provider chain; disabled by default |
| OBJECTIVE_GENERATION | Label recognized for future instrumentation, but actual Journey objective generation remains deterministic; no new objective inference call |
| TEACHING_GENERATION | Existing `chat_sync` task label, max_tokens=1800; same routing as before |
| Study-kit summaries | Separate `generate_study_kit` / `kit_chat_sync` path; unchanged |

For non-tutor text chat, the actual first Groq choices are `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.6-27b`. Google fallback tries `gemini-3.5-flash`, `gemini-3.6-flash`, `gemini-3.1-flash-lite`. The OpenRouter default is `anthropic/claude-3.5-sonnet`, followed by configured fallbacks `openai/gpt-4o-mini`, `openai/gpt-4o`, `anthropic/claude-3-haiku`, `openrouter/auto`. Credentials, quota, process failure counters and configuration determine the actual provider. An early missing-key return and the Groq input-compression behavior remain existing limitations. A task label alone does not select a stronger model.

Recommendation: separately evaluate structured source reasoning, objective design and teaching synthesis against these fixtures, then introduce explicit task routing and input-integrity guarantees. Relationship/dependency inference and worked-example pedagogy are the strongest candidates for more capable reasoning. No production model/provider chain was changed in this phase.

## 12. Cache and cost behavior

Understanding is persisted before study-kit generation. A row lock and version/content fingerprint reuse the existing record, including AI-failure fallback results. Legacy stored raw text is lazily backfilled deterministically; interaction does not trigger semantic AI. Enabling the AI flag does not automatically rerun already cached material with the same fingerprint.

Journey selection reuses material knowledge; objective start caches TeachingPlan in TeachingSession.state. Continue remains deterministic, and Ask Flow continues to use its existing conversational mechanism. Embeddings now split per page, populate page_number and atomically replace old chunks instead of appending duplicates. The final record replacement is idempotent; concurrent workers can still incur duplicate embedding work before acquiring that replacement lock. Source AI can require multiple bounded calls per document, never one per Next click.

## 13–14. Fixtures

`learning/fixtures/material_intelligence.json` includes:

- Finite differences: exact derivative context, discrete measurements, forward difference, spacing variable, a two-row table and a complete worked calculation `(8−3)/1=5`, explicitly called an approximation. No backward/central difference enrichment.
- Biology: heart/lungs roles and an explicit right-heart → lungs → left-heart → body route.
- Literature: Mara's stated value, concealed action, a quotation, contrast and evidence context.
- Computer science: React Native, API, Spring Boot and PostgreSQL with component roles and an explicit flow.

Focused tests cover malformed output, fake citations/facts, AI success and failure, source/inference/enrichment separation, neighboring pages, cache reuse, parser-generated PDF/PPTX/DOCX structure, formula preservation and early assessment rejection. These are deterministic and mocked-AI regression results, not evidence of live-model pedagogical quality.

## 15. Verification

The complete `manage.py test learning --noinput` suite passed **114 tests**. After the final validation changes, the focused material/TeachingPlan suite passed **43 tests**. `git diff --check` passed (only Windows line-ending conversion notices). The worker module also passed compilation.

Production frontend build passed with the repository's existing configuration, which skips type validation and linting. Separate TypeScript diagnostics found **19 errors** in unchanged non-Journey files; no Journey/TeachingCanvas diagnostics were reported. Initial font-fetch sandbox failure was resolved by rerunning with network permission.

Django system check passed. `makemigrations library --check --dry-run` reported no changes beyond the supplied migration. The global migration check reports pre-existing Learning field-option and Users Feedback ID drift, left untouched. An existing startup PostgreSQL-specific query logs a SQLite syntax warning during local tests; it does not prevent the suite or system check.

## 16–17. Files and migration

Changed: `backend/library/{models.py,tasks.py,pdf_extractor.py,text_extractor.py}`, `backend/learning/{views.py,teaching_plan.py,test_teaching_plan.py}`, `backend/core/settings.py`, `backend/ai_assistant/services.py`, `frontend/components/journey-world/JourneyLearningObject.tsx` (development console diagnostics only).

Added: `backend/library/source_understanding.py`, `backend/library/migrations/0019_resource_source_understanding.py`, `backend/learning/material_grounding.py`, `backend/learning/diagnostics.py`, `backend/learning/management/commands/trace_material_objective.py`, `backend/learning/test_material_intelligence.py`, `backend/learning/fixtures/material_intelligence.json`, `backend/learning/__init__.py` (fixes unittest package discovery), and this report.

One migration adds the JSON field to Resource. No data migration, source deletion, auth/payment change or external deployment.

## 18. Limitations requiring review

- Original production material and deployed provider traces were unavailable; exact extraction failure attribution remains unverified.
- Historical summary-only records and legacy voice/encounter checks are the compatibility boundary described above; full cross-route teach-before-test is not yet guaranteed.
- Conservative extraction is not a general mathematical parser or diagram interpreter. OCR, equation layout, arbitrary scientific figures, complete dependency maps and live semantic quality remain future work.
- AI is opt-in and was not evaluated with live credentials. Shared service truncation can reduce semantic AI quality even though validation prevents fabricated citation acceptance. A valid quote is not a proof of semantic entailment for every inferred claim.
- Grounding selects one anchor with immediate neighbors. Longer dependencies need wider retrieval. Explanatory playback is capped at eight moments; checks use only visible content.
- Existing generated-summary concept paths remain for materials without original text; this foundation does not redesign all assessment types or Ask Flow.
- DOCX has no authoritative page numbers; older binary `.doc`/`.ppt` require conversion. PDF text is capped at 500 pages by the existing extractor. Parser-unavailable math/diagram structure is marked uncertain rather than recovered.
- Frontend full typecheck and global migration consistency have unrelated existing failures.

## 19. Configuration and developer usage

After approval, apply migration `library.0019_resource_source_understanding` before running the updated worker/web code. No credentials or provider change is required for deterministic processing. The final E.5.2B configuration correction enables `SOURCE_UNDERSTANDING_AI_ENABLED` by default when the variable is absent. Set it explicitly to `false`, `0`, `no`, `off`, or `disabled` for an emergency rollback.

Existing stored extraction backfills lazily. Material lacking original text can use the existing reprocess endpoint against its stored file; no re-upload is intrinsically required. Cached understanding does not rerun just because the AI flag is enabled.

With `DEBUG=True`, run `python manage.py trace_material_objective SESSION_ID OBJECTIVE_ID`. It prints structured material, extracted pages, available chunks (explicitly identified as comparison data), exact cached grounding, objective, validated plan, moments and cache metadata. It is read-only and rejects production use. Correlate objective/activity IDs with `[Journey render]` messages in a development browser for actual render selection and fallback. Backend diagnostics do not pretend to observe a browser that has not rendered the lesson.

`learning.diagnostics.flow_context` prepares journey/objective/plan/stage IDs, the current visible teaching content, grounding and learner evidence for future Ask Flow integration. It is not a navigation or Ask Flow redesign.

Release status: review required. No commit, push or deployment.
