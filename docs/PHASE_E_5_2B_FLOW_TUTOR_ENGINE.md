# Phase E.5.2B — Flow Tutor Engine

## 1. Teaching architecture before and after

Previously Journey generated a presentation block, discarded plan interactions, and appended a generic deterministic check. Ask Flow reused the progression conversation endpoint. Now a version 3 Tutor Plan owns the ordered teaching and evidence moments. The player renders every validated moment in order, while deterministic services continue to own stage state, evidence, mastery, rewards, idempotency, and persistence.

## 2. Material Intelligence into Tutor Plan

`objective_grounding` selects structured pages and neighboring context from the E.5.2A source model. The full bounded bundle includes source fingerprint, page IDs, semantic knowledge IDs, formulas, tables, processes, relationships, quotations, worked examples, prerequisites, and misconceptions. It enters the model request intact and is cached beside the resulting plan.

## 3. Plan and moment contracts

Version 3 supports EXPLAIN, SHOW, VISUALIZE, DEMONSTRATE, CONNECT, COMPARE, EXAMPLE, INTERACT, CHECK, REFLECT, REMEDIATE, REINFORCE, and OPTIONAL_DEPTH teaching semantics. Each moment declares purpose, content-specific dialogue, mascot placement, difficulty level, knowledge taught/tested, exact source excerpt, source page IDs, representation, and interaction. Plans carry prerequisite states, an evidence strategy, remediation options, and a minimum evidence level.

## 4. What AI decides

AI chooses teaching order, representation, explanation, examples, dialogue, interaction type, question wording, distractors, evidence level, and a different remediation representation. It may propose a temporary existing canvas for an Ask Flow response. It evaluates semantic free text and version 3 teach-backs against explicitly supplied taught knowledge.

## 5. What deterministic code controls

Schema validation, source membership, teach-before-test, supported renderer and interaction types, active-stage authorization, reveal order, evidence thresholds, objective advancement, attempt recording, mastery, rewards, caching, idempotency, answer redaction, and session persistence remain deterministic. AI cannot directly mutate these fields.

## 6. Ask Flow architecture

Ask Flow is a dedicated modal/bottom sheet and server channel. Its context is derived from the authoritative active objective, plan fingerprint, moment, representation, visible semantic content, source bundle, persisted evidence, and misconceptions. Conversation turns persist separately and do not enter the main Journey timeline. A temporary teaching canvas opens inside the sheet and returns to the unchanged player stage.

## 7. Assessment protection

During an active assessment, Ask Flow takes a deterministic hint-only branch and never calls a model with the hidden answer. The public serializer recursively removes expected answers, correct choices/orders/groups/evidence/targets, rubrics, feedback keys, source quotes used for grading, and knowledge test keys. Matching columns are independently shuffled and their mapping stays server-only.

## 8. Adaptive remediation

An incorrect version 3 response records the misconception, asks the REMEDIATION task for a source-grounded replacement plan, requires a changed representation, preserves the original minimum evidence level, and requires a fresh question. The new plan receives revision-stable moment IDs and replaces the current player sequence. If inference fails, Journey honestly replays the grounded lesson without fabricating pedagogy.

## 9. Prerequisite behavior

Prerequisites are classified KNOWN, UNCERTAIN, or MISSING from persisted knowledge evidence. A plan may use at most two prerequisite-bridge moments and each must teach an uncertain or missing ID. Assessments can test only knowledge established earlier or a known prerequisite. Passed and failed checks update the corresponding persisted knowledge sets.

## 10. Model routing

Explicit policies cover SOURCE_UNDERSTANDING, OBJECTIVE_GENERATION, TEACHING_GENERATION, EXAMPLE_GENERATION, QUESTION_GENERATION, DISTRACTOR_GENERATION, REMEDIATION, FEYNMAN_EVALUATION, MASTERY_GENERATION, MASTERY_EVALUATION, SOURCE_REASONING, and CONVERSATION. Each task has a bounded input/output budget and an ordered provider/model route configurable through `AI_TASK_ROUTES`.

## 11. Input truncation and compression

Structured task input bypasses the legacy chat compression path. Oversized input is rejected before inference instead of slicing JSON, source quotes, tables, or formulas. Provider output ending because of token limits, empty public output, and hidden reasoning markup are rejected so the next route or grounded fallback can run.

