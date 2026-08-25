export type LearnerType = 'university' | 'shs' | 'professional' | 'self_learning'
export type LearningDifficulty = 'understanding' | 'remembering' | 'exam_prep' | 'assignments' | 'consistency' | 'everything'
export type StarterIdentity = 'ember' | 'pulse' | 'orbit' | 'nova'

export interface OnboardingProfile {
  version: 2
  current_step: number
  learner_type?: LearnerType
  subjects: string[]
  difficulties: LearningDifficulty[]
  starter_identity?: StarterIdentity
  completed?: boolean
}

export interface OnboardingUpdate {
  current_step?: number
  learner_type?: LearnerType
  subjects?: string[]
  difficulties?: LearningDifficulty[]
  starter_identity?: StarterIdentity
  completed?: boolean
}

