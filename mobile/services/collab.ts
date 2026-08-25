import api from './api';
import { Workspace, WorkspaceListItem, WorkspaceMessage } from '@/types';

export const collabService = {
  list: async (): Promise<WorkspaceListItem[]> => {
    const { data } = await api.get('/workspace/workspaces/');
    return data.results || data;
  },

  get: async (id: number): Promise<Workspace> => {
    const { data } = await api.get(`/workspace/workspaces/${id}/`);
    return data;
  },

  create: async (params: { name: string; subject?: string; description?: string }): Promise<Workspace> => {
    const { data } = await api.post('/workspace/workspaces/', params);
    return data;
  },

  join: async (inviteCode: string): Promise<Workspace> => {
    const { data } = await api.post('/workspace/workspaces/join/', { invite_code: inviteCode });
    return data;
  },

  leave: async (id: number): Promise<void> => {
    await api.post(`/workspace/workspaces/${id}/leave/`);
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/workspace/workspaces/${id}/`);
  },

  shareResource: async (workspaceId: number, resourceId: number): Promise<void> => {
    await api.post(`/workspace/workspaces/${workspaceId}/share_resource/`, { resource_id: resourceId });
  },

  getMessages: async (workspaceId: number): Promise<WorkspaceMessage[]> => {
    const { data } = await api.get(`/workspace/workspaces/${workspaceId}/messages/`);
    return data;
  },

  sendMessage: async (workspaceId: number, payload: {
    content?: string;
    parent_id?: number;
    attachment_type?: string;
    audio?: { uri: string; name: string; type: string };
    attachment?: { uri: string; name: string; type: string };
  }): Promise<WorkspaceMessage> => {
    const fd = new FormData();
    if (payload.content) fd.append('content', payload.content);
    if (payload.parent_id) fd.append('parent_id', String(payload.parent_id));
    if (payload.attachment_type) fd.append('attachment_type', payload.attachment_type);
    if (payload.audio) {
      fd.append('audio', { uri: payload.audio.uri, name: payload.audio.name, type: payload.audio.type } as any);
    }
    if (payload.attachment) {
      fd.append('attachment', { uri: payload.attachment.uri, name: payload.attachment.name, type: payload.attachment.type } as any);
    }
    const { data } = await api.post(`/workspace/workspaces/${workspaceId}/messages/`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      transformRequest: (d) => d,
    });
    return data;
  },

  editMessage: async (workspaceId: number, messageId: number, content: string): Promise<WorkspaceMessage> => {
    const { data } = await api.patch(`/workspace/workspaces/${workspaceId}/messages/${messageId}/`, { content });
    return data;
  },

  deleteMessage: async (workspaceId: number, messageId: number): Promise<void> => {
    await api.delete(`/workspace/workspaces/${workspaceId}/messages/${messageId}/`);
  },
};