## 12. Cost and cache strategy

Source understanding persists per resource fingerprint. Tutor plans persist once per concept, objective, full grounding fingerprint, and schema version. Ask Flow is the only ordinary per-question reasoning call; protected assessment hints are deterministic. Remediation generates only after a failed attempt. Routes and output caps remain operator-configurable.

## 13. Finite-difference trace

The simulated model-output fixture validates as five coherent moments: exact derivative rules versus the discrete-data problem; the real table `x=1, f(x)=3` and `x=2, f(x)=8`; `[f(x+h)-f(x)] / h` with `x`, `h`, and function-value meanings; a progressive worked example mapping `f(1)=3`, `f(2)=8`, and `h=1`, calculating `8-3=5` then `5/1=5`; interpretation as an approximation from discrete data; then an explanation check. Continue is locked until each worked step is revealed.

## 14. Biology trace

The circulation fixture validates as a pathway through Right heart, Lungs, Left heart, and Body, grounded in the stated pump and gas-exchange roles. It does not invent a return edge as a visual cycle when the selected source does not establish one.

## 15. Computer-science trace

The architecture fixture validates labeled direction and data flow from React Native to API to Spring Boot to PostgreSQL. The renderer now presents source, destination, and edge meaning rather than an unlabeled list of boxes.

## 16. Literature trace

The literature fixture validates a claim/behavior comparison followed by the source quotation and contradiction interpretation, then assessment. Quoted evidence must occur exactly on a cited page.

## 17. Tests and builds

The acceptance traces use simulated provider outputs and do not claim live-model quality. They exercise the real routing, JSON decoding, validation, activity adapter, player, Ask Flow, and persistence paths. The focused tutor suite passes 15 tests, and the focused feature-flag suite passes 3 tests with subtests for both flags and every supported value. The complete Learning suite passes 128 tests. Django system check, Library migration drift check, frontend production build, and `git diff --check` pass. The Journey-specific TypeScript scan reports no Journey/API/type errors; the repository-wide compiler still reports 21 pre-existing errors in unrelated dashboard, groups, Library, audio, auth, export, and test files.

## 18. Files changed

Backend changes cover `ai_assistant/services.py`, `ai_assistant/task_routing.py`, `core/settings.py`, Learning grounding, planning, tutor contracts, tutor engine, Ask Flow, player-facing views, completion, diagnostics, tests and fixtures, plus the E.5.2A Library source-understanding and extraction files. Frontend changes cover Journey World, Flow Reaction, learning-object renderers, Ask Flow panel, API calls, and Journey types. Detailed paths remain visible in `git status` and no unrelated changes were discarded.

## 19. Migrations

`library/migrations/0019_resource_source_understanding.py` adds the persisted structured source-understanding JSON field. No new Learning table is required because Tutor Plans, player state, reveal cursors, prerequisite state, and evidence fit the existing session state and turn/attempt records.

## 20. Known limitations

Live provider credentials were not used, so provider-specific lesson quality still needs staging evaluation. Formula notation remains plain source text unless its mathematical layout is already trusted. Geometry-based graphs and labeled diagrams are rejected without validated source geometry. Existing non-version-3 sessions retain their legacy grounded fallback path. The repository still reports unrelated TypeScript diagnostics outside Journey and an existing SQLite startup warning from PostgreSQL-specific Learning SQL.

## 21. Production configuration

`JOURNEY_TEACHING_AI_ENABLED` and `SOURCE_UNDERSTANDING_AI_ENABLED` both default to enabled when absent. Set either variable explicitly to `false`, `0`, `no`, `off`, or `disabled` for an immediate, independent emergency rollback. Ask Flow and the E.5.2B tutor engine introduce no additional feature flag; tutor generation, semantic evaluation, and remediation use the Journey switch. Configure valid provider credentials and benchmarked `AI_TASK_ROUTES` JSON per task; the checked-in models are routing defaults, not a quality claim. Apply migration 0019, ensure resource processing populates `source_understanding`, and monitor `[Tutor inference]` metadata for task, provider, model, fallback, latency, schema validity, accepted state, grounding fingerprint, and plan version. Logs intentionally omit source content, learner answers, secrets, and hidden reasoning.
