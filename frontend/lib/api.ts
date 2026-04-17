import axios from 'axios'
import { getSession, signOut } from 'next-auth/react'

export const getAuthToken = async () => {
  const session = await getSession()
  return session?.accessToken || null
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(async (config) => {
  const session = await getSession()
  if (session?.accessToken) {
    config.headers.Authorization = `Bearer ${session.accessToken}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        // Prevent multiple simultaneous redirects/signouts
        if (!(window as any)._isRedirecting) {
            (window as any)._isRedirecting = true
            // signOut handles the session clear and redirect to login
            await signOut({ callbackUrl: '/login', redirect: true })
        }
      }
    }
    return Promise.reject(err)
  }
)

export const API_BASE = api.defaults.baseURL
export const SERVER_URL = API_BASE.replace(/\/api$/, '')

// Auth
export const authApi = {
  register: (data: any) => api.post('/auth/register/', data),
  login: (email: string, password: string) =>
    api.post('/auth/login/', { email, password }),
  me: () => api.get('/auth/me/'),
  updateProfile: (data: any) => api.patch('/auth/me/', data),
  getAnalytics: () => api.get('/auth/analytics/'),
  logStudy: (minutes: number) => api.post('/auth/log-study/', { minutes }),
  setWeeklyGoal: (hours: number) => api.post('/auth/set-goal/', { hours }),
  getNotifications: () => api.get('/auth/notifications/'),
  markAllRead: () => api.patch('/auth/notifications/'),
  markRead: (id: number) => api.patch(`/auth/notifications/${id}/`),
  deleteNotification: (id: number) => api.delete(`/auth/notifications/${id}/`),
}

// Library
export const libraryApi = {
  getResources: (type?: string) =>
    api.get('/library/resources/', { params: type ? { type } : {} }),
  getResource: (id: number) => api.get(`/library/resources/${id}/`),
  updateResource: (id: number, data: any) => api.patch(`/library/resources/${id}/`, data),
  updateResourceCover: (id: number, file: File) => {
    const fd = new FormData()
    fd.append('cover_image', file)
    return api.patch(`/library/resources/${id}/`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  uploadResource: (data: FormData, onUploadProgress?: (progressEvent: any) => void) =>
    api.post('/library/resources/', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress
    }),
  deleteResource: (id: number) => api.delete(`/library/resources/${id}/`),
  generateFlashcards: (id: number, count = 10, level = 'undergrad') =>
    api.post(`/library/resources/${id}/flashcards/generate/`, { count, level }),
  getDecks: () => api.get('/library/decks/'),
  createDeck: (title: string, subject?: string) => api.post('/library/decks/', { title, subject }),
  saveFlashcardsToDeck: (deckId: number, resourceId: number | null, flashcards: any[]) =>
    api.post(`/library/decks/${deckId}/save-flashcards/`, { resource_id: resourceId, flashcards }),
  generateQuiz: (id: number, format: string, level: string, count = 10) =>
    api.post(`/library/resources/${id}/quiz/generate/`, { format, level, count }),
  generateMindMap: (id: number) =>
    api.post(`/library/resources/${id}/mindmap/generate/`),
  generatePracticeQuestions: (id: number, difficulty = 'medium', count = 5) =>
    api.post(`/library/resources/${id}/practice/generate/`, { difficulty, count }),
  getFlashcards: () => api.get('/library/flashcards/'),
  refetchTranscript: (resourceId: number) =>
    api.post(`/library/resources/${resourceId}/refetch-transcript/`),
  getQuizzes: () => api.get('/library/quizzes/'),
  solveMath: (id: number, problem: string) =>
    api.post(`/library/resources/${id}/math/solve/`, { problem }),
  cloneResource: (id: number) =>
    api.post(`/library/resources/${id}/clone/`),
}

// AI
export const aiApi = {
  getSessions: () => api.get('/ai/sessions/'),
  createSession: (data: any) => api.post('/ai/sessions/', data),
  getSession: (id: number) => api.get(`/ai/sessions/${id}/`),
  sendMessage: (sessionId: number, content: string, config?: any) =>
    api.post(`/ai/sessions/${sessionId}/message/`, { content }, config),
  sendVisionMessage: (sessionId: number, content: string, file?: File, config?: any) => {
    const fd = new FormData()
    if (content) fd.append('content', content)
    if (file) fd.append('file', file)
    return api.post(`/ai/sessions/${sessionId}/message/vision/`, fd, {
      ...config,
      headers: { ...config?.headers, 'Content-Type': 'multipart/form-data' },
    })
  },
  generateDiagram: (description: string, type: string) =>
    api.post('/ai/diagram/', { description, type }),
  generateImage: (prompt: string) =>
    api.post('/ai/generate-image/', { prompt }),
  quickAsk: (question: string, resourceId?: number) =>
    api.post('/ai/ask/', { question, resource_id: resourceId }),
  summarize: (resourceId: number) =>
    api.post(`/ai/summarize/${resourceId}/`),
  getNudge: () => api.get('/ai/nudge/'),
  explainText: (text: string, context?: string) =>
    api.post('/ai/explain/', { text, context }),
  getKeyConcepts: (resourceId: number) =>
    api.post(`/ai/resources/${resourceId}/concepts/`),
  getStudyNotes: (resourceId: number) =>
    api.post(`/ai/resources/${resourceId}/notes/`),
  getMindMap: (resourceId: number) =>
    api.post(`/ai/resources/${resourceId}/mindmap/`),
  getPracticeQuestions: (resourceId: number, difficulty = 'medium', count = 5) =>
    api.post(`/ai/resources/${resourceId}/practice/`, { difficulty, count }),
  getChapterSummaries: (resourceId: number) =>
    api.post(`/ai/resources/${resourceId}/chapters/`),
  saveContent: (resourceId: number, type: string, data: any) =>
    api.post(`/ai/resources/${resourceId}/save/`, { type, data }),
  loadCachedConcepts: (resourceId: number) =>
    api.get(`/ai/resources/${resourceId}/concepts/`),
  loadCachedNotes: (resourceId: number) =>
    api.get(`/ai/resources/${resourceId}/notes/`),
  loadCachedMindMap: (resourceId: number) =>
    api.get(`/ai/resources/${resourceId}/mindmap/`),
  loadCachedPractice: (resourceId: number) =>
    api.get(`/ai/resources/${resourceId}/practice/`),
  loadCachedChapters: (resourceId: number) =>
    api.get(`/ai/resources/${resourceId}/chapters/`),
  gradeAnswer: (resourceId: number, question: string, userAnswer: string, modelAnswer: string) =>
    api.post(`/ai/resources/${resourceId}/grade/`, { question, user_answer: userAnswer, model_answer: modelAnswer }),
  askAgent: (query: string, context?: string, voice_enabled?: boolean, voice_id?: string, history: any[] = [], is_tutor_mode: boolean = false) =>
    api.post('/ai/agent/', { query, context, voice_enabled, voice_id, history, is_tutor_mode }),
  askAgentAudio: (audioBlob: Blob, context: string = '', voice_enabled: boolean = false, voice_id?: string, is_tutor_mode: boolean = false) => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'query.webm');
    formData.append('context', context);
    formData.append('voice_enabled', String(voice_enabled));
    formData.append('is_tutor_mode', String(is_tutor_mode));
    if (voice_id) formData.append('voice_id', voice_id);
    return api.post('/ai/agent/audio/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  streamAgentResponse: async function* (query: string, context?: string, history: any[] = [], is_tutor_mode: boolean = false) {
    const token = await getAuthToken()
    const response = await fetch(`${api.defaults.baseURL}/ai/agent/stream/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ query, context, history, is_tutor_mode })
    })

    if (!response.ok) throw new Error('Stream request failed')
    
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    if (!reader) return

    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const content = line.slice(6).trim()
          if (content === '[DONE]') return
          try {
            const parsed = JSON.parse(content)
            if (parsed.chunk) yield parsed.chunk
          } catch (e) {
            console.error('SSE Parse Error', e)
          }
        }
      }
    }
  }
}

