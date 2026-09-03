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
  mastery_state?: { eligible: boolean; started: boolean; passed: boolean; score: number | null; review_objective_ids: string[] }
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
  objective_id?: string
  objective_index?: number
  purpose: 'diagnose' | 'learn' | 'apply' | 'check' | 'transfer' | 'reflect' | 'remediate'
  stage: string
  type: 'predict' | 'mcq' | 'scenario' | 'short_answer' | 'reflection' | 'step_solver' | 'comparison' | 'worked_example' | 'ordering' | 'matching' | 'sorting' | 'tap_target' | 'reveal' | 'flashcard' | 'concept' | 'key_idea' | 'process' | 'sequence' | 'relationship' | 'cause_effect' | 'formula' | 'example' | 'diagram' | 'evidence_highlight' | 'architecture' | 'simple_graph' | 'labeled_diagram' | 'callout'
  title?: string
  instructions?: string
  prompt: string
  options?: string[]
  content?: { columns?: string[]; rows?: string[][]; idea?: string; example?: string; items?: string[]; pairs?: Array<{ left: string; right: string }>; groups?: Array<{ id: string; label: string }>; evidence?: string[]; mode?: string; title?: string; lead?: string; steps?: Array<string | { label?: string; body: string }>; takeaway?: string; body?: string; key_idea?: string; formula?: string; parts?: Array<{ symbol: string; meaning: string }>; nodes?: Array<{ id?: string; label: string }>; edges?: Array<{ from: string; to: string; label?: string }>; progressive?: boolean; knowledge_type?: string; subject_family?: string }
  explanation?: string
  hints?: string[]
  difficulty: string
  estimated_seconds: number
  grounding?: { resource_id?: number; resource_title?: string; section?: string; page?: number; excerpt?: string }
  goal_relevance: string
}

export interface DragLabelInteractionData { labels: Array<{ id: string; label: string }>; targets: Array<{ id: string; label: string }> }
export interface DiagramInteractionData { nodes: Array<{ id: string; label: string; x?: number; y?: number }>; edges?: Array<{ from: string; to: string }> }
export interface SliderInteractionData { min: number; max: number; step: number; target?: number; unit?: string }
export interface SimulationInteractionData { controls: Array<{ id: string; label: string; min: number; max: number; step: number }>; outputLabel: string }

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
  outcome?: 'correct' | 'incorrect' | 'partial' | 'insufficient'
}

export interface TeachingTurn {
  id: string
  role: 'flow' | 'learner' | 'system'
  kind: 'message' | 'activity' | 'video' | 'flashcards' | 'voice' | 'completion'
  content: string
  payload: { activity?: EncounterActivity; learning_objects?: EncounterActivity[]; videos?: Array<{ video_id: string; title: string; channel: string; duration_str: string; thumbnail: string; url: string; embed_url?: string; why?: string; objective_id?: string }>; cards?: Array<{ question: string; answer: string; difficulty: string }>; correct?: boolean | null; score?: number; quick_replies?: string[] }
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
  teaching_phase: 'INTRODUCE' | 'TEACH' | 'CHECK' | 'REMEDIATE' | 'ADVANCE' | 'READY_TO_ADVANCE' | string
  teaching_preferences: Record<string, string>
  teaching_plan?: TeachingPlan | null
  current_objective_id: string
  active_activity_id: string
  player: JourneyPlayerState
  completion_evaluation: {
    complete: boolean
    mastery: number
    objectives_total: number
    objectives_satisfied: number
    objectives: Array<{ id: string; text: string; taught: boolean; interacted: boolean; understood: boolean; best_score: number; unresolved_misconception: string; satisfied: boolean }>
    unresolved_objectives: Array<{ id: string; text: string; taught: boolean; interacted: boolean; understood: boolean; best_score: number; unresolved_misconception: string; satisfied: boolean }>
    unresolved_misconceptions: string[]
    recommended_next_action: string
    normal_requirements_met: boolean
    feynman: {
      required: boolean
      attempted: boolean
      passed: boolean
      score: number
      feedback: string
      dimensions: Record<string, number>
      critical_misconceptions: string[]
    }
  }
  evaluation?: { correct: boolean | null; score: number; feedback: string; attempt_id: string; outcome?: 'correct' | 'incorrect' | 'partial' | 'insufficient' }
}

export interface TeachingMoment {
  id: string
  type: 'EXPLAIN' | 'VISUALIZE' | 'DEMONSTRATE' | 'EXAMPLE' | 'INTERACT' | 'CHECK' | 'REMEDIATE' | 'REFLECT' | 'FEYNMAN' | 'FLASHCARD' | 'OPTIONAL_MEDIA' | 'OBJECTIVE_COMPLETE'
  representation: string
  interaction: string
  optional: boolean
  content: Record<string, unknown>
}

export interface TeachingPlan {
  version: number
  objective_id: string
  learning_goal: string
  key_insight: string
  teaching_strategy: string
  recommended_representation: string
  teaching_moments: TeachingMoment[]
  interaction_strategy: string
  check_strategy: string
  remediation_strategy: string
  source_grounding: Record<string, unknown>
  difficulty: string
  subject_family: string
  origin: 'ai' | 'fallback' | string
}

export interface JourneyStage {
  id: string
  type: 'FLOW_INTRO' | 'CONCEPT' | 'DEFINITION' | 'PROCESS' | 'SEQUENCE' | 'RELATIONSHIP' | 'COMPARISON' | 'CAUSE_EFFECT' | 'FORMULA' | 'WORKED_EXAMPLE' | 'EXAMPLE' | 'DIAGRAM' | 'VIDEO' | 'FLASHCARD' | 'MATCH' | 'ORDER' | 'PRACTICE' | 'FEYNMAN' | string
  status: 'ready' | 'active' | 'completed'
  optional: boolean
  title: string
  learning_object_id?: string
  activity_id?: string
  payload: { text?: string; activity?: EncounterActivity; video?: NonNullable<TeachingTurn['payload']['videos']>[number]; cards?: NonNullable<TeachingTurn['payload']['cards']>; podcast?: { audio_url: string; title?: string; duration?: number; objective_id?: string; provenance?: string } }
}

export interface JourneyPlayerState {
  journey_id: string
  objective_id: string
  objective_index: number
  current_stage_id: string
  current_stage_type: string
  stage_sequence: string[]
  stage_status: string
  completed_stage_ids: string[]
  active_learning_object_id: string
  active_activity_id: string
  active_stage: JourneyStage | null
  stages: JourneyStage[]
  capabilities: string[]
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
