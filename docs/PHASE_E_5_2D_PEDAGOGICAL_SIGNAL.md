# E.5.2D — Pedagogical signal selection and lesson assembly

The implementation below was accepted locally before release. Release is now approved on domain-general deterministic and regression coverage. The production QA PDF is reserved for blind, black-box testing after deployment; it is not a pre-release gate and must not be inspected or used for tuning.

## Acceptance boundary

The exact reported production sentence is covered. The original respiration PDF was not supplied or available in the repository. `pedagogical_signal.json` pairs that exact sentence with explicitly synthetic adjacent instructional prose, drawing on the existing respiration regression fixture. **This does not establish acceptance against the actual production PDF.** The complete reproducible synthetic trace is in [PHASE_E_5_2D_LESSON_TRACE.json](PHASE_E_5_2D_LESSON_TRACE.json). Real-PDF extraction, visual availability, and live provider behavior still require QA with that source.

## 1. Why production selected the sentence

The old extractor promoted sufficiently long lines containing “is” or “are” to concepts. Instructional page membership was treated as pedagogical permission. Objectives took early source items and used “Explain the meaning and significance of this source statement.” The deterministic lesson then selected nearby first/last lines, allowing captions and editorial prose into teaching. Page IDs could count as taught knowledge.

## 2. New classification and selection

The exact failure sentence is classified `FURTHER_READING`: its assertion concerns references and access to additional reading rather than a biological relationship. Other research commentary, document-scope announcements, navigation, attribution, transitions, and captions remain source context. None are authorized knowledge targets.

`library/pedagogical_knowledge.py` adds an independent pedagogy revision to schema v2. It classifies propositions using discourse roles and predicate structure before considering source semantic hints. A generic extracted FACT no longer automatically qualifies. It records explanatory value, usefulness, source support, relationship density, dependency significance, applicability, assessment suitability, novelty, redundancy, and editorial/citation/transition signals. These are auditable heuristic scores, not calibrated probabilities.

Accepted records have stable content/page-based IDs, propositions, learner concepts, exact page/block references, semantic roles, related knowledge IDs, supported prerequisite relationships, examples, representation candidates, assessment possibilities, importance, and extraction confidence. Source-typed relationships retain provenance. Lexical relatedness enables grouping; it does not invent causal edges. Captions receive support links but no teaching IDs. Older schema-v2 records rebuild lazily while preserving page numbers and structure.

## 3–5. Selected knowledge, first objective, and complete arc

The synthetic regression selects:

| Knowledge ID | Knowledge |
| --- | --- |
| `knowledge-6ecbfefb271f4f96` | Gas exchange is diffusion of oxygen and carbon dioxide across a respiratory surface. |
| `knowledge-75f9d20fffd8456c` | Surface area and diffusion distance affect the rate of gas exchange. |
| `knowledge-7770a3afbaa740b1` | Blood carries oxygen from lungs to tissues and returns carbon dioxide. |

The accepted objective is: **“Explain Gas exchange and connect it to A large surface area and a short diffusion distance.”** Its knowledge IDs cover all three selected propositions. The source definition ranks as an explanatory foundation; its related propositions provide conditions and a transport connection. No editorial proposition becomes an objective or check.

The deterministic arc uses `GROUNDED_EXPLANATION` throughout:

1. **HOOK:** “We are learning about Gas exchange. Gas exchange means diffusion of oxygen and carbon dioxide across a respiratory surface.” Establish the primary definition first.
2. **IDEA:** “A large surface area and a short diffusion distance increase the rate of gas exchange. The two explanations connect through diffusion, exchange, gas.” Establish the source-supported conditions alongside the definition.
3. **CONNECT:** “Blood transports oxygen from the lungs to tissues and returns carbon dioxide to the lungs. Use this alongside the earlier explanation of Gas exchange.” Add the related transport proposition with its own provenance.
4. **VERIFY:** “Explain Gas exchange and connect it to the other ideas you learned. What relationships matter?” The expected evidence covers the three previously taught propositions.

Each moment includes an attention cue, intended change in understanding, transition, exact quotation, source references, and teaching/testing dependencies. The JSON trace includes every field, selection scores/reasons, and rejected propositions.

## 6. Figures and captions

“Figure 2. Gas exchange through skin and primitive lungs.” is `CAPTION_ONLY`, remains in source context, and may link to relevant knowledge objects. It is not an objective, standalone teaching moment, or assessment target. Its visual is marked unverified. This patch does not pretend an extracted caption establishes an available image or reconstruct unseen geometry.

## 7. Assessment dependencies

The trace's check records all three IDs above in both `tests` and `tested_knowledge_ids`. Validation requires tested IDs to have been established earlier or as known prerequisites. It rejects page IDs, forged title/citation teaching, editorial expected answers, and disagreement between dependency fields. Exact supporting propositions must appear in visible teaching content, not merely in a source citation. Runtime submission independently checks completed teaching IDs or previously mastered knowledge IDs. Completing an unrelated lesson does not authorize the check.

## 8–9. Learner signals and remediation

“I don't know,” “wasn't taught,” “I don't understand,” “no idea,” and “can you explain again” return `learning_signal`, `correct: null`, `score: null`, and no attempt ID. They create no EncounterAttempt, misconception, or mastery evidence. Submissions remain idempotent.

