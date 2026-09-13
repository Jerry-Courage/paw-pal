import assert from 'node:assert/strict'
// @ts-expect-error Node's native type-strip runner requires the source extension.
import { journeyDisplayProgress, journeySubmissionTransition, surfacedConceptLabel, submissionErrorCopy } from './journeyRuntime.ts'

assert.equal(journeyDisplayProgress(100, false, 'ENRICHMENT'), 99)
assert.equal(journeyDisplayProgress(99.9, false, 'ENRICHMENT'), 99)
assert.equal(journeyDisplayProgress(100, true, 'STUDY_KIT'), 99)
assert.equal(journeyDisplayProgress(100, true, 'JOURNEY_READY'), 100)
assert.equal(surfacedConceptLabel(1), '1 major concept surfaced')
assert.equal(surfacedConceptLabel(4), '4 major concepts surfaced')
assert.match(submissionErrorCopy(409), /saved point/)
assert.match(submissionErrorCopy(500), /answer.*safe/i)

const typedAnswer = 'Backpressure slows producers when the consumer falls behind.'
const interaction = journeySubmissionTransition({ submission: {
  feedback: 'Focus on the producer-to-consumer relationship.',
  next_stage: { id: 'queue-objective:remediation-evidence' },
  remediation_requested: true,
  state_reset: false,
} })
assert.equal(typedAnswer, 'Backpressure slows producers when the consumer falls behind.')
assert.equal(interaction.feedbackVisible, true)
assert.equal(interaction.remediationVisible, true)
assert.equal(interaction.nextStageId, 'queue-objective:remediation-evidence')
assert.equal(interaction.navigationRequested, false)
assert.equal(interaction.stateReset, false)

console.log('Journey runtime regression checks passed')
