export type SessionType = 'learn' | 'revise' | 'practice' | 'mock-test' | 'review-mistakes' | 'break'
export type SessionStatus = 'upcoming' | 'active' | 'completed' | 'missed' | 'skipped'
export type TimePreference = 'morning' | 'afternoon' | 'evening' | 'flexible'
export type Screen = 'today' | 'plan' | 'subjects' | 'progress' | 'concept-detail'
export type TopicStatus = 'not-started' | 'learned' | 'needs-revision' | 'mastered'
export type ConceptStatus = 'not_started' | 'learned' | 'needs_revision' | 'mastered'

export interface AuthUser {
  userId: string
  name: string
  email?: string | null
  isGuest?: boolean
}

export interface Topic {
  id: string
  name: string
  status: TopicStatus
}

export interface ConceptResource {
  title: string
  url?: string
  type?: string
}

export interface Concept {
  id: string
  name: string
  order: number
  importance: number // 1, 2, 3
  examRelevance: number // 1, 2, 3
  difficulty: number // 1, 2, 3, 4, 5
  estimatedStudyMinutes: number
  description?: string
  resources?: (string | ConceptResource)[]
  status: ConceptStatus
  reviewStage?: number
}

export interface Module {
  id: string
  name: string
  order: number
  hours?: number
  concepts: Concept[]
}

export interface CatalogSubject {
  _id: string
  code: string
  name: string
  credits: number
  moduleCount: number
  conceptCount: number
}

export interface Subject {
  id: string
  code?: string
  name: string
  emoji: string
  color: string
  credits?: number
  examDate: string | null
  difficulty: number
  confidence: number
  targetGoal?: 'PASS' | 'SCORE_WELL' | 'TOP' | 'FULL_PREPARATION'
  availableHours?: number
  modules: Module[]
  completedConcepts: number
  totalConcepts: number
  topics: Topic[] // backwards compatibility for legacy if any
}

export interface Session {
  id: string
  time: string
  subjectId: string | null
  subjectName: string
  subjectEmoji: string
  subjectColor: string
  topic: string
  conceptId?: string | null
  importance?: number | null
  examRelevance?: number | null
  difficulty?: number | null
  type: SessionType
  duration: number
  whyToday: string
  status: SessionStatus
}

export interface WeekDay {
  label: string
  date: string
  load: 'on-track' | 'heavy' | 'at-risk'
  sessions: Session[]
  planned: number
  capacity: number
}
