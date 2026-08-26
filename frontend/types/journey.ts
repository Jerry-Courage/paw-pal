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
  stage: 'hook' | 'interact' | 'check' | 'reflect'
  type: 'predict' | 'mcq' | 'short_answer' | 'reflection'
  prompt: string
  options?: string[]
}

export interface EncounterActivitiesResponse {
  activities: EncounterActivity[]
  subject_family: string
  goal_mode: string
}

export interface EncounterAttemptResponse {
  attempt_id: string
  correct: boolean | null
  score: number
  feedback: string
  evidence_score: number | null
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
