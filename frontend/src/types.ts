export type SessionType = 'learn' | 'revise' | 'practice' | 'mock-test' | 'review-mistakes' | 'break'
export type SessionStatus = 'upcoming' | 'active' | 'completed' | 'missed' | 'skipped'
export type TimePreference = 'morning' | 'afternoon' | 'evening' | 'flexible'
export type Screen = 'today' | 'plan' | 'subjects' | 'progress'
export type TopicStatus = 'not-started' | 'learned' | 'needs-revision' | 'mastered'

export interface AuthUser {
  userId: string
  name: string
  email: string
}

export interface Topic {
  id: string
  name: string
  status: TopicStatus
}

export interface Subject {
  id: string
  name: string
  emoji: string
  color: string
  examDate: string | null
  difficulty: number
  confidence: number
  topics: Topic[]
}

export interface Session {
  id: string
  time: string
  subjectId: string | null
  subjectName: string
  subjectEmoji: string
  subjectColor: string
  topic: string
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
