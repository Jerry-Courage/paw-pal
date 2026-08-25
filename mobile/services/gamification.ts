import api from './api';

export interface ProgressionData {
  level: {
    num: number;
    rank: string; // Freshman, Sophomore, Junior, Senior, Graduate
  };
  lifetime_xp: number;
  current_level_threshold: number;
  next_level_threshold: number | null;
  xp_into_level: number;
  xp_required_for_next_level: number | null;
  progress_percent: number;
  flowcoins: number;
  current_streak: number;
  longest_streak: number;
  streak_shields: number;
}

export interface XPTransaction {
  id: number;
  amount: number;
  source_type: string;
  source_id: string;
  reason: string;
  created_at: string;
}

export interface FlowCoinTransaction {
  id: number;
  amount: number;
  transaction_type: string;
  source_type: string;
  description: string;
  balance_after: number;
  created_at: string;
}

export const gamificationService = {
  getProgression(): Promise<ProgressionData> {
    return api.get('/gamification/progress/').then((r) => r.data);
  },

  getXPTransactions(): Promise<XPTransaction[]> {
    return api.get('/gamification/xp-transactions/').then((r) => r.data);
  },

  getFlowCoinTransactions(): Promise<FlowCoinTransaction[]> {
    return api.get('/gamification/flowcoin-transactions/').then((r) => r.data);
  },
};