// Podcast
export const podcastApi = {
  createSession: (resourceId: number, voice_a: string, voice_b: string, length: number) =>
    api.post(`/ai/resources/${resourceId}/podcast/`, { voice_a, voice_b, length }),
  getStatus: (sessionId: number) =>
    api.get(`/ai/podcast/${sessionId}/status/`),
  getChunk: (sessionId: number, currentIndex: number, text?: string) => {
    const params = text ? { h: text.substring(0, 32) } : {}
    return api.get(`/ai/podcast/${sessionId}/chunk/${currentIndex}/`, { params, responseType: 'blob' })
  },
  interrupt: (sessionId: number, blob: Blob, currentIndex: number) => {
    const fd = new FormData()
    fd.append('audio', blob, 'interrupt.webm')
    fd.append('current_index', currentIndex.toString())
    return api.post(`/ai/podcast/${sessionId}/interrupt/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  }
}

// Groups
export const groupsApi = {
  getGroups: (filter = 'my') => api.get('/groups/', { params: { filter } }),
  getGroup: (id: number) => api.get(`/groups/${id}/`),
  createGroup: (data: any) => api.post('/groups/', data),
  joinGroup: (id: number) => api.post(`/groups/${id}/join/`),
  leaveGroup: (id: number) => api.delete(`/groups/${id}/join/`),
  getDocuments: (groupId: number) => api.get(`/groups/${groupId}/documents/`),
  createDocument: (groupId: number, data: any) =>
    api.post(`/groups/${groupId}/documents/`, data),
  updateDocument: (groupId: number, docId: number, data: any) =>
    api.patch(`/groups/${groupId}/documents/${docId}/`, data),
  getTasks: (groupId: number) => api.get(`/groups/${groupId}/tasks/`),
  createTask: (groupId: number, data: any) =>
    api.post(`/groups/${groupId}/tasks/`, data),
  updateTask: (groupId: number, taskId: number, data: any) =>
    api.patch(`/groups/${groupId}/tasks/${taskId}/`, data),
  getMessages: (groupId: number) => api.get(`/groups/${groupId}/messages/`),
  sendMessage: (groupId: number, content: string) =>
    api.post(`/groups/${groupId}/messages/`, { content }),
  getSessions: (groupId: number) => api.get(`/groups/${groupId}/sessions/`),
}

// Planner
export const plannerApi = {
  getSessions: (start?: string, end?: string) =>
    api.get('/planner/sessions/', { params: { start, end } }),
  createSession: (data: any) => api.post('/planner/sessions/', data),
  createRecurring: (data: any) => api.post('/planner/sessions/bulk-create/', data),
  updateSession: (id: number, data: any) =>
    api.patch(`/planner/sessions/${id}/`, data),
  deleteSession: (id: number) => api.delete(`/planner/sessions/${id}/`),
  completeSession: (id: number) => api.post(`/planner/sessions/${id}/complete/`),
  getDeadlines: () => api.get('/planner/deadlines/'),
  createDeadline: (data: any) => api.post('/planner/deadlines/', data),
  updateDeadline: (id: number, data: any) =>
    api.patch(`/planner/deadlines/${id}/`, data),
  getSmartSchedule: () => api.get('/planner/smart-schedule/'),
  interpret: (prompt: string) => api.post('/planner/interpret/', { prompt }),
}

// Assignments
export const assignmentsApi = {
  getAll: () => api.get('/assignments/'),
  get: (id: number) => api.get(`/assignments/${id}/`),
  create: (data: FormData) => api.post('/assignments/', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  update: (id: number, data: any) => api.patch(`/assignments/${id}/`, data),
  delete: (id: number) => api.delete(`/assignments/${id}/`),
  solve: (id: number) => api.post(`/assignments/${id}/solve/`),
  refine: (id: number, prompt: string) => api.post(`/assignments/${id}/refine/`, { prompt }),
  generateRoadmap: (id: number) => api.post(`/assignments/${id}/roadmap/`),
  scheduleSession: (id: number, start_time: string, end_time: string) =>
    api.post(`/assignments/${id}/schedule/`, { start_time, end_time }),
  export: (id: number, format: string) =>
    api.get(`/assignments/${id}/download_intelligence/`, { params: { format }, responseType: 'blob' }),
  humanize: (id: number) => api.post(`/assignments/${id}/humanize/`),
  originality: (id: number) => api.post(`/assignments/${id}/originality/`),
  detect: (id: number) => api.post(`/assignments/${id}/detect/`),
  transformToWorkspace: (id: number) => api.post(`/assignments/${id}/transform/`),
  share: (id: number, workspace_id: number) => api.post(`/assignments/${id}/share/`, { workspace_id }),
}
// Workspace
export const workspaceApi = {
  getAll: () => api.get('/workspace/workspaces/'),
  get: (id: number) => api.get(`/workspace/workspaces/${id}/`),
  create: (data: any) => api.post('/workspace/workspaces/', data),
  update: (id: number, data: any) => api.patch(`/workspace/workspaces/${id}/`, data),
  delete: (id: number) => api.delete(`/workspace/workspaces/${id}/`),
  join: (invite_code: string) => api.post('/workspace/workspaces/join/', { invite_code }),
  getMessages: (id: number) => api.get(`/workspace/workspaces/${id}/messages/`),
  sendMessage: (id: number, content: string | FormData, parent_id?: number) => {
    if (content instanceof FormData) {
      if (parent_id) content.append('parent_id', parent_id.toString())
      return api.post(`/workspace/workspaces/${id}/messages/`, content, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    }
    return api.post(`/workspace/workspaces/${id}/messages/`, { content, parent_id })
  },
  shareResource: (id: number, resource_id: number) => api.post(`/workspace/workspaces/${id}/share_resource/`, { resource_id }),
  leave: (id: number) => api.post(`/workspace/workspaces/${id}/leave/`),
}

export const spacedRepetitionApi = {
  getDueCards: () => api.get('/library/flashcards/due/'),
  reviewCard: (id: number, quality: number) =>
    api.post(`/library/flashcards/${id}/review/`, { quality }),
  exportAnki: (resourceId?: number) => {
    const url = resourceId
      ? `/library/resources/${resourceId}/export/anki/`
      : '/library/flashcards/export/anki/'
    return api.get(url, { responseType: 'blob' })
  },
}

// Community
export const communityApi = {
  getPosts: (type?: string, tag?: string) => api.get('/community/posts/', { params: { type, tag } }),
  createPost: (data: any) => api.post('/community/posts/', data),
  likePost: (id: number) => api.post(`/community/posts/${id}/like/`),
  getComments: (postId: number) => api.get(`/community/posts/${postId}/comments/`),
  addComment: (postId: number, content: string) =>
    api.post(`/community/posts/${postId}/comments/`, { content }),
  likeComment: (id: number) => api.post(`/community/comments/${id}/like/`),
  getAIAnswer: (postId: number) => api.post(`/community/posts/${postId}/ai-answer/`),
  deletePost: (id: number) => api.delete(`/community/posts/${id}/`),
  getRooms: () => api.get('/community/rooms/'),
  createRoom: (data: any) => api.post('/community/rooms/', data),
  joinRoom: (id: number) => api.post(`/community/rooms/${id}/join/`),
  getEvents: () => api.get('/community/events/'),
  createEvent: (data: any) => api.post('/community/events/', data),
  registerEvent: (id: number) => api.post(`/community/events/${id}/register/`),
  getLeaderboard: () => api.get('/community/leaderboard/'),
  getStories: () => api.get('/community/stories/'),
  createStory: (formData: FormData) => api.post('/community/stories/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
}
