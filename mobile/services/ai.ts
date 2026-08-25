import api from './api';
import { ChatSession, ChatMessage, AgentResponse, MathSolution } from '@/types';

export const aiService = {
  async getSessions(): Promise<ChatSession[]> {
    const { data } = await api.get<ChatSession[] | { results: ChatSession[] }>('/ai/sessions/');
    return Array.isArray(data) ? data : data.results || [];
  },

  async getSession(id: number): Promise<ChatSession> {
    const { data } = await api.get<ChatSession>(`/ai/sessions/${id}/`);
    return data;
  },

  async createSession(params: {
    context_type?: string;
    resource?: number;
    title?: string;
  }): Promise<ChatSession> {
    const { data } = await api.post<ChatSession>('/ai/sessions/', params);
    return data;
  },

  async deleteSession(id: number): Promise<void> {
    await api.delete(`/ai/sessions/${id}/`);
  },

  async sendMessage(sessionId: number, content: string): Promise<ChatMessage> {
    const { data } = await api.post<ChatMessage>(
      `/ai/sessions/${sessionId}/message/`,
      { content }
    );
    return data;
  },

  async askAgent(params: {
    query: string;
    context?: string;
    history?: Array<{ role: string; content: string }>;
    session_id?: number;
    is_tutor_mode?: boolean;
    image_url?: string;
  }): Promise<AgentResponse> {
    const payload: Record<string, unknown> = {
      query: params.query,
      context: params.context || '',
      history: params.history || [],
      session_id: params.session_id,
      is_tutor_mode: params.is_tutor_mode || false,
    };
    if (params.image_url) payload.image_url = params.image_url;
    const { data } = await api.post<AgentResponse>('/ai/agent/', payload);
    return data;
  },

  async sendVisionMessage(sessionId: number, content: string, imageUri?: string) {
    const fd = new FormData();
    fd.append('content', content);
    if (imageUri) {
      const response = await fetch(imageUri);
      const blob = await response.blob();
      fd.append('file', blob, 'image.jpg');
    }
    const { data } = await api.post(`/ai/sessions/${sessionId}/message/vision/`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      transformRequest: (d) => d,
    });
    return data;
  },

  async quickAsk(question: string, resourceId?: number): Promise<{ answer: string }> {
    const { data } = await api.post<{ answer: string }>('/ai/ask/', {
      question,
      resource_id: resourceId,
    });
    return data;
  },

  async explainText(text: string, context?: string): Promise<{ explanation: string }> {
    const { data } = await api.post<{ explanation: string }>('/ai/explain/', {
      text,
      context,
    });
    return data;
  },

  async gradeAnswer(
    resourceId: number,
    question: string,
    userAnswer: string,
    modelAnswer?: string
  ): Promise<{
    score: number;
    grade: string;
    correct: boolean;
    feedback: string;
    strengths: string[];
    improvements: string[];
    tip: string;
  }> {
    const { data } = await api.post(`/ai/resources/${resourceId}/grade/`, {
      question,
      user_answer: userAnswer,
      model_answer: modelAnswer,
    });
    return data;
  },

  async generateDiagram(
    description: string,
    type: string = 'auto',
    messageId?: number
  ): Promise<{ mermaid: string; type: string }> {
    const { data } = await api.post('/ai/diagram/', {
      description,
      type,
      message_id: messageId,
    });
    return data;
  },

  async generateImage(
    prompt: string,
    messageId?: number
  ): Promise<{ url: string; prompt: string }> {
    const { data } = await api.post('/ai/generate-image/', {
      prompt,
      message_id: messageId,
    });
    return data;
  },

  async solveMath(
    resourceId: number,
    problem: string,
    image?: string
  ): Promise<MathSolution> {
    const { data } = await api.post(
      `/library/resources/${resourceId}/math/solve/`,
      { problem, image }
    );
    return data;
  },

  async getNudge(): Promise<{ nudge: string }> {
    const { data } = await api.get<{ nudge: string }>('/ai/nudge/');
    return data;
  },
};
