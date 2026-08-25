export interface User {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  bio: string;
  university: string;
  study_streak: number;
  total_study_time: number;
  weekly_goal_hours: number;
  onboarding_status: Record<string, unknown>;
  created_at: string;
  is_premium: boolean;
  notes_used: number;
  notes_limit: number;
  xp: number;
  level: {
    num: number;
    rank: string;
    next_xp: number;
    current_xp: number;
  };
  education_level: string;
  notification_preferences: Record<string, unknown>;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface LoginResponse extends AuthTokens {
  study_streak: number;
}

export interface RegisterResponse {
  user: User;
  access: string;
  refresh: string;
}

export interface ApiError {
  detail?: string;
  [key: string]: string[] | string | undefined;
}

export interface Resource {
  id: number;
  title: string;
  resource_type: 'pdf' | 'video' | 'code' | 'slides' | 'other';
  file_url: string;
  url: string;
  subject: string;
  cover_image_url: string | null;
  thumbnail_url: string;
  status: 'processing' | 'ready' | 'error';
  processing_progress: number;
  status_text: string;
  file_size: number;
  ai_concepts: Array<{ title: string; extracted_text: string }>;
  has_study_kit: boolean;
  owner_name: string;
  author_name: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface ResourceDetail extends Resource {
  ai_summary: string;
  ai_notes_json: Record<string, unknown>;
  extracted_images: Array<{
    id: number;
    image: string;
    page_number: number;
    description: string;
    created_at: string;
  }>;
}

export interface ResourceProgress {
  resource_id: number;
  completed_steps: Record<string, boolean>;
  step_scores: Record<string, number>;
  completed_sections: number[];
  current_section: number;
  xp_earned: number;
  mastery: number;
  next_step: string | null;
  completed_count: number;
  step_order: string[];
  step_xp: Record<string, number>;
}

export interface ResourceUploadResponse {
  id: number;
  title: string;
  resource_type: string;
  url: string;
  subject: string;
  status: 'processing' | 'ready' | 'error';
  processing_progress: number;
  status_text: string;
  has_study_kit: boolean;
  created_at: string;
}

export interface Analytics {
  week_hours: number;
  daily_study: Array<{ day: string; minutes: number }>;
  goal_hours: number;
}

export interface Flashcard {
  id: number;
  deck: number | null;
  resource: number;
  question: string;
  answer: string;
  subject: string;
  difficulty: string;
  created_at: string;
}

export interface PreviewCard {
  question: string;
  answer: string;
  difficulty: string;
}

export interface FlashcardReviewResponse {
  next_review: string;
  interval_days: number;
  ease_factor: number;
}

export interface Quiz {
  id: number;
  resource: number;
  title: string;
  format: string;
  questions: Array<{
    id: string;
    question: string;
    options: string[];
    correct_answer: string;
    explanation: string;
  }>;
  academic_level: string;
  created_at: string;
}

export interface QuizSubmitResponse {
  score: number;
  percentage: number;
  correct_answers: number;
  incorrect_answers: number;
  questions: Array<{
    question: string;
    your_answer: string;
    correct_answer: string;
    is_correct: boolean;
    explanation: string;
  }>;
  xp_earned: number;
}

export interface NoteSection {
  title: string;
  key_question: string;
  plain_english: string;
  deep_dive: string;
  memory_trick: string;
  quick_summary: string;
  ascii_art?: string;
  mermaid_diagram?: string;
  video?: string;
}

export interface AiNotesJson {
  sections: NoteSection[];
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  image: string | null;
  diagram: string | null;
  diagram_code: string | null;
  audio_url: string | null;
  created_at: string;
}

export interface ChatSession {
  id: number;
  context_type: 'global' | 'resource' | 'group' | 'voice_tutor';
  resource: number | null;
  group: number | null;
  title: string;
  last_message: { role: string; content: string } | null;
  created_at: string;
  updated_at: string;
  messages?: ChatMessage[];
}

export interface AgentResponse {
  done: boolean;
  message_id: number;
  session_id: number;
  reply: string;
  speech_text: string;
  audio_url: string | null;
  action: { tool: string; parameters: Record<string, unknown> } | null;
  execution_result: string | null;
  diagram: string | null;
  message: ChatMessage;
}

export interface MathStep {
  label: string;
  formula: string;
  explanation: string;
}

export interface MathSolution {
  problem: string;
  steps: MathStep[];
  final_answer: string;
  key_theorems: string[];
}

// ── Learning Paths ──

export interface ConceptNode {
  id: string;
  path: string;
  unit: string | null;
  unit_title: string;
  title: string;
  description: string;
  source_resource: number | null;
  source_resource_title: string;
  source_page: number | null;
  source_section: string;
  order_index: number;
  prerequisites: string[];
  mastery: number;
  status: 'locked' | 'current' | 'completed';
  xp_earned: number;
  difficulty: 'easy' | 'medium' | 'hard';
  estimated_minutes: number;
  key_definitions: Array<{ term: string; definition: string }>;
  summary: string;
  reviews_due: number;
  created_at: string;
  updated_at: string;
}

export interface ConceptReview {
  id: string;
  concept: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  last_reviewed: string | null;
  next_review: string | null;
  last_score: number;
  total_reviews: number;
  correct_reviews: number;
  retention_rate: number;
  created_at: string;
}

export interface Unit {
  id: string;
  path: string;
  title: string;
  description: string;
  order_index: number;
  concept_count: number;
  completed_count: number;
  created_at: string;
}

export interface LearningPath {
  id: string;
  user: number;
  title: string;
  description: string;
  subject: string;
  goal: string;
  depth: 'quick' | 'standard' | 'deep';
  status: 'draft' | 'active' | 'paused' | 'completed';
  start_date: string | null;
  deadline: string | null;
  total_xp: number;
  concepts_completed: number;
  total_concepts: number;
  mastery_percent: number;
  daily_review_goal: number;
  concept_count: number;
  due_reviews: number;
  concepts?: ConceptNode[];
  units?: Unit[];
  created_at: string;
  updated_at: string;
}

export interface LearningPathList {
  id: string;
  title: string;
  description: string;
  subject: string;
  goal: string;
  depth: 'quick' | 'standard' | 'deep';
  status: 'draft' | 'active' | 'paused' | 'completed';
  start_date: string | null;
  deadline: string | null;
  total_xp: number;
  concepts_completed: number;
  total_concepts: number;
  mastery_percent: number;
  daily_review_goal: number;
  concept_count: number;
  due_reviews: number;
  unit_count: number;
  created_at: string;
  updated_at: string;
}

export interface RoadmapData {
  units: Array<{
    id: string;
    type: 'unit';
    title: string;
    order: number;
    concept_count: number;
    completed_count: number;
  }>;
  nodes: Array<{
    id: string;
    type: 'concept';
    unit_id: string | null;
    title: string;
    mastery: number;
    status: 'locked' | 'current' | 'completed';
    difficulty: string;
    order: number;
    xp_earned: number;
    estimated_minutes: number;
    reviews_due: number;
  }>;
  edges: Array<{ from: string; to: string }>;
}

export interface PathAnalytics {
  total_concepts: number;
  status_distribution: Record<string, number>;
  difficulty_mastery: Record<string, number>;
  total_xp: number;
  average_mastery: number;
  reviews_due: number;
  overall_retention: number;
}

// ── Planner ──

export interface StudySession {
  id: number;
  title: string;
  subject: string;
  session_type: 'study' | 'class' | 'assignment' | 'exam' | 'personal';
  start_time: string;
  end_time: string;
  duration_minutes: number;
  location: string;
  notes: string;
  status: 'scheduled' | 'active' | 'completed' | 'skipped';
  is_ai_suggested: boolean;
  recurrence_id: string | null;
  resource: number | null;
  resource_title: string | null;
  resource_type: string | null;
  assignment: number | null;
  assignment_title: string | null;
  created_at: string;
}

export interface Deadline {
  id: number;
  title: string;
  subject: string;
  due_date: string;
  is_completed: boolean;
  days_until: number;
  assignment_id: number | null;
  created_at: string;
}

export interface SmartSuggestion {
  title: string;
  subject: string;
  deadline_title?: string;
  type: string;
  suggested_date: string;
  suggested_time: string;
  duration_minutes: number;
  urgency: 'high' | 'medium';
  reason: string;
}

// ── Assignments ──

export interface AssignmentSource {
  id: number;
  file: string;
  file_name: string;
  file_type: string;
  created_at: string;
}

export interface Assignment {
  id: number;
  title: string;
  subject: string;
  instructions: string;
  file: string | null;
  file_name: string | null;
  resources: number[];
  resource_titles: Array<{ id: number; title: string; type: string }>;
  status: 'pending' | 'processing' | 'completed' | 'error';
  ai_response: string;
  ai_overview: string;
  ai_outline: string[];
  chat_history: Array<{ role: string; content: string }>;
  sources: AssignmentSource[];
  due_date: string | null;
  deadline_id: number | null;
  deadline_date: string | null;
  session_count: number;
  created_at: string;
  updated_at: string;
}

// ── Rankings ──

export interface RankingEntry {
  user_id: number;
  name: string;
  initials: string;
  streak: number;
  earned_xp: number;
  total_xp: number;
  bonus_xp: number;
  is_me: boolean;
  rank_earned_xp?: number;
  rank_streak?: number;
}

export interface RankingsData {
  total_users: number;
  earned: {
    board: RankingEntry[];
    my_rank: number;
    my_xp: number;
  };
  total: {
    board: RankingEntry[];
    my_rank: number;
    my_xp: number;
  };
  streak: {
    board: RankingEntry[];
    my_rank: number;
    my_streak: number;
  };
}

export interface StudyAnalytics {
  week_hours: number;
  daily_study: Array<{ day: string; minutes: number }>;
  goal_hours: number;
  streak?: number;
  total_study_time?: number;
  total_resources?: number;
}

// ── Collab Workspace ──

export interface WorkspaceUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  avatar: string | null;
}

export interface WorkspaceMember {
  id: number;
  user: WorkspaceUser;
  role: 'owner' | 'editor' | 'viewer';
  joined_at: string;
  last_seen: string;
}

export interface WorkspaceMessage {
  id: number;
  author: WorkspaceUser | null;
  author_name: string;
  author_initials: string;
  content: string;
  is_ai: boolean;
  pinned_resource: number | null;
  pinned_resource_data: Resource | null;
  shared_assignment: number | null;
  shared_assignment_data: { id: number; title: string; subject: string } | null;
  audio_file: string | null;
  audio_data: string | null;
  attachment: string | null;
  attachment_type: string | null;
  parent: number | null;
  parent_data: { id: number; author_name: string; content: string } | null;
  created_at: string;
}

export interface Workspace {
  id: number;
  name: string;
  subject: string;
  description: string;
  owner: number;
  members: WorkspaceMember[];
  invite_code: string;
  resources: Resource[];
  messages: WorkspaceMessage[];
  is_active: boolean;
  is_owner: boolean;
  my_role: string | null;
  member_count?: number;
  unread_count?: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceListItem {
  id: number;
  name: string;
  subject: string;
  description: string;
  is_active: boolean;
  member_count: number;
  is_owner: boolean;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

// ── Quiz Battle ──

export interface QuizPlayer {
  id: number;
  username: string;
  avatar_url: string | null;
  score: number;
  streak: number;
  ready: boolean;
  correct_count: number;
}

export interface QuizRoom {
  id: number;
  pin: string;
  title: string;
  host_name: string;
  status: 'lobby' | 'countdown' | 'question' | 'results' | 'finished';
  current_q_idx: number;
  time_per_q: number;
  players: QuizPlayer[];
  q_count: number;
  created_at: string;
}

export interface QuizQuestion {
  id: number;
  order: number;
  text: string;
  opt_a: string;
  opt_b: string;
  opt_c: string;
  opt_d: string;
  correct?: string;
  explanation?: string;
}

export interface BattleHistoryEntry {
  id: number;
  username: string;
  score: number;
  rank: number;
  correct_count: number;
  total_questions: number;
  best_streak: number;
  avg_time: number;
  xp_earned: number;
  created_at: string;
}

export interface BattleSnapshot {
  room: QuizRoom;
  questions: QuizQuestion[];
  players: QuizPlayer[];
  my_answers: Record<number, { choice: string; is_correct: boolean; time_taken: number; points: number }>;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  score: number;
  correct_count: number;
  streak: number;
}

export interface PodcastChunk {
  speaker: 'A' | 'B';
  text: string;
  visual_ref?: number;
  visual_url?: string;
  audio_hash: string;
}

export interface PodcastSession {
  id: number;
  resource: number;
  owner: number;
  voice_a: string;
  voice_b: string;
  status: 'generating' | 'ready' | 'error';
  script_chunks: PodcastChunk[];
  created_at: string;
}

export interface PodcastInitResponse {
  exists?: boolean;
  session_id: number;
  status: string;
  script?: PodcastChunk[];
  chunks_total?: number;
  voice_a?: string;
  voice_b?: string;
}

export interface PodcastStatusResponse {
  status: string;
  chunks_total: number;
  script: PodcastChunk[];
  interjection_urls?: { A?: string; B?: string };
}

export interface Notification {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string;
  is_read: boolean;
  created_at: string;
}
