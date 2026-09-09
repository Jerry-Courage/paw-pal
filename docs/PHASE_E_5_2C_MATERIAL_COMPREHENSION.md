# Phase E.5.2C — Material Comprehension and Teaching Orchestration

## Source comprehension

Source Understanding schema version 2 classifies source regions before semantic extraction. The supported categories are `INSTRUCTIONAL_CONTENT`, `TITLE`, `SECTION_HEADING`, `AUTHOR_METADATA`, `PUBLISHER_METADATA`, `COPYRIGHT`, `TABLE_OF_CONTENTS`, `REFERENCES`, `BIBLIOGRAPHY`, `NAVIGATION`, `CAPTION`, `ASSESSMENT`, `GLOSSARY`, `SIDEBAR`, and `UNKNOWN`. Hard metadata is excluded from semantic extraction, grounding excerpts, topic candidates, objectives, and teaching content.

Candidate topics carry deterministic scores for relevance, support, coverage, distinctness, usefulness, metadata likelihood, redundancy, section significance, and dependency fit. Valid AI semantic classifications can increase support and relevance, but cannot introduce evidence from a non-instructional region. Topics retain page, block, and section provenance and form a heading-aware parent/child hierarchy.

Material quality checks instructional volume, topic count, metadata dominance, hierarchy, and confidence. One bounded retry broadens safe content anchors and reconstructs the hierarchy. If quality remains weak, Journey preview/build returns HTTP 422 with `material_understanding_uncertain`, a learner-safe message, warnings, and `recoverable: true`. A successful preview includes major topics, topic count, hierarchy, confidence, and warnings.

## Tutor quality

Tutor Plan v3 now asks the model to design a compact learning arc across hook, context, idea, demonstration, connection, learner attempt, adaptation, verification, and advancement. These internal phase names are not shown to learners. Each validated moment records its intended understanding change, transition, attention cue, and proposed next actions. Deterministic code authorizes advancement, progressive reveal, checks, reteaching, representation changes, examples, prerequisite bridges, and optional depth from learner evidence.

Validation rejects oversized teaching moments, repeated moment bodies, raw source-page dumps, unsupported evidence, and generic checks such as “What relationship did Flow just show?”. Remediation records a diagnostic gap and must change representation and produce fresh evidence. External videos pass lexical and subject-domain relevance checks; clear cross-domain mismatches return no video.

## Processing and operations

Processing stages are `UPLOAD`, `EXTRACT`, `UNDERSTAND`, `VISUAL_ANALYSIS`, `STUDY_KIT`, `ENRICHMENT`, and `JOURNEY_READY`. The compact status contract contains only `id`, `status`, `progress`, `stage`, `ready`, `error`, and `message`; any resource that is not ready is capped at 99 percent. The SSE endpoint accepts `text/event-stream`, and polling fallback uses `/api/library/resources/{id}/status/` rather than downloading the full resource serializer.

`SOURCE_UNDERSTANDING` provider calls use a 5 second connection timeout and an 18 second response timeout before continuing through the configured route. Schema validation, route fallback, and timing logs remain active. Provider credentials and `AI_TASK_ROUTES` continue to come from the existing environment configuration. No new feature flag, credential, or migration is introduced.

The permanent respiration fixture contains publisher and author front matter, keywords, a table of contents, instructional sections, gas exchange, body-surface exchange, gills, tracheal systems, lungs, ventilation, and oxygen transport. Tests require instructional topics to outrank metadata and keep front matter out of grounding.
