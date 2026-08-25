import api from './api';
import { LearningPath, LearningPathList, RoadmapData, PathAnalytics, ConceptNode } from '@/types';

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

export interface PreviewUnit {
  title: string;
  concept_count: number;
  concepts: Array<{
    title: string;
    difficulty: string;
    estimated_minutes: number;
  }>;
}

export interface PreviewResponse {
  goal: string;
  depth: string;
  resource_count: number;
  units: PreviewUnit[];
  total_concepts: number;
  estimated_minutes: number;
}

export interface BuildResponse {
  id: string;
  title: string;
  goal: string;
  depth: string;
  total_concepts: number;
  units: Unit[];
}

export const learningService = {
  async getPaths(): Promise<LearningPathList[]> {
    const { data } = await api.get<LearningPathList[] | { results: LearningPathList[] }>('/learning/paths/');
    return Array.isArray(data) ? data : data.results || [];
  },

  async getPath(id: string): Promise<LearningPath> {
    const { data } = await api.get<LearningPath>(`/learning/paths/${id}/`);
    return data;
  },

  async createPath(params: {
    title: string;
    description?: string;
    subject?: string;
    start_date?: string;
    deadline?: string;
  }): Promise<LearningPath> {
    const { data } = await api.post<LearningPath>('/learning/paths/', params);
    return data;
  },

  async deletePath(id: string): Promise<void> {
    await api.delete(`/learning/paths/${id}/`);
  },

  async generatePreview(params: {
    goal: string;
    resources: number[];
    depth: string;
  }): Promise<PreviewResponse> {
    const { data } = await api.post<PreviewResponse>('/learning/paths/generate-preview/', params);
    return data;
  },

  async buildPath(params: {
    goal: string;
    title?: string;
    resources: number[];
    depth: string;
  }): Promise<BuildResponse> {
    const { data } = await api.post<BuildResponse>('/learning/paths/build/', params);
    return data;
  },

  async condensePath(id: string, depth?: string): Promise<{ message: string; concept_count: number }> {
    const { data } = await api.post(`/learning/paths/${id}/condense/`, { depth });
    return data;
  },

  async getRoadmap(id: string): Promise<RoadmapData> {
    const { data } = await api.get<RoadmapData>(`/learning/paths/${id}/roadmap/`);
    return data;
  },

  async getDueReviews(id: string): Promise<{ due: Array<{
    review_id: string;
    concept_id: string;
    concept_title: string;
    last_score: number;
    interval_days: number;
    retention_rate: number;
  }>; count: number }> {
    const { data } = await api.get(`/learning/paths/${id}/due-reviews/`);
    return data;
  },

  async getAnalytics(id: string): Promise<PathAnalytics> {
    const { data } = await api.get<PathAnalytics>(`/learning/paths/${id}/analytics/`);
    return data;
  },

  async getConcept(id: string): Promise<ConceptNode> {
    const { data } = await api.get<ConceptNode>(`/learning/concepts/${id}/`);
    return data;
  },

  async completeConcept(id: string, score: number = 80): Promise<{ message: string; xp_earned: number; unlocked: string[] }> {
    const { data } = await api.post(`/learning/concepts/${id}/complete/`, { score });
    return data;
  },

  async reviewConcept(id: string, score: number): Promise<{
    message: string;
    next_review: string;
    interval_days: number;
    ease_factor: number;
    mastery: number;
  }> {
    const { data } = await api.post(`/learning/concepts/${id}/review/`, { score });
    return data;
  },

  async getSourceContext(id: string): Promise<{
    resource_title: string;
    source_page: number | null;
    source_section: string;
    key_definitions: Array<{ term: string; definition: string }>;
    summary: string;
    notes_section?: Record<string, unknown>;
  }> {
    const { data } = await api.get(`/learning/concepts/${id}/source-context/`);
    return data;
  },
};
