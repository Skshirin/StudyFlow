import { useState } from 'react'
import { Session, SessionType } from '../types'

const typeConfig: Record<SessionType, { label: string; bg: string; text: string }> = {
  learn: { label: 'LEARN', bg: 'bg-violet-100', text: 'text-violet-700' },
  revise: { label: 'REVISE', bg: 'bg-blue-100', text: 'text-blue-700' },
  practice: { label: 'PRACTICE', bg: 'bg-pink-100', text: 'text-pink-700' },
  'mock-test': { label: 'MOCK TEST', bg: 'bg-amber-100', text: 'text-amber-700' },
  'review-mistakes': { label: 'REVIEW', bg: 'bg-orange-100', text: 'text-orange-700' },
  break: { label: 'BREAK', bg: 'bg-emerald-50', text: 'text-emerald-600' },
}

const importanceConfig: Record<number, { label: string; bg: string; text: string }> = {
  3: { label: 'HIGH IMP', bg: 'bg-amber-100', text: 'text-amber-700' },
  2: { label: 'MED IMP', bg: 'bg-blue-100', text: 'text-blue-700' },
  1: { label: 'LOW IMP', bg: 'bg-slate-100', text: 'text-slate-600' },
}

const examRelevanceConfig: Record<number, { label: string; bg: string; text: string }> = {
  3: { label: 'HIGH EXAM', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  2: { label: 'MED EXAM', bg: 'bg-teal-100', text: 'text-teal-700' },
  1: { label: 'LOW EXAM', bg: 'bg-slate-100', text: 'text-slate-600' },
}

interface SessionCardProps {
  session: Session
  onStart?: (id: string) => void
  onComplete?: (id: string) => void
  onMissed?: (id: string) => void
}

export default function SessionCard({ session, onStart, onComplete, onMissed }: SessionCardProps) {
  const [whyExpanded, setWhyExpanded] = useState(false)

  if (session.type === 'break') {
    return (
      <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 flex items-center gap-3">
        <span className="text-lg">☕</span>
        <div>
          <p className="text-sm font-medium text-slate-400">Break</p>
          <p className="text-xs text-slate-400">{session.duration} min — step away, breathe</p>
        </div>
      </div>
    )
  }

  const tc = typeConfig[session.type]
  const isCompleted = session.status === 'completed'
  const isMissed = session.status === 'missed' || session.status === 'skipped'
  const isActive = session.status === 'active'

  const whyText = session.whyToday || (
    session.importance && session.examRelevance
      ? `${session.importance === 3 ? 'High' : session.importance === 2 ? 'Medium' : 'Standard'} importance, ${session.examRelevance === 3 ? 'high' : 'medium'} exam relevance`
      : ''
  )

  return (
    <div
      className={`rounded-2xl border px-4 py-4 transition-all duration-200 session-card-enter ${
        isCompleted
          ? 'bg-slate-50 border-slate-100 opacity-60'
          : isMissed
          ? 'bg-slate-50 border-slate-100 opacity-50'
          : isActive
          ? 'bg-white border-indigo-200 shadow-md shadow-indigo-50 ring-1 ring-indigo-200'
          : 'bg-white border-slate-100 shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-base leading-none mt-0.5">{session.subjectEmoji}</span>
          <div className="min-w-0">
            <p className={`text-xs font-semibold tracking-wide mb-0.5 ${isCompleted || isMissed ? 'text-slate-400' : 'text-slate-500'}`}>
              {session.subjectName}
            </p>
            <p className={`font-semibold text-sm leading-snug ${isCompleted || isMissed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
              {session.topic}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1 flex-shrink-0">
          <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full ${tc.bg} ${tc.text}`}>
            {tc.label}
          </span>
          {session.importance && importanceConfig[session.importance] && (
            <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full ${importanceConfig[session.importance].bg} ${importanceConfig[session.importance].text}`}>
              {importanceConfig[session.importance].label}
            </span>
          )}
          {session.examRelevance && examRelevanceConfig[session.examRelevance] && (
            <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full ${examRelevanceConfig[session.examRelevance].bg} ${examRelevanceConfig[session.examRelevance].text}`}>
              {examRelevanceConfig[session.examRelevance].label}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-slate-400 font-medium">{session.duration} min</span>
        {isCompleted && (
          <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <span>✓</span> Completed
          </span>
        )}
        {isMissed && (
          <span className="text-xs text-rose-400 font-medium">
            {session.status === 'skipped' ? 'Skipped' : 'Not completed'}
          </span>
        )}
      </div>

      {!isCompleted && !isMissed && whyText && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <button
            onClick={() => setWhyExpanded(!whyExpanded)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-500 transition-colors font-medium"
          >
            Why today?
            <span className={`transition-transform duration-200 ${whyExpanded ? 'rotate-90' : ''}`}>›</span>
          </button>
          {whyExpanded && (
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed fade-in">
              {whyText}
            </p>
          )}
        </div>
      )}

      {!isCompleted && !isMissed && (
        <div className="mt-3 flex gap-2">
          {isActive ? (
            <>
              <button
                onClick={() => onComplete?.(session.id)}
                className="flex-1 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                Mark complete
              </button>
              <button
                onClick={() => onMissed?.(session.id)}
                className="px-4 text-sm font-medium text-slate-500 hover:text-rose-500 bg-slate-100 hover:bg-rose-50 py-2.5 rounded-xl transition-colors"
              >
                {"I couldn't do this"}
              </button>
            </>
          ) : (
            <button
              onClick={() => onStart?.(session.id)}
              className="px-5 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-600 text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              Start
            </button>
          )}
        </div>
      )}
    </div>
  )
}
