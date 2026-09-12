// Converts backend documents (Subject/Task, snake-ish enums like
// 'not_started', 'MOCK_TEST') into the frontend's display types
// (Subject/Session, dash-cased enums like 'not-started', 'mock-test').
// This is the ONLY place that needs to know both shapes.

import { Subject, Session, SessionType, SessionStatus, TopicStatus, Module, Concept, ConceptStatus } from '../types'

const EMOJI_MAP: Record<string, string> = {
  'machine learning': '🤖', ml: '🤖',
  'big data': '🐘', hadoop: '🐘', bda: '🐘',
  'natural language': '💬', nlp: '💬',
  blockchain: '⛓️', crypto: '⛓️',
  math: '📐', mathematics: '📐',
  'computer science': '💻', cs: '💻', dsa: '💻',
  physics: '⚛️', chemistry: '🧪', biology: '🧬',
  history: '📜', english: '📖', economics: '📈',
}

const COLOR_PALETTE = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6']

export function guessEmoji(name: string): string {
  const lower = (name || '').toLowerCase()
  for (const key of Object.keys(EMOJI_MAP)) {
    if (lower.includes(key)) return EMOJI_MAP[key]
  }
  return '📚'
}

export function colorForIndex(index: number): string {
  return COLOR_PALETTE[index % COLOR_PALETTE.length]
}

const TOPIC_STATUS_MAP: Record<string, TopicStatus> = {
  not_started: 'not-started',
  learned: 'learned',
  needs_revision: 'needs-revision',
  mastered: 'mastered',
}

const TASK_TYPE_MAP: Record<string, SessionType> = {
  LEARN: 'learn',
  REVISE: 'revise',
  PRACTICE: 'practice',
  MOCK_TEST: 'mock-test',
  REVIEW_MISTAKES: 'review-mistakes',
  BREAK: 'break',
}

const TASK_STATUS_MAP: Record<string, SessionStatus> = {
  pending: 'upcoming',
  completed: 'completed',
  missed: 'missed',
  skipped: 'skipped',
}

/** Backend Subject doc -> frontend Subject (adds display-only emoji/color, modules & concepts). */
export function mapBackendSubject(subject: any, index: number): Subject {
  const modules: Module[] = (subject.modules || []).map((m: any) => ({
    id: m._id,
    name: m.name,
    order: m.order,
    hours: m.hours,
    concepts: (m.concepts || []).map((c: any): Concept => ({
      id: c._id,
      name: c.name,
      order: c.order,
      importance: c.importance || 2,
      examRelevance: c.examRelevance || 2,
      difficulty: c.difficulty || 3,
      estimatedStudyMinutes: c.estimatedStudyMinutes || 45,
      description: c.description || '',
      resources: c.resources || [],
      status: (c.status as ConceptStatus) || 'not_started',
      reviewStage: c.reviewStage || 0,
    })),
  }))

  // Count concepts if not provided directly
  let totalConcepts = subject.totalConcepts
  let completedConcepts = subject.completedConcepts
  if (totalConcepts === undefined) {
    totalConcepts = modules.reduce((acc, m) => acc + m.concepts.length, 0)
  }
  if (completedConcepts === undefined) {
    completedConcepts = modules.reduce((acc, m) => acc + m.concepts.filter(c => c.status === 'mastered').length, 0)
  }

  return {
    id: subject._id,
    code: subject.code,
    name: subject.name,
    emoji: guessEmoji(subject.name),
    color: colorForIndex(index),
    credits: subject.credits,
    examDate: subject.examDate || null,
    difficulty: subject.difficulty || 3,
    confidence: subject.confidence || 3,
    targetGoal: subject.targetGoal,
    availableHours: subject.availableHours,
    modules,
    totalConcepts,
    completedConcepts,
    topics: (subject.topics || []).map((t: any) => ({
      id: t.name,
      name: t.name,
      status: TOPIC_STATUS_MAP[t.status] || 'not-started',
    })),
  }
}

/** Backend Task doc -> frontend Session. */
export function mapBackendTask(task: any): Session {
  const isBreak = task.type === 'BREAK'
  return {
    id: task._id,
    time: task.startTime || 'Added',
    subjectId: task.subjectId || null,
    subjectName: isBreak ? 'Break' : task.subjectName,
    subjectEmoji: isBreak ? '☕' : guessEmoji(task.subjectName || ''),
    subjectColor: isBreak ? '#94A3B8' : colorForIndex(hashIndex(task.subjectName || '')),
    topic: isBreak ? '' : task.topic,
    conceptId: task.conceptId || null,
    importance: task.importance || null,
    examRelevance: task.examRelevance || null,
    difficulty: task.difficulty || null,
    type: TASK_TYPE_MAP[task.type] || 'learn',
    duration: task.duration,
    whyToday: task.reason || '',
    status: TASK_STATUS_MAP[task.status] || 'upcoming',
  }
}

function hashIndex(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h
}
