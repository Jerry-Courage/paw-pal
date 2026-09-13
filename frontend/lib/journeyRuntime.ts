export type JourneySubmissionError = {
  error?: string
  message?: string
  recoverable?: boolean
  next_action?: string
}

type SubmissionPayload = {
  feedback?: string
  next_stage?: { id?: string }
  remediation_requested?: boolean
  state_reset?: boolean
}

export function journeySubmissionTransition<T extends SubmissionPayload>(response: { submission?: T }) {
  const submission = response.submission || null
  return {
    submission,
    feedbackVisible: Boolean(submission?.feedback),
    nextStageId: submission?.next_stage?.id || '',
    remediationVisible: Boolean(submission?.remediation_requested),
    navigationRequested: false,
    stateReset: Boolean(submission?.state_reset),
  }
}

export function journeyDisplayProgress(raw: unknown, ready: boolean, stage?: string): number {
  const parsed = Number(raw)
  const progress = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
  return ready && stage === 'JOURNEY_READY' ? 100 : Math.min(progress, 99)
}

export function surfacedConceptLabel(count: number): string {
  return `${count} major ${count === 1 ? 'concept' : 'concepts'} surfaced`
}

export function submissionErrorCopy(status?: number, payload?: JourneySubmissionError): string {
  if (payload?.message) return payload.message
  if (status === 401) return 'Your session expired. Sign in again; your answer is still here.'
  if (status === 403) return 'This Journey is not available to this account.'
  if (status === 404) return 'This check is no longer available. Refresh the lesson to continue.'
  if (status === 409) return 'This lesson changed while you were answering. Refresh to continue from the saved point.'
  if (status === 422) return 'Flow could not evaluate that response. Adjust it and try again.'
  return 'Flow could not check that answer. Your place and answer are still safe.'
}

export function beginJourneySubmission(lock: { current: boolean }): boolean {
  if (lock.current) return false
  lock.current = true
  return true
}
