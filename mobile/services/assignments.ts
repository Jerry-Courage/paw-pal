import api from './api';
import { Assignment } from '@/types';

export const assignmentsService = {
  async getAll(): Promise<Assignment[]> {
    const { data } = await api.get<Assignment[] | { results: Assignment[] }>('/assignments/');
    return Array.isArray(data) ? data : data.results || [];
  },

  async get(id: number): Promise<Assignment> {
    const { data } = await api.get<Assignment>(`/assignments/${id}/`);
    return data;
  },

  async create(formData: FormData): Promise<Assignment> {
    const { data } = await api.post<Assignment>('/assignments/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  async update(id: number, params: Partial<Assignment>): Promise<Assignment> {
    const { data } = await api.patch<Assignment>(`/assignments/${id}/`, params);
    return data;
  },

  async delete(id: number): Promise<void> {
    await api.delete(`/assignments/${id}/`);
  },

  async solve(id: number): Promise<Assignment> {
    const { data } = await api.post<Assignment>(`/assignments/${id}/solve/`);
    return data;
  },

  async refine(id: number, prompt: string): Promise<Assignment> {
    const { data } = await api.post<Assignment>(`/assignments/${id}/refine/`, { prompt });
    return data;
  },

  async humanize(id: number): Promise<Assignment> {
    const { data } = await api.post<Assignment>(`/assignments/${id}/humanize/`);
    return data;
  },

  async originality(id: number): Promise<Assignment> {
    const { data } = await api.post<Assignment>(`/assignments/${id}/originality/`);
    return data;
  },

  async detect(id: number): Promise<{
    ai_score: number;
    originality_score: number;
    verdict: string;
    summary: string;
    segments: Array<{ text: string; type: string; reason: string }>;
  }> {
    const { data } = await api.post(`/assignments/${id}/detect/`);
    return data;
  },
};
