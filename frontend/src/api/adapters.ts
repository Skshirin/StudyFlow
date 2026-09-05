// Converts backend documents (Subject/Task, snake-ish enums like
// 'not_started', 'MOCK_TEST') into the frontend's display types
// (Subject/Session, dash-cased enums like 'not-started', 'mock-test').
// This is the ONLY place that needs to know both shapes.

import { Subject, Session, SessionType, SessionStatus, TopicStatus } from '../types'

const EMOJI_MAP: Record<string, string> = {
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

/** Backend Subject doc -> frontend Subject (adds display-only emoji/color). */
export function mapBackendSubject(subject: any, index: number): Subject {
  return {
    id: subject._id,
    name: subject.name,
    emoji: guessEmoji(subject.name),
    color: colorForIndex(index),
    examDate: subject.examDate || null,
    difficulty: subject.difficulty,
    confidence: subject.confidence,
    topics: (subject.topics || []).map((t: any) => ({
      id: t.name, // topics have no separate _id on the backend; name is the stable key
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
    type: TASK_TYPE_MAP[task.type] || 'learn',
    duration: task.duration,
    whyToday: task.reason || '',
    status: TASK_STATUS_MAP[task.status] || 'upcoming',
  }
}

// Cheap deterministic index so a session card's color matches its Subjects-list
// card color even though a task only carries subjectName, not the full subject
// list with its position-based palette assignment.
function hashIndex(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return h
}
