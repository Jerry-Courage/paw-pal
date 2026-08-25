import api from './api';
import { QuizRoom, QuizQuestion, BattleHistoryEntry, BattleSnapshot } from '@/types';

export const quizBattleService = {
  create: async (params: {
    title: string;
    time_per_q?: number;
    questions?: Array<{ text: string; opt_a: string; opt_b: string; opt_c: string; opt_d: string; correct: string; explanation?: string }>;
  }): Promise<QuizRoom> => {
    const { data } = await api.post('/groups/quiz/', params);
    return data;
  },

  generate: async (params: {
    resource_id?: number;
    topic?: string;
    count?: number;
    time_per_q?: number;
    title?: string;
    difficulty?: string;
  }): Promise<QuizRoom> => {
    const { data } = await api.post('/groups/quiz/generate/', params);
    return data;
  },

  join: async (pin: string): Promise<QuizRoom> => {
    const { data } = await api.post('/groups/quiz/join/', { pin });
    return data;
  },

  getRoom: async (pin: string): Promise<QuizRoom> => {
    const { data } = await api.get(`/groups/quiz/${pin}/`);
    return data;
  },

  getSnapshot: async (pin: string): Promise<BattleSnapshot> => {
    const { data } = await api.get(`/groups/quiz/${pin}/snapshot/`);
    // Backend returns flat structure; normalize to BattleSnapshot shape
    return {
      room: {
        id: 0,
        pin: data.pin,
        title: data.title,
        host_name: data.host,
        status: data.status,
        current_q_idx: data.current_q_idx,
        time_per_q: data.time_per_q,
        players: data.players || [],
        q_count: data.total_questions || 0,
        created_at: '',
      },
      questions: (data.questions || []).map((q: any) => ({
        id: q.id,
        order: q.order,
        text: q.text,
        opt_a: q.opt_a,
        opt_b: q.opt_b,
        opt_c: q.opt_c,
        opt_d: q.opt_d,
        correct: q.correct,
        explanation: q.explanation || '',
      })),
      players: data.players || [],
      my_answers: data.my_answers || {},
    };
  },

  getQuestions: async (pin: string): Promise<QuizQuestion[]> => {
    const { data } = await api.get(`/groups/quiz/${pin}/questions/`);
    return data;
  },

  getHistory: async (): Promise<BattleHistoryEntry[]> => {
    const { data } = await api.get('/groups/battle-history/');
    return data.results || data;
  },
};
