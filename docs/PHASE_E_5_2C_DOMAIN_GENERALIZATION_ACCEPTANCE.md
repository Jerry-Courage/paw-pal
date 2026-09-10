# E.5.2C Domain Generalization Acceptance

Status: **PASS** (deterministic acceptance, six domains). The respiration material remains a regression fixture for metadata filtering. Production inference contains no fixture-name or fixture-phrase branches.

## Contract

Source Understanding v2 records domain-neutral `semantic_units` and `knowledge_relationships` alongside the existing extracted collections. Semantic units use primitives such as definition, process, formula, worked example, claim, evidence, timeline event, cause/effect, architecture, code, data table, rule, exception, and misconception. Relationships use typed edges such as prerequisite, part, cause, contrast, evidence, derivation, dependency, application, sequence, and data flow.

Tutor representation selection reads those grounded semantics. The subject label remains descriptive context and does not select or reject a representation. Topic hierarchy remains available for navigation; teaching planning also consumes semantic units and typed relationships. Page selection scores instructional text rather than metadata text.

## Acceptance results

| Source | Detected knowledge | Conceptual structure and relationships | Objective | First teaching arc | Representation | Assessment |
|---|---|---|---|---|---|---|
| Respiration / biology, metadata-heavy PDF | definition, fact, process | respiratory definitions and mechanisms across instructional sections; front matter excluded | explain gas exchange and respiration | hook → idea → connection → verification | process flow | content-specific short answer |
| Finite differencing / mathematics, sparse slides and formula-heavy worked material | definition, concept, formula, derivation, example, worked example | motivation → formula/variables → substitutions → interpreted estimate | use the forward difference on discrete data | context → idea → worked showing → verification | worked example | step solver |
| Software architecture / computer science, dense prose | definition, fact, architecture | client → interface → service → database with typed `LEADS_TO` edges | trace a request through component responsibilities | context → architecture showing → connection → verification | architecture/data flow | component matching |
| Literature, mixed claim and quotations | claim, quotation, evidence, relationship | claim ↔ behaviour contradiction; quotations provide `EVIDENCE_FOR` the interpretation | connect honesty claims to textual evidence | context → evidence showing → connection → verification | evidence highlight | evidence selection |
| History / social science, chronological prose | timeline event, cause/effect, fact | dated events linked by `PRECEDES`; wage pressure and strike consequences linked by `CAUSES` | explain the strike-to-settlement chronology | context → timeline showing → causal connection → verification | timeline | ordering |
| Chemistry, table plus prose | definition, data table, cause/effect, example, rule | conditions/observations table plus temperature → collision frequency causal link | explain how conditions affect reaction rate | context → causal idea → evidence connection → verification | cause/effect | reasoning short answer |

The arcs vary by semantic shape, with five representation families and four arc shapes across the required fixtures. A minimal one-statement source produces a shorter plan than the multi-region fixtures, proving plan length is not fixed.

## Anti-overfitting evidence

- Renaming the software source as botany leaves its semantic types and architecture representation unchanged.
- Economics metadata is filtered without biology terminology.
- Topic counts, hierarchy depths, and Tutor Plan lengths differ with material shape.
- Representation selection returns the same result when the same grounding is paired with Biology, Literature, History, or an unfamiliar subject label.
- Production source is scanned for acceptance-fixture phrases; none are present.
- Fixture expectations exist only in test fixtures and tests and cannot enter runtime inference.

## Explicit answer

**Is any production behavior special-cased for the respiration fixture? NO.**

The acceptance tests are in `learning/test_domain_generalization.py`; the material is isolated in `learning/fixtures/domain_generalization.json` and the pre-existing respiration regression fixture.
