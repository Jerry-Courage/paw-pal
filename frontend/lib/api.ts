import axios from 'axios'
import { getSession, signOut } from 'next-auth/react'
import type {
  BuildJourneyRequest, BuildJourneyResponse, DueReviewsResponse,
  JourneyAnalyticsResponse, JourneyPreviewRequest, JourneyPreviewResponse,
  JourneyRoadmapResponse, RewardResponse,
  ProgressionSummary,
} from '@/types/journey'
import type { OnboardingUpdate } from '@/types/onboarding'

export const getAuthToken = async () => {
  for (let i = 0; i < 3; i++) {
    const session = await getSession()
    if ((session as any)?.accessToken) return (session as any).accessToken
    await new Promise(r => setTimeout(r, 400))
  }
  return null
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api',
})

api.interceptors.request.use(async (config) => {
  const session = await getSession()
  // If the refresh token itself has expired, sign the user out immediately
  if ((session as any)?.error === 'RefreshAccessTokenError') {
    if (typeof window !== 'undefined' && !(window as any)._isRedirecting) {
      (window as any)._isRedirecting = true
      // Clear flag after 5s in case signOut fails
      setTimeout(() => { (window as any)._isRedirecting = false }, 5000)
      await signOut({ callbackUrl: '/login?loggedOut=true', redirect: true })
    }
  }
  if (session?.accessToken) {
    config.headers.Authorization = `Bearer ${session.accessToken}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401 && !err.config._retry) {
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        try {
          // Try to get a fresh session (triggers token refresh)
          const freshSession = await getSession()
          if (freshSession?.accessToken && !(freshSession as any)?.error) {
            // Retry the request with the new token
            err.config._retry = true
            err.config.headers.Authorization = `Bearer ${freshSession.accessToken}`
            return api.request(err.config)
          }
        } catch {}
        // Refresh failed — only now sign out
        if (!(window as any)._isRedirecting) {
          (window as any)._isRedirecting = true
          setTimeout(() => { (window as any)._isRedirecting = false }, 5000)
          await signOut({ callbackUrl: '/login?loggedOut=true', redirect: true })
        }
      }
    }
    return Promise.reject(err)
  }
)

export const API_BASE = api.defaults.baseURL || ''
export const SERVER_URL = API_BASE.replace(/\/api$/, '')

export const gamificationApi = {
  getProgress: () => api.get<ProgressionSummary>('/gamification/progress/'),
}

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
  registerPushSubscription: (sub: any) => api.post('/auth/push-notifications/', sub),
  updateOnboarding: (tourId: string) => api.post('/auth/onboarding/update/', { tour_id: tourId }),
  updateOnboardingV2: (data: OnboardingUpdate) =>
    api.post<{ onboarding_status: Record<string, unknown>; onboarding_v2: OnboardingUpdate }>('/auth/onboarding/update/', { onboarding_v2: data }),
  getConfig: () => api.get('/auth/config/'),
  awardXp: (amount: number, reason: string, resourceId?: number) =>
    api.post('/auth/award-xp/', { amount, reason, resource_id: resourceId }),
  getRankings: () => api.get('/auth/rankings/'),
  changePassword: (current_password: string, new_password: string) =>
    api.post('/auth/change-password/', { current_password, new_password }),
  exportData: () => api.get('/auth/export-data/', { responseType: 'blob' }),
  deleteAccount: (password: string) =>
    api.post('/auth/delete-account/', { password }),
}

// Feedback & Testimonials
export const feedbackApi = {
  submit: (rating: number, feedback_text: string, is_testimonial = false, display_name = '') =>
    api.post('/auth/feedback/', { rating, feedback_text, is_testimonial, display_name }),
  getTestimonials: () => api.get('/auth/testimonials/'),
}

// TTS — Gemini Live voices
export const ttsApi = {
  speak: (text: string, voice = 'Aoede') =>
    api.post('/ai/tts/', { text, voice }, { responseType: 'blob' }),
  edgeSpeak: (text: string, voice = 'jenny') =>
    api.post('/ai/edge-tts/', { text, voice }, { responseType: 'blob' }),
}

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BG8EkGI7soGE5KMcQs4lKSSGAW6qfwdjhre9WCJpPtidRi403ZfoNSfhh9aCVGH21PDLrXiuMtr8yXMjYNxSnxY'

// Library
export const libraryApi = {
  getResources: (type?: string) =>
    api.get('/library/resources/', { params: type ? { type } : {} }),
  getCuratedResources: (type?: string) =>
    api.get('/library/resources/curated/', { params: type ? { type } : {} }),
  getResource: (id: number) => api.get(`/library/resources/${id}/`),
  getVRLayout: (id: number, refresh = false) => api.get(`/library/resources/${id}/vr-layout/${refresh ? '?refresh=1' : ''}`),
  getScene: (id: number) => api.get(`/library/resources/${id}/scene/`),
  generateScene: (id: number, refresh = false) => api.post(`/library/resources/${id}/scene/`, { refresh }),
  updateResource: (id: number, data: any) => api.patch(`/library/resources/${id}/`, data),
  updateResourceCover: (id: number, file: File) => {
    const fd = new FormData()
    fd.append('cover_image', file)
    return api.patch(`/library/resources/${id}/`, fd)
  },
  uploadResource: (data: FormData, onUploadProgress?: (progressEvent: any) => void) =>
    api.post('/library/resources/', data, {
      onUploadProgress
    }),
  deleteResource: (id: number) => api.delete(`/library/resources/${id}/`),
  generateFlashcards: (id: number, count = 10, level = 'undergrad') =>
    api.post(`/library/resources/${id}/flashcards/generate/`, { count, level }),
  getDecks: () => api.get('/library/flashcards/'),
  createDeck: (title: string, subject?: string) => api.post('/library/decks/', { title, subject }),
  saveFlashcardsToDeck: (deckId: number, resourceId: number | null, flashcards: any[]) =>
    api.post(`/library/decks/${deckId}/save-flashcards/`, { resource_id: resourceId, flashcards }),
  generateQuiz: (id: number, format: string, level: string, count = 10) =>
    api.post(`/library/resources/${id}/quiz/generate/`, { format, level, count }),
  generateMindMap: (id: number) =>
    api.post(`/library/resources/${id}/mindmap/generate/`),
  generatePracticeQuestions: (id: number, difficulty = 'medium', count = 5, format = 'mcq') =>
    api.post(`/library/resources/${id}/practice/generate/`, { difficulty, count, format }),
  getFlashcards: () => api.get('/library/flashcards/'),
  getResourceFlashcards: (resourceId: number) =>
    api.get('/library/flashcards/', { params: { resource: resourceId } }),
  getResourceQuizzes: (resourceId: number) =>
    api.get('/library/quizzes/', { params: { resource: resourceId } }),
  refetchTranscript: (resourceId: number) =>
    api.post(`/library/resources/${resourceId}/refetch-transcript/`),
  getQuizzes: () => api.get('/library/quizzes/'),
  solveMath: (id: number, problem: string, image?: string) =>
    api.post(`/library/resources/${id}/math/solve/`, { problem, image }),
  cloneResource: (id: number) =>
    api.post(`/library/resources/${id}/clone/`),
  getProgress: (id: number) => api.get(`/library/resources/${id}/progress/`),
  syncProgress: (id: number, data: { completed_sections?: number[]; current_section?: number }) =>
    api.put(`/library/resources/${id}/progress/`, data),
  completeStep: (id: number, step: string, score = 100) =>
    api.post(`/library/resources/${id}/progress/complete/`, { step, score }),
  reprocessResource: (id: number) => api.post(`/library/resources/${id}/reprocess/`),
  getSectionQuiz: (id: number, section_title: string, section_content: string) =>
    api.post(`/library/resources/${id}/section-quiz/`, { section_title, section_content }),
}

// AI
export const aiApi = {
  getSessions: () => api.get('/ai/sessions/'),
  createSession: (data: any) => api.post('/ai/sessions/', data),
  getSession: (id: number) => api.get(`/ai/sessions/${id}/`),
  deleteSession: (id: number) => api.delete(`/ai/sessions/${id}/`),
  sendMessage: (sessionId: number, content: string, config?: any) =>
    api.post(`/ai/sessions/${sessionId}/message/`, { content }, config),
  sendVisionMessage: (sessionId: number, content: string, file?: File, imageDataUrl?: string, config?: any) => {
    const fd = new FormData()
    if (content) fd.append('content', content)
    if (file) fd.append('file', file)
    if (imageDataUrl) fd.append('image', imageDataUrl)
    return api.post(`/ai/sessions/${sessionId}/message/vision/`, fd, {
      ...config,
    })
  },
  getLiveVisionWsUrl: async () => {
    const token = await getAuthToken()
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'
    const backendHost = (API_BASE || '').replace(/^https?:\/\//, '').replace(/\/api\/?$/, '')
    const host = backendHost || window.location.host
    return `${protocol}://${host}/ws/ai/live-vision/?token=${token}`
  },
  generateDiagram: (description: string, type: string, message_id?: number) =>
    api.post('/ai/diagram/', { description, type, message_id }),
  generateImage: (prompt: string, message_id?: number) =>
    api.post('/ai/generate-image/', { prompt, message_id }),
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
  askAgent: (query: string, context?: string, voice_enabled?: boolean, voice_id?: string, history: any[] = [], is_tutor_mode: boolean = false, session_id?: number) =>
    api.post('/ai/agent/', { query, context, voice_enabled, voice_id, history, is_tutor_mode, session_id }),
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
  async *streamAgentResponse(query: string, context?: string, history: any[] = [], is_tutor_mode: boolean = false, session_id?: number) {
    const token = await getAuthToken()
    const response = await fetch(`${api.defaults.baseURL}/ai/agent/stream/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ query, context, history, is_tutor_mode, session_id })
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
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
        
        const content = trimmedLine.slice(6).trim();
        if (content === '[DONE]') return
        try {
          const parsed = JSON.parse(content)
          if (parsed.chunk) {
            yield parsed.chunk
          } else if (parsed.message_id !== undefined) {
            yield parsed
          }
        } catch (e) {
          console.error('SSE Parse Error', e)
        }
      }
    }
  }
}

// Podcast
export const podcastApi = {
  getExistingSession: (resourceId: number) =>
    api.get(`/ai/resources/${resourceId}/podcast/`),
  createSession: (resourceId: number, voice_a: string, voice_b: string, length: number) =>
    api.post(`/ai/resources/${resourceId}/podcast/`, { voice_a, voice_b, length }),
  getStatus: (sessionId: number) =>
    api.get(`/ai/podcast/${sessionId}/status/`),
  getChunk: (sessionId: number, currentIndex: number, text?: string) => {
    const params = text ? { h: text.substring(0, 32) } : {}
    return api.get(`/ai/podcast/${sessionId}/chunk/${currentIndex}/`, { params, responseType: 'blob', timeout: 90000 })
  },
  interrupt: (sessionId: number, blob: Blob, currentIndex: number) => {
    const fd = new FormData()
    fd.append('audio', blob, 'interrupt.webm')
    fd.append('current_index', currentIndex.toString())
    return api.post(`/ai/podcast/${sessionId}/interrupt/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  }
}

// Study Song
export const studySongApi = {
  getSong: (resourceId: number, style = 'upbeat_rap') =>
    api.get(`/ai/resources/${resourceId}/song/`, { params: { style } }),
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
  // Quiz Battle
  createQuiz:    (data: any) => api.post('/groups/quiz/', data),
  generateQuiz:  (data: any) => api.post('/groups/quiz/generate/', data),
  joinQuiz:      (pin: string) => api.post('/groups/quiz/join/', { pin }),
  getQuizRoom:   (pin: string) => api.get(`/groups/quiz/${pin}/`),
  getQuizQuestions: (pin: string) => api.get(`/groups/quiz/${pin}/questions/`),
  getBattleHistory: () => api.get('/groups/battle-history/'),
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
  interpret: (prompt: string) => {
    // Send the client's local ISO datetime so the AI anchors "today/tomorrow"
    // to the user's actual calendar day, not the UTC server time.
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const localNow = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:00`
    return api.post('/planner/interpret/', { prompt, local_now: localNow })
  },
  parseTimetable: (data: FormData) =>
    api.post('/planner/parse-timetable/', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  parseTimetableBase64: (image: string) =>
    api.post('/planner/parse-timetable/', { image }),
  sendReminders: () => api.post('/planner/send-reminders/', {}),
}

// Learning Paths
export const learningApi = {
  getPaths: () => api.get('/learning/paths/'),
  getPath: (id: string) => api.get(`/learning/paths/${id}/`),
  createPath: (data: any) => api.post('/learning/paths/', data),
  deletePath: (id: string) => api.delete(`/learning/paths/${id}/`),
  /** @deprecated Legacy create-then-generate contract. Use generatePreview + buildJourney. */
  generateConcepts: (id: string, resources: number[]) =>
    api.post(`/learning/paths/${id}/generate/`, { resources }),
  generatePreview: (data: JourneyPreviewRequest) =>
    api.post<JourneyPreviewResponse>('/learning/paths/generate-preview/', data),
  buildJourney: (data: BuildJourneyRequest) =>
    api.post<BuildJourneyResponse>('/learning/paths/build/', data),
  getRoadmap: (id: string) => api.get<JourneyRoadmapResponse>(`/learning/paths/${id}/roadmap/`),
  getDueReviews: (id: string) => api.get<DueReviewsResponse>(`/learning/paths/${id}/due-reviews/`),
  getAnalytics: (id: string) => api.get<JourneyAnalyticsResponse>(`/learning/paths/${id}/analytics/`),
  // Concepts
  getConcept: (id: string) => api.get(`/learning/concepts/${id}/`),
  getConceptActivities: (id: string) => api.get(`/learning/concepts/${id}/activities/`),
  getTeachingSession: (id: string) => api.get(`/learning/concepts/${id}/teaching-session/`),
  sendTeachingMessage: (id: string, data: { message: string; idempotency_key: string }) => api.post(`/learning/concepts/${id}/teaching-message/`, data),
  submitTeachingResponse: (id: string, data: { activity_id: string; response: unknown }) => api.post(`/learning/concepts/${id}/teaching-response/`, data),
  saveTeachingFlashcards: (id: string, cards: Array<{ question: string; answer: string; difficulty: string }>) => api.post(`/learning/concepts/${id}/teaching-flashcards/save/`, { cards }),
  getTeachingVoiceContext: (id: string) => api.get(`/learning/concepts/${id}/teaching-voice-context/`),
  sendTeachingVoiceEvent: (id: string, data: { event: string; objective_id?: string; misconception?: string; summary?: string; evidence_type?: 'explanation' | 'application' | 'calculation' | 'prediction'; evidence_score?: number; evidence_id?: string }) => api.post(`/learning/concepts/${id}/teaching-voice-event/`, data),
  getTeachingCompletion: (id: string) => api.get(`/learning/concepts/${id}/teaching-completion/`),
  finalizeTeachingSession: (id: string) => api.post(`/learning/concepts/${id}/teaching-completion/`),
  submitConceptAttempt: (id: string, data: { activity_id: string; response: unknown }) =>
    api.post(`/learning/concepts/${id}/attempt/`, data),
  askFlowInConcept: (id: string, data: { question?: string; action?: string; stage: string; activity_id?: string; learner_response?: unknown; correct?: boolean | null }) =>
    api.post(`/learning/concepts/${id}/ask-flow/`, data),
  completeConcept: (id: string, score: number) =>
    api.post<{ message: string; xp_earned: number; unlocked: string[]; reward: RewardResponse }>(`/learning/concepts/${id}/complete/`, { score }),
  reviewConcept: (id: string, score: number) =>
    api.post(`/learning/concepts/${id}/review/`, { score }),
  getSourceContext: (id: string) => api.get(`/learning/concepts/${id}/source-context/`),
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
  editMessage: (workspace_id: number, message_id: number, content: string) => api.patch(`/workspace/workspaces/${workspace_id}/messages/${message_id}/`, { content }),
  deleteMessage: (workspace_id: number, message_id: number) => api.delete(`/workspace/workspaces/${workspace_id}/messages/${message_id}/`),
  // Missing methods used in ResourceShelf
  getFiles: (id: number) => api.get(`/workspace/workspaces/${id}/files/`),
  getVersions: (id: number) => api.get(`/workspace/workspaces/${id}/versions/`),
  createVersion: (id: number) => api.post(`/workspace/workspaces/${id}/versions/`),
  restoreVersion: (id: number, versionId: number) => api.post(`/workspace/workspaces/${id}/versions/${versionId}/restore/`),
  linkResource: (id: number, resource_id: number) => api.post(`/workspace/workspaces/${id}/link_resource/`, { resource_id }),
  unlinkResource: (id: number, resource_id: number) => api.post(`/workspace/workspaces/${id}/unlink_resource/`, { resource_id }),
  aiAssist: (id: number, action: string, data: any) => api.post(`/workspace/workspaces/${id}/ai_assist/`, { action, ...data }),
  deleteBlock: (id: number, blockId: number) => api.delete(`/workspace/workspaces/${id}/blocks/${blockId}/`),
  reorderBlocks: (id: number, blockIds: number[]) => api.post(`/workspace/workspaces/${id}/blocks/reorder/`, { block_ids: blockIds }),
  getBlocks: (id: number) => api.get(`/workspace/workspaces/${id}/blocks/`),
  createBlock: (id: number, data: any) => api.post(`/workspace/workspaces/${id}/blocks/`, data),
  updateBlock: (id: number, data: any) => api.patch(`/workspace/workspaces/${id}/blocks/${data.block_id || data.id}/`, data),
}

// Payments & Marketplace
export const paymentsApi = {
  getStatus: () => api.get('/payments/status/'),
  initialize: (callback_url?: string, promo_code?: string, currency?: string, amount?: number) =>
    api.post('/payments/initialize/', { callback_url, promo_code, currency, amount }),
  verify: (reference: string) => api.get(`/payments/verify/?reference=${reference}`),
  applyPromo: (code: string) => api.post('/payments/promo/', { code }),
  getMarketplaceInventory: () => api.get('/payments/marketplace/inventory/'),
  buyPowerup: (itemId: string) => api.post('/payments/marketplace/buy-powerup/', { item_id: itemId }),
  usePowerup: (itemId: string) => api.post('/payments/marketplace/use-powerup/', { item_id: itemId }),
  buyXpPack: (packId: string, callbackUrl?: string) =>
    api.post('/payments/marketplace/buy-xp/', { pack_id: packId, callback_url: callbackUrl }),
  buyTheme: (themeId: string) => api.post('/payments/marketplace/buy-theme/', { theme_id: themeId }),
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
