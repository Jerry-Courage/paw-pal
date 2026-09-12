# E.5.2E.1 Representation and Objective Convergence

Status: implementation complete; awaiting release approval. This phase has not been committed, pushed, or deployed.

## Root cause and correction

Learner labels were previously derived by splitting a proposition at the first matching verb. That made labels depend on sentence position, retained subordinate openers such as `When oxygen`, and could split valid terms whose spelling contained a verb token. Objective text then exposed that fragment without validating it as a complete learner-facing phrase.

The pedagogical knowledge layer now derives labels from the validated semantic subject, definition target, process or architecture name, claim, or worked-example problem. It removes subordinate framing only where the remaining clause is complete, rejects transition and dangling fragments, and falls back only to a same-record grounded concept label. Objectives now carry the concept label, semantic type, knowledge IDs, and a supported capability, then render that capability as grammatical learner-facing text.

## Frozen-domain acceptance

| Domain | Previous deterministic output | Selected and emitted output | Learner objective | Score |
| --- | --- | --- | --- | ---: |
| Mathematics | `GROUNDED_EXPLANATION` | `WORKED_EXAMPLE` | Work through derivative estimate at x=1. | 57/60 |
| Computer science | `GROUNDED_EXPLANATION` | `ARCHITECTURE` | Order the stages in React Native to PostgreSQL flow. | 56/60 |
| Biology | `GROUNDED_EXPLANATION` | `PROCESS_FLOW` | Explain the mechanism involving Stages in mitochondria. | 54/60 |
| Literature | `GROUNDED_EXPLANATION` | `EVIDENCE_HIGHLIGHT` | Identify evidence supporting Mara's claim. | 56/60 |

Previous scores were 45/60, 43/60, 41/60, and 47/60 respectively. The unchanged 60-point rubric was rerun against the production extraction, knowledge selection, deterministic assembly, validation, and activity-adaptation path. Provider transport was mocked; no live provider credentials or production QA document were used.

The mathematics activity contains a problem, givens/known values, formula, substitutions, intermediate steps, result, and interpretation. The computer-science activity contains source-supported components, nodes, edges, and connections. The biology activity contains linked stages and directional edges supported by an explicit relationship. The literature activity contains a claim, quoted evidence, and the typed claim-evidence relationship.

The contract requires `selected_representation` to match the emitted deterministic representation. A downgrade must carry `representation_fallback_reason` with one of `INSUFFICIENT_STRUCTURED_SOURCE`, `UNSUPPORTED_RENDERER`, or `VALIDATION_FAILURE`. None of the four acceptance fixtures downgraded.

## Learner-state input

Teaching-plan generation now receives a bounded learner-state payload when persisted state exists: known prerequisite knowledge IDs, prior objective evidence, observed misconception IDs, and previously used representations. An empty object remains valid for a first objective. Learner state participates in the plan fingerprint only when nonempty, preserving first-objective cache compatibility.

## Verification

- E.5.2E and E.5.2E.1: 24 passed
- E.5.2D pedagogical-signal suite: 24 passed
- Domain-generalization suite: 9 passed
- Material-quality suite: 11 passed
- Teaching Plan suite: 24 passed
- Tutor/Ask Flow suite: 18 passed
- Complete Learning and Library checkpoint: 207 passed
- Django system check: passed with 0 issues
- Frontend production build: passed; 25/25 static pages generated
- Journey-specific TypeScript review: no Journey/E.5.2E.1 errors; the repository-wide command still reports 21 unrelated pre-existing errors
- `git diff --check`: passed

The frontend build continued to report the known unavailable Google-font download, stale Browserslist data, an ambiguous Tailwind class, and a GitHub fetch `EACCES`; the build completed. Local Django startup continued to log the existing SQLite startup-table query warning, while the Django system check and test database checks passed.

## Revision and migration impact

Pedagogical knowledge revision is now 3 and deterministic teaching-plan revision is 5 so stored derived data is rebuilt under the new contracts. E.5.2E.1 adds no configuration setting and no migration. The uncommitted E.5.2E work still includes `learning.0010_conceptnode_knowledge_binding`. `makemigrations --check --dry-run learning library` continues to report unrelated pre-existing Learning model metadata drift; no E.5.2E.1 schema change was introduced.

## Bounded limitations

The deterministic process builder uses only explicit arrows, condition/outcome syntax, allowing relationships, or explicit sequencing language. Sources without enough structure downgrade with a recorded reason. Live provider output quality was not compared because no provider credential was available; the identical production payload/contract and mocked provider transports were validated. Historical misconception events without persisted IDs cannot be reconstructed, while newly recorded evidence retains those IDs for later plans.
