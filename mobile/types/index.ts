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
    name: string;
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
