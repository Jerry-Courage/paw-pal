import api from './api';
import { Flashcard, PreviewCard, FlashcardReviewResponse, Quiz, QuizSubmitResponse } from '@/types';

export const studyService = {
  async getFlashcards(resourceId: number): Promise<Flashcard[]> {
    const { data } = await api.get<Flashcard[] | { results: Flashcard[] }>(
      '/library/flashcards/',
      { params: { resource: resourceId } }
    );
    return Array.isArray(data) ? data : data.results || [];
  },

  async getDueFlashcards(): Promise<Flashcard[]> {
    const { data } = await api.get<{ count: number; flashcards: Flashcard[] }>(
      '/library/flashcards/due/'
    );
    return data.flashcards || [];
  },

  async generateFlashcards(
    resourceId: number,
    options: { count?: number; level?: string } = {}
  ): Promise<PreviewCard[]> {
    const { data } = await api.post<{ preview_cards: PreviewCard[] }>(
      `/library/resources/${resourceId}/flashcards/generate/`,
      { count: 10, level: 'undergrad', ...options }
    );
    return data.preview_cards || [];
  },

  async reviewFlashcard(
    flashcardId: number,
    quality: number
  ): Promise<FlashcardReviewResponse> {
    const { data } = await api.post<FlashcardReviewResponse>(
      `/library/flashcards/${flashcardId}/review/`,
      { quality }
    );
    return data;
  },

  async getQuizzes(resourceId: number): Promise<Quiz[]> {
    const { data } = await api.get<Quiz[] | { results: Quiz[] }>(
      '/library/quizzes/',
      { params: { resource: resourceId } }
    );
    return Array.isArray(data) ? data : data.results || [];
  },

  async generateQuiz(
    resourceId: number,
    options: { format?: string; level?: string; count?: number } = {}
  ): Promise<Quiz> {
    const { data } = await api.post<Quiz>(
      `/library/resources/${resourceId}/quiz/generate/`,
      { format: 'mcq', level: 'undergrad', count: 10, ...options }
    );
    return data;
  },

  async submitQuiz(
    quizId: number,
    answers: Array<{ question_id: string; selected_option: string }>
  ): Promise<QuizSubmitResponse> {
    const { data } = await api.post<QuizSubmitResponse>(
      `/library/quizzes/${quizId}/submit/`,
      { answers }
    );
    return data;
  },

  async completeStep(
    resourceId: number,
    step: string,
    score?: number
  ): Promise<{ xp_gained: number; total_xp: number; mastery: number }> {
    const { data } = await api.post(
      `/library/resources/${resourceId}/progress/complete/`,
      { step, score: score ?? 100 }
    );
    return data;
  },

  async logStudy(minutes: number): Promise<{ xp_earned: number }> {
    const { data } = await api.post('/auth/log-study/', { minutes });
    return data;
  },
};
