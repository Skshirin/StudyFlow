// One function per backend route (see backend/README.md "API reference" for
// the full contract). Screens call these instead of touching `api` directly.

import { api } from './client'

// ---- Auth ----
export const loginUser = (payload: { email: string; password: string }) =>
  api.post('/auth/login', payload)

export const registerUser = (payload: { name: string; email: string; password: string }) =>
  api.post('/auth/register', payload)

export const fetchCurrentUser = () => api.get('/auth/me')

// ---- Subjects ----
export const fetchSubjects = () => api.get('/subjects')

export const createSubject = (payload: {
  name: string
  examDate: string | null
  difficulty: number
  confidence: number
  topics: string[]
}) => api.post('/subjects', payload)

export const updateSubject = (
  id: string,
  payload: Partial<{
    name: string
    examDate: string | null
    difficulty: number
    confidence: number
    addTopics: string[]
  }>
) => api.put(`/subjects/${id}`, payload)

export const updateTopicStatus = (subjectId: string, topicName: string, status: string) =>
  api.put(`/subjects/${subjectId}/topics/${encodeURIComponent(topicName)}`, { status })

export const deleteSubject = (id: string) => api.del(`/subjects/${id}`)

// ---- Plan ----
export const generatePlan = (payload: { dailyCapacityMinutes: number; timePreference: string }) =>
  api.post('/plan/generate', payload)

export const fetchToday = () => api.get('/plan/today')

export const fetchByDate = (date: string) => api.get(`/plan/${date}`)

export const fetchPlanHealth = () => api.get('/plan/health')

export const logEnergy = (date: string, level: 'high' | 'normal' | 'low') =>
  api.post('/plan/energy', { date, level })

export const adjustPlan = (text: string) => api.post('/plan/adjust', { text })

// ---- Tasks ----
export const completeTask = (id: string, feedback?: 'easy' | 'normal' | 'difficult') =>
  api.post(`/tasks/${id}/complete`, feedback ? { feedback } : {})

export const missTask = (id: string) => api.post(`/tasks/${id}/miss`)
