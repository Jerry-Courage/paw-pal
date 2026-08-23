import api from './api';
import { Analytics } from '@/types';

export const dashboardService = {
  async getAnalytics(): Promise<Analytics> {
    const { data } = await api.get<Analytics>('/auth/analytics/');
    return data;
  },

  async getNudge(): Promise<{ nudge: string }> {
    const { data } = await api.get<{ nudge: string }>('/ai/nudge/');
    return data;
  },
};
