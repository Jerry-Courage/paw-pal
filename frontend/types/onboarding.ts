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
  resource_ids?: number[]
  journey_goal?: string
  journey_depth?: 'quick' | 'standard' | 'deep'
  journey_id?: string
  completed?: boolean
}

export interface OnboardingUpdate {
  current_step?: number
  learner_type?: LearnerType
  subjects?: string[]
  difficulties?: LearningDifficulty[]
  starter_identity?: StarterIdentity
  resource_ids?: number[]
  journey_goal?: string
  journey_depth?: 'quick' | 'standard' | 'deep'
  journey_id?: string
  completed?: boolean
}
