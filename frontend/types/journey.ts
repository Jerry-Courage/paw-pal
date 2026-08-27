export type JourneyDepth = 'quick' | 'standard' | 'deep'
export type JourneyStatus = 'draft' | 'active' | 'paused' | 'completed'
export type ConceptStatus = 'locked' | 'current' | 'completed'
export type ConceptDifficulty = 'easy' | 'medium' | 'hard'

export interface JourneyPreviewConcept {
  title: string
  difficulty: ConceptDifficulty
  estimated_minutes: number
}

export interface JourneyPreviewUnit {
  title: string
  concept_count: number
  concepts: JourneyPreviewConcept[]
}

export interface JourneyPreviewRequest {
  goal: string
  resources: number[]
  depth: JourneyDepth
}

export interface JourneyPreviewResponse extends JourneyPreviewRequest {
  resource_count: number
  units: JourneyPreviewUnit[]
  total_concepts: number
  estimated_minutes: number
}

export interface BuildJourneyRequest extends JourneyPreviewRequest {
  title?: string
}

export interface BuildJourneyResponse {
  id: string
  title: string
  goal: string
  depth: JourneyDepth
  total_concepts: number
  units: Array<{
    id: string
    path: string
    title: string
    description: string
    order_index: number
    concept_count: number
    completed_count: number
    created_at: string
  }>
}

export interface JourneyRoadmapNode {
  id: string
  type: 'concept'
  unit_id: string | null
  title: string
  mastery: number
  status: ConceptStatus
  difficulty: ConceptDifficulty
  order: number
  xp_earned: number
  estimated_minutes: number
  reviews_due: number
}

export interface JourneyRoadmapResponse {
  units: Array<{
    id: string
    type: 'unit'
    title: string
    order: number
    concept_count: number
    completed_count: number
  }>
  nodes: JourneyRoadmapNode[]
  edges: Array<{ from: string; to: string }>
}

export interface JourneyPathDetail {
  id: string
  title: string
  goal: string
  depth: JourneyDepth
  status: JourneyStatus
  concepts_completed: number
  total_concepts: number
  mastery_percent: number
}

export interface JourneyConceptDetail extends JourneyRoadmapNode {
  unit_title: string
  description: string
  summary: string
  source_resource_title: string
  source_page?: number | null
  source_section?: string
  key_definitions: Array<{ term?: string; name?: string; definition?: string; value?: string }>
}

export interface EncounterActivity {
  id: string
  concept_id: string
  purpose: 'diagnose' | 'learn' | 'apply' | 'check' | 'transfer' | 'reflect' | 'remediate'
  stage: string
  type: 'predict' | 'mcq' | 'scenario' | 'short_answer' | 'reflection' | 'comparison' | 'worked_example' | 'ordering'
  instructions?: string
  prompt: string
  options?: string[]
  content?: { columns?: string[]; rows?: string[][]; idea?: string; example?: string; items?: string[] }
  explanation?: string
  hints?: string[]
  difficulty: string
  estimated_seconds: number
  grounding?: { resource_id?: number; resource_title?: string; section?: string; page?: number; excerpt?: string }
  goal_relevance: string
}

export interface EncounterActivitiesResponse {
  activities: EncounterActivity[]
  subject_family: string
  goal_mode: string
  depth: JourneyDepth
  attempt_count: number
}

export interface EncounterAttemptResponse {
  attempt_id: string
  correct: boolean | null
  score: number
  feedback: string
  explanation: string
  hint: string
  evidence_score: number | null
  attempt_number: number
  recommend_flow: boolean
}

export interface TeachingTurn {
  id: string
  role: 'flow' | 'learner' | 'system'
  kind: 'message' | 'activity' | 'video' | 'flashcards' | 'voice' | 'completion'
  content: string
  payload: { activity?: EncounterActivity; videos?: Array<{ video_id: string; title: string; channel: string; duration_str: string; thumbnail: string; url: string; embed_url?: string; why?: string; objective_id?: string }>; cards?: Array<{ question: string; answer: string; difficulty: string }>; correct?: boolean | null; score?: number }
  created_at: string
}

export interface TeachingSessionResponse {
  id: string
  status: string
  current_point: number
  resume_point: number
  objectives: Array<{ id: string; text: string }>
  objectives_covered: string[]
  objectives_understood: string[]
  unresolved_misconceptions: string[]
  mastery: number
  conversation_summary: string
  turns: TeachingTurn[]
  last_active_at: string
  completed: boolean
  teaching_preferences: Record<string, string>
  completion_evaluation: {
    complete: boolean
    mastery: number
    objectives_total: number
    objectives_satisfied: number
    objectives: Array<{ id: string; text: string; taught: boolean; interacted: boolean; understood: boolean; best_score: number; unresolved_misconception: string; satisfied: boolean }>
    unresolved_objectives: Array<{ id: string; text: string; taught: boolean; interacted: boolean; understood: boolean; best_score: number; unresolved_misconception: string; satisfied: boolean }>
    unresolved_misconceptions: string[]
    recommended_next_action: string
  }
  evaluation?: { correct: boolean | null; score: number; feedback: string; attempt_id: string }
}

export interface ProgressionSummary {
  level: { num: number; rank: string }
  lifetime_xp: number
  flowcoins: number
  current_streak: number
  progress_percent: number
}

export interface JourneyAnalyticsResponse {
  total_concepts: number
  status_distribution: Partial<Record<ConceptStatus, number>>
  difficulty_mastery: Partial<Record<ConceptDifficulty, number>>
  total_xp: number
  average_mastery: number
  reviews_due: number
  overall_retention: number
}

export interface DueReviewsResponse {
  due: Array<{
    review_id: string
    concept_id: string
    concept_title: string
    last_score: number
    interval_days: number
    retention_rate: number
  }>
  count: number
}

export interface RewardResponse {
  xp: number
  flowcoins: number
  level: { previous: number; current: number; leveled_up: boolean }
  streak: { current: number; increased: boolean }
  missions: unknown[]
  achievements: unknown[]
}
