import api from './api';
import { Resource, ResourceDetail, ResourceProgress, ResourceUploadResponse } from '@/types';

export const libraryService = {
  async getResources(type?: string): Promise<Resource[]> {
    const params: Record<string, string> = {};
    if (type) params.type = type;
    const { data } = await api.get<Resource[] | { results: Resource[] }>('/library/resources/', { params });
    return Array.isArray(data) ? data : data.results || [];
  },

  async getResource(id: number): Promise<ResourceDetail> {
    const { data } = await api.get<ResourceDetail>(`/library/resources/${id}/`);
    return data;
  },

  async uploadResource(
    formData: FormData,
    onProgress?: (progress: number) => void
  ): Promise<ResourceUploadResponse> {
    const { data } = await api.post<ResourceUploadResponse>('/library/resources/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (e.total && onProgress) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
    });
    return data;
  },

  async deleteResource(id: number): Promise<void> {
    await api.delete(`/library/resources/${id}/`);
  },

  async reprocessResource(id: number): Promise<void> {
    await api.post(`/library/resources/${id}/reprocess/`);
  },

  async getProgress(id: number): Promise<ResourceProgress> {
    const { data } = await api.get<ResourceProgress>(`/library/resources/${id}/progress/`);
    return data;
  },
};
