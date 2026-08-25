import api from './api';

export const podcastService = {
  async initPodcast(resourceId: number, voiceA?: string, voiceB?: string) {
    const res = await api.post(`/ai/resources/${resourceId}/podcast/`, {
      voice_a: voiceA,
      voice_b: voiceB,
    });
    return res.data;
  },

  async checkExistingPodcast(resourceId: number) {
    const res = await api.get(`/ai/resources/${resourceId}/podcast/`);
    return res.data;
  },

  async getPodcastStatus(sessionId: number) {
    const res = await api.get(`/ai/podcast/${sessionId}/status/`);
    return res.data;
  },

  getChunkUrl(sessionId: number, chunkIndex: number) {
    const base = (process.env.EXPO_PUBLIC_API_BASE_URL || '').replace('/api', '');
    return `${base}/api/ai/podcast/${sessionId}/chunk/${chunkIndex}/`;
  },

  async interruptPodcast(sessionId: number, audioBlob: Blob, currentIndex: number) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'question.webm');
    formData.append('current_index', String(currentIndex));
    const res = await api.post(`/ai/podcast/${sessionId}/interrupt/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  async transcribeAudio(audioBlob: Blob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'voice.webm');
    const res = await api.post('/ai/agent/audio/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  async edgeTTS(text: string, voice?: string) {
    const res = await api.post('/ai/edge-tts/', { text, voice }, { responseType: 'blob' });
    return res.data;
  },
};
