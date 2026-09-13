# Phase E.5.2G — Evidence and Assessment Convergence

## Scope

E.5.2G gives every written Journey check one assessment target derived from the objective, its validated knowledge IDs, pedagogical relationships, and source references. The same target now drives the learner prompt, evaluation, feedback, and remediation.

## Root cause and repair

Previously, written evaluation compared normalized answer text with a single expected string and otherwise sent a small `{answer, expected, taught_knowledge}` payload to a Boolean-only model schema. Provider or schema failures were returned as learner insufficiency. Remediation then replaced the failed check with a generic sentence-grammar prompt. This allowed a grounded paraphrase to become an incorrect or unknown outcome for a pipeline reason and broke the link between what Flow taught and what it tested.

The assessment contract now contains the objective ID, tested knowledge IDs, capability, expected propositions and concepts, required relationships, acceptable paraphrases, source support, prohibited claims, thresholds, and rubric. Exact and high-confidence structured evidence use deterministic paths. Ambiguous answers use the existing `MASTERY_EVALUATION` route with the structured target. The validated model result distinguishes correct, partial, and incorrect. Provider and schema failures return `ungradable_system_error`; they do not create a graded attempt or change the learner's stage.

An exact answer is accepted without a model call unless the activity explicitly sets `additional_evidence_required`. That flag makes the evaluator require evidence of the requested capability as well as proposition recall.

## Evaluation traces

Representative deterministic trace:

```text
provider=deterministic model=none fallback=false validation=accepted
outcome=correct path=grounded_exact objective_id=<objective>
knowledge_ids=[<knowledge-id>] capability=EXPLAIN_MECHANISM
```

Representative semantic-provider trace:

```text
provider=<configured provider> model=<configured model> fallback=false
validation=accepted outcome=partial latency_ms=<measured>
```

Representative provider/schema failure:

```text
provider=<configured provider> model=<configured model> fallback=true
validation=rejected error=<exception type> latency_ms=<measured>
outcome=ungradable_system_error next_action=RETRY_CHECK
```

Logs identify routing, model, latency, fallback, validation, outcome, objective, knowledge IDs, and capability where those values are available. They do not log credentials or full learner responses.

## Learner behavior

- Correct semantic paraphrases advance.
- Partial evidence receives a specific missing-element message and focused reteaching.
- Incorrect or contradictory evidence receives remediation tied to the same knowledge IDs and capability.
- “I don't know” and “that wasn't taught” remain non-graded learning signals.
- Empty answers remain retryable checks.
- Evaluation infrastructure failures preserve the answer and Journey position and ask the learner to retry.
- Required checks do not expose Continue while Check is active.
- Evidence Highlight remediation shows what matters, why it matters, and the relationship to establish before asking a fresh capability-aligned question.

## Provider, configuration, and data

Provider routing and Tutor prompts outside the evaluator are unchanged. The semantic fallback uses the checked-in `MASTERY_EVALUATION` route and existing environment-supplied credentials. No credentials or environment files are introduced.

This phase adds no model changes or migrations. It preserves the existing Journey and Source Understanding feature-flag defaults.

## Validation coverage

The phase suite covers exact answers, concise and longer paraphrases, partial evidence, contradictions, unsupported answers, learning signals, provider/schema failure, structured provider payloads, capability prompts, target convergence, remediation, and the required-check navigation gate. Cross-domain cases cover mathematics, computer science, biology, literature, and history, including incomplete relationship evidence.

The deterministic lexical layer is intentionally conservative. Answers it cannot classify with confidence require a healthy configured semantic provider. A provider outage produces a retryable system outcome rather than a guessed learner grade.
