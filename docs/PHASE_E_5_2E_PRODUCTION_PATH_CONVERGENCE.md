# Phase E.5.2E — Production Path Convergence

## Runtime findings

The production failure was caused by four independent legacy/runtime paths:

1. `learning.views._extract_resource_concepts()` treated source-understanding `topics` as Journey concepts. `_build_topic_hierarchy()` admitted standalone section headings, so a metadata-like heading could pass the topic score and become a `ConceptNode`. This is why `SAMPLE CHAPTERS` could become both a concept and the first-word-derived `Sample Fundamentals` unit.
2. `FirstJourneyBuilder` displayed and counted `Resource.ai_concepts`, while the Journey preview API used source-understanding topics. A single compatibility concept therefore produced `1 major concepts surfaced`, independently of the validated pedagogical set.
3. `grounded_fallback_plan()` chose nearby page lines and rendered lexical term overlap as `The two explanations connect through ...`. The same adapter created broad checks and could expose incomplete extracted lines.
4. failed Tutor Plan remediation replaced the cached plan and cleared `session.state.player`. Player synchronization consequently selected the new sequence's intro, which looked like a full lesson restart.

## Authoritative current-resource path

For schema-v2 resources with pedagogy revision 2, the path is now:

`Resource.source_understanding` → accepted `knowledge_objects` → `learner_concepts` → revision-bound `ConceptNode` → knowledge-ID objective → knowledge-scoped grounding → Tutor Plan v3/plan revision 4 → teach-before-test activity sequence → targeted remediation.

Each current concept persists `knowledge_binding` with the understanding revision, knowledge IDs and `validated_knowledge_objects` source. Unit names use these learner concepts. Current structured resources fail closed when current validated knowledge is unavailable; the `ai_concepts`/notes adapter remains only for resources without reconstructable structured understanding.

Entering an older persisted Journey compares its binding with `version:pedagogy_revision:fingerprint`. A mismatch rebinds the concept and first unit title to current validated knowledge, regenerates objectives, and invalidates player, plan and objective-evidence caches before they can be reused. Teaching Plan fingerprints also include plan revision 4 and the full revision-bearing grounding.

## Quality controls

- Proposition revision 2 rejects clauses ending in conjunctions, object-requiring prepositions, determiners or subordinate markers.
- Adjacent instructional blocks are joined only when the first is unfinished and the next starts as a lowercase continuation. All contributing page/block references are retained. Untrusted joins are rejected.
- Objectives use one capability (`define`, `compare`, `identify mechanism`, `complete process`, `order sequence`, `apply`, `calculate`, `select evidence`, or `explain`) and validated knowledge IDs. Document-scope prose and incomplete objectives fail validation.
- Lexical similarity remains retrieval metadata. Only typed, source-provenanced pedagogical edges can authorize a CONNECT moment. No term list becomes learner copy.
- Teaching validation requires a complete body with information beyond its title. Checks name one concrete capability and test knowledge taught earlier in the same plan.
- Wrong answers diagnose the active knowledge gap, preserve completed stages, insert a changed `EVIDENCE_HIGHLIGHT` claim-decomposition moment and a fresh check, then continue at that remediation moment. “I don't know / wasn't taught” remains ungraded.

Safe logs expose resource ID, understanding and pedagogy revisions, concept source, legacy fallback, knowledge count, objective ID/knowledge IDs, generation path, plan revision, moment count, representation types and fallback. They never log source text or learner answers.

## Acceptance evidence

The generic acceptance fixture covers a metadata heading, scope prose, an adjacent page split, unrelated propositions with lexical overlap, and a wrong answer during an active objective. Its recorded trace is in `PHASE_E_5_2E_ACCEPTANCE_TRACE.json`.

Known limits: the deterministic completeness check is intentionally conservative and may reject unusual fragments; cross-page reconstruction requires an adjacent lowercase continuation; genuinely old resources without reconstructable text still use the isolated compatibility adapter. The repository has pre-existing model-state migration drift outside this phase and a pre-existing SQLite startup-check warning. No feature-flag default or provider route changed.