The controller acknowledges the gap and clears player completion state to return to the validated teaching arc. Missing-teaching signals use `BRIDGE_MISSING_KNOWLEDGE`; requests for explanation use `RETEACH`. This deterministic behavior replays the grounded explanation; it does not claim to generate a new visual or diagnose an unseen prerequisite. Existing AI remediation remains available for actual conceptual attempts.

Objective validation runs before cached or generated plans are used. Invalid targets regenerate from accepted knowledge. Their stale cached plans, player state, objective evidence, and covered/understood flags are removed. The frontend clears the prior answer/result on a learning signal and plays no correct/incorrect sound.

## 10–11. Cross-domain results and verification

Six-domain acceptance covers respiration, mathematics, computer science, literature, history, and chemistry. Editorial asides are rejected while instructional propositions remain teachable. Counterexamples verify that citation, research, and chapter terminology can itself be instructional when the assertion defines or explains it. Runtime source searches find no respiration-specific branch or exact fixture sentence special case.

| Verification | Result |
| --- | --- |
| E.5.2D pedagogical-signal acceptance | 23 tests passed |
| Existing domain-generalization gate | 9 tests passed |
| Material-quality suite | 11 tests passed |
| Teaching-plan suite | 24 tests passed |
| Tutor/Ask Flow suite | 18 tests passed |
| Combined focused verification | 85 tests passed |
| Complete Learning + Library checkpoint | 182 tests passed |
| Django system check | No issues |
| Library migration check | No changes detected |
| Frontend production build | Passed |
| Journey-specific TypeScript diagnostics | No diagnostics in changed Journey files |
| Repository-wide TypeScript check | 21 unrelated diagnostics remain; not a clean repository-wide typecheck |
| `git diff --check` | Passed |

No migration or feature-flag change is needed. `JOURNEY_TEACHING_AI_ENABLED` and `SOURCE_UNDERSTANDING_AI_ENABLED` retain their existing absent=true defaults and independent explicit false-value rollback behavior. Provider credentials and routes are unchanged.

## 12. Files changed

- `backend/library/pedagogical_knowledge.py`: proposition classification, scoring, knowledge objects, relationships, objective gate.
- `backend/library/source_understanding.py`: extraction/AI integration, topic gate, revision-aware caching and grounding.
- `backend/learning/material_grounding.py`: knowledge objectives, provenance-preserving lazy rebuild, runtime dependency gate.
- `backend/learning/teaching_plan.py`: validated target selection, connected lesson assembly, objective regeneration and assessment dependencies.
- `backend/learning/tutor_contract.py`: knowledge-level teaching and assessment authorization.
- `backend/learning/tutor_engine.py`: generation contract and non-graded learning signals.
- `backend/learning/views.py`: authoritative session response and regeneration handling.
- `backend/learning/test_tutor_engine.py`: existing fixtures upgraded from page IDs to proposition IDs.
- `backend/learning/test_pedagogical_signal.py`: 23 acceptance and session regression tests.
- `backend/learning/fixtures/pedagogical_signal.json`: six-domain editorial/instructional fixtures.
- `frontend/components/journey-world/JourneyWorld.tsx`: ungraded signal handling without feedback sounds.
- `frontend/types/journey.ts`: nullable teaching evaluation score and learning-signal outcome.
- `docs/PHASE_E_5_2D_LESSON_TRACE.json`: complete synthetic acceptance trace.
- `docs/PHASE_E_5_2D_PEDAGOGICAL_SIGNAL.md`: this report.

## 13. Known limitations

- Actual respiration-PDF acceptance remains outstanding because the original document is unavailable. No production data or deployed behavior was inspected during this phase.
- Deterministic English discourse/predicate heuristics are conservative and incomplete. Ambiguous paraphrases, OCR errors, pronoun resolution, and unfamiliar constructions may be rejected or misclassified. Scores are selection heuristics rather than a trained pedagogical model.
- Visible exact proposition support is deliberately strict. It can reject a valid fully paraphrased AI lesson and fall back to extractive, connected explanations. Lexical associations are not proof of causation.
- The deterministic fallback supplies a supported explanation and replay, not a newly generated representation or a validated visual. Long/complex source structures can still require provider assistance or clearer material.
- Tests cover deterministic paths and mocked provider contracts; they do not prove live production provider availability or teaching quality on the missing PDF.
- Existing local startup warnings remain: database access during Django initialization, a SQLite-incompatible startup table query (`near "FROM": syntax error`), and missing local `staticfiles`. They do not fail these tests/system checks and were not changed in this phase.
- Next's build is configured separately from the standalone repository-wide TypeScript check; a successful build does not mean unrelated type errors are resolved.

Release preparation preserves the approved implementation without source-specific tuning. The E.5.2D runtime diff contains no respiration, frog, gill, UNESCO/EOLSS, failure-sentence, or fixture-name branches. An unchanged pre-E.5.2D publisher-metadata regex in source_understanding.py still mentions UNESCO/EOLSS; this is disclosed rather than misrepresented as absent. Synthetic fixture examples in this report and its trace are acceptance documentation, not production rules. No E.5.3 work is included.
