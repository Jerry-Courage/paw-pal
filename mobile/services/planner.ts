import api from './api';
import { StudySession, Deadline, SmartSuggestion } from '@/types';

export const plannerService = {
  async getSessions(start?: string, end?: string): Promise<StudySession[]> {
    const params: Record<string, string> = {};
    if (start) params.start = start;
    if (end) params.end = end;
    const { data } = await api.get<StudySession[] | { results: StudySession[] }>('/planner/sessions/', { params });
    return Array.isArray(data) ? data : data.results || [];
  },

  async createSession(params: {
    title: string;
    subject?: string;
    session_type?: string;
    start_time: string;
    end_time: string;
    location?: string;
    notes?: string;
    resource?: number;
    assignment?: number;
  }): Promise<StudySession> {
    const { data } = await api.post<StudySession>('/planner/sessions/', params);
    return data;
  },

  async updateSession(id: number, params: Partial<StudySession>): Promise<StudySession> {
    const { data } = await api.patch<StudySession>(`/planner/sessions/${id}/`, params);
    return data;
  },

  async deleteSession(id: number): Promise<void> {
    await api.delete(`/planner/sessions/${id}/`);
  },

  async completeSession(id: number): Promise<{
    detail: string;
    minutes_logged: number;
    study_streak: number;
    total_study_time: number;
  }> {
    const { data } = await api.post(`/planner/sessions/${id}/complete/`);
    return data;
  },

  async createRecurring(params: {
    title: string;
    subject?: string;
    session_type?: string;
    start_time: string;
    end_time: string;
    days: number[];
    weeks_count?: number;
  }): Promise<{ detail: string; recurrence_id: string; count: number }> {
    const { data } = await api.post('/planner/sessions/bulk-create/', params);
    return data;
  },

  async getDeadlines(): Promise<Deadline[]> {
    const { data } = await api.get<Deadline[] | { results: Deadline[] }>('/planner/deadlines/');
    return Array.isArray(data) ? data : data.results || [];
  },

  async createDeadline(params: {
    title: string;
    subject?: string;
    due_date: string;
    assignment?: number;
  }): Promise<Deadline> {
    const { data } = await api.post<Deadline>('/planner/deadlines/', params);
    return data;
  },

  async updateDeadline(id: number, params: Partial<Deadline>): Promise<Deadline> {
    const { data } = await api.patch<Deadline>(`/planner/deadlines/${id}/`, params);
    return data;
  },

  async deleteDeadline(id: number): Promise<void> {
    await api.delete(`/planner/deadlines/${id}/`);
  },

  async getSmartSchedule(): Promise<{ suggestions: SmartSuggestion[] }> {
    const { data } = await api.get<{ suggestions: SmartSuggestion[] }>('/planner/smart-schedule/');
    return data;
  },

  async interpret(prompt: string): Promise<{
    title: string;
    subject: string;
    session_type: string;
    start_time: string;
    duration_minutes: number;
    is_recurring: boolean;
    days: number[];
  }> {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const localNow = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
    const { data } = await api.post('/planner/interpret/', { prompt, local_now: localNow });
    return data;
  },
};
