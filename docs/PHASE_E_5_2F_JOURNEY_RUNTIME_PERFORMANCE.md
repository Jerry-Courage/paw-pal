# Phase E.5.2F — Journey runtime performance and preparation

## Scope

This phase moves Tutor Plan generation out of the ordinary click/check path, preserves a stable base-plan cache, adds bounded preparation, and makes internal remediation failures recover safely. It does not change provider routing, prompts, feature flags, migrations, or Journey UI structure.

## Runtime lifecycle

- Journey construction queues objective 0 after the database transaction commits.
- Opening a lesson consumes its validated cached plan and queues only objective N+1.
- A correct Check response records evidence and returns without generating the next objective. Objective N+1 is queued after commit.
- An answer attempt, score, or misconception does not invalidate the base plan. Remediation is stored separately while retaining `base_plan` and `base_fingerprint`.
- Optional selected-resource enrichment is queued only after the resource is marked `ready` with `Journey ready` status.

Tutor Plan cache identity includes the source/understanding fingerprint, pedagogy revision, concept knowledge binding, objective and objective fingerprint, known prerequisite class, and Tutor Plan schema revision. Attempt-level adaptive state is excluded.

## Safe timing telemetry

Backend lesson-open and Check paths emit `[JOURNEY PERF]` records with operation, resource/concept/objective IDs, cache status, provider/model attribution, generation, validation, serialization, stage, and total milliseconds. Frontend telemetry records click-to-request, request duration, and click-to-render. Source text and learner answers are not logged.

## Remediation

The common remediation path uses deterministic, grounded claim decomposition and an evidence highlight. Provider-backed remediation remains available only when the local path cannot produce a valid plan. Generated candidates are validated; invalid source quotations, schema failures, and provider failures are logged internally and fall back to grounded remediation. API errors use recoverable learner-facing copy and never return validator/provider details.

## Granularity and preview audit

The material preview now reports validated knowledge-object count, learner-topic count, Journey-concept count, and objective count. Runtime mapping groups knowledge objects into learner-facing topics; it does not automatically create one Journey node per proposition. Preview labels are rebuilt through the existing learner-facing concept-label validator to prevent arbitrary proposition, publisher, or fragment text from being displayed.

## Local deterministic benchmark

The benchmark uses a synthetic local fixture, local SQLite, and deterministic generation. It excludes network and provider latency.

| Operation | Median | p95 | Model calls | Median DB queries | Cache |
| --- | ---: | ---: | ---: | ---: | --- |
| Cached node open | 9.93 ms | 12.89 ms | 0 | 1 | hit |
| Uncached deterministic generation | 21.41 ms | 21.97 ms | 0 | 1 | miss |
| Correct Check | 0.08 ms | 0.09 ms | 0 | 0 | base hit |
| Incorrect Check | 0.06 ms | 0.06 ms | 0 | 0 | base hit |
| Learning-signal Check | 0.02 ms | 0.02 ms | 0 | 0 | base hit |
| Remediation fallback | 6.58 ms | 6.78 ms | 0 | 0 | base hit |

Focused request instrumentation on the Django test stack measured a cached lesson open at 33.28 ms total (2.00 ms backend lookup, 17.62 ms grounding, 2.63 ms plan lookup including 2.04 ms validation, 5.35 ms concept/objective lookup, 5.66 ms activity conversion, and 0.01 ms serialization) with zero model calls. Final Check examples measured 42–73 ms total; evaluation was 0.06–12.33 ms, deterministic remediation 6.70–13.68 ms when used, serialization 2.85–5.07 ms, and zero model calls.

## Verification

- Complete Learning + Library checkpoint: 224 passed.
- Focused E.5.2F backend tests: 32 passed.
- Frontend Journey runtime assertions: 17 passed.
- Frontend production build: passed. Font optimization could not reach Google Fonts in the restricted environment; Next.js skipped that optional optimization. Browserslist data and one pre-existing Tailwind ambiguity were reported as warnings.
- Django system check: passed with 0 issues. Existing startup warnings remain for database access during app initialization and a local SQLite-specific startup-table query.
- Migration check: no E.5.2F migration was added. The repository still reports pre-existing prospective `learning.0011` and `users.0014` drift.
- `git diff --check`: passed with line-ending conversion warnings only.

## Production expectations and limits

Local numbers validate call counts and lifecycle behavior; they do not predict provider or production network latency. An uncached AI lesson still depends on the configured provider’s response time, worker availability, and queue delay. First/next preparation requires a running Django-Q worker. Telemetry is emitted to application/browser logs and still needs production observation to establish production median and p95 values.
