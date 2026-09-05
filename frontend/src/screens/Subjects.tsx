import { useState } from 'react'
import { Subject, Topic, TopicStatus, TimePreference } from '../types'
import { createSubject, updateSubject, updateTopicStatus, generatePlan } from '../api/endpoints'

interface SubjectsProps {
  subjects: Subject[]
  onSubjectsChanged: () => void
  planSettings: { dailyMinutes: number; timePreference: TimePreference }
}

const topicStatusConfig: Record<TopicStatus, { label: string; bg: string; text: string }> = {
  'not-started': { label: 'Not started', bg: 'bg-slate-100', text: 'text-slate-500' },
  learned: { label: 'Learned', bg: 'bg-blue-100', text: 'text-blue-700' },
  'needs-revision': { label: 'Needs revision', bg: 'bg-amber-100', text: 'text-amber-700' },
  mastered: { label: 'Mastered', bg: 'bg-emerald-100', text: 'text-emerald-700' },
}

// Cycling topic status by hand here is a manual override — the "real" way
// status changes is by completing a scheduled task (see taskController.js).
// This exists so a student can correct the plan if reality has drifted.
const statusCycle: TopicStatus[] = ['not-started', 'learned', 'needs-revision', 'mastered']
const BACKEND_STATUS: Record<TopicStatus, string> = {
  'not-started': 'not_started',
  learned: 'learned',
  'needs-revision': 'needs_revision',
  mastered: 'mastered',
}

function DotRating({ value }: { value: number }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className={`w-2 h-2 rounded-full ${i <= value ? 'bg-indigo-400' : 'bg-slate-200'}`} />
      ))}
    </div>
  )
}

function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const r = 20
  const c = 2 * Math.PI * r
  const dash = (pct / 100) * c
  return (
    <svg width="52" height="52" className="-rotate-90">
      <circle cx="26" cy="26" r={r} fill="none" stroke="#E2E8F0" strokeWidth="4" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="4" strokeDasharray={`${dash} ${c}`} strokeLinecap="round" />
      <text
        x="26"
        y="26"
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90"
        style={{ fontSize: 9, fontWeight: 700, fill: '#475569', transform: 'rotate(90deg)', transformOrigin: '26px 26px' }}
      >
        {pct}%
      </text>
    </svg>
  )
}

function daysUntil(date: string | null) {
  if (!date) return null
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000)
}

function mastered(topics: Topic[]) {
  return topics.filter(t => t.status === 'mastered').length
}

function SubjectDetail({
  subject,
  onBack,
  onChanged,
}: {
  subject: Subject
  onBack: () => void
  onChanged: () => void
}) {
  const [newTopic, setNewTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const days = daysUntil(subject.examDate)
  const pct = subject.topics.length > 0 ? Math.round((mastered(subject.topics) / subject.topics.length) * 100) : 0

  const cycleTopic = async (topic: Topic) => {
    const idx = statusCycle.indexOf(topic.status)
    const nextStatus = statusCycle[(idx + 1) % statusCycle.length]
    setBusy(true)
    try {
      await updateTopicStatus(subject.id, topic.name, BACKEND_STATUS[nextStatus])
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const addTopic = async () => {
    const trimmed = newTopic.trim()
    if (!trimmed) return
    setNewTopic('')
    setBusy(true)
    try {
      await updateSubject(subject.id, { addTopics: [trimmed] })
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 pt-6 pb-24">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-indigo-500 transition-colors mb-6">
        <span>←</span> Subjects
      </button>

      <div className="flex items-start gap-4 mb-6">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 shadow-sm"
          style={{ background: subject.color + '20' }}
        >
          {subject.emoji}
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800">{subject.name}</h1>
          <p className="text-sm text-slate-400">{days !== null ? `Exam in ${days} days` : 'No exam date'}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Difficulty</p>
              <DotRating value={subject.difficulty} />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Confidence</p>
              <DotRating value={subject.confidence} />
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-0.5">Topics</p>
              <p className="text-sm font-semibold text-slate-600">
                {subject.topics.length} total · {mastered(subject.topics)} mastered
              </p>
            </div>
          </div>
          <ProgressRing pct={pct} color={subject.color} />
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold text-slate-600">Topics</p>
        <p className="text-xs text-slate-400">Tap to cycle status</p>
      </div>

      <div className="space-y-2 mb-4">
        {subject.topics.map(topic => {
          const cfg = topicStatusConfig[topic.status]
          return (
            <button
              key={topic.id}
              disabled={busy}
              onClick={() => cycleTopic(topic)}
              className="w-full flex items-center justify-between bg-white border border-slate-100 rounded-2xl px-4 py-3 text-left shadow-sm hover:border-slate-200 transition-colors disabled:opacity-60"
            >
              <span className="text-sm font-medium text-slate-700">{topic.name}</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
            </button>
          )
        })}
        {subject.topics.length === 0 && <p className="text-sm text-slate-400">No topics yet — add one below.</p>}
      </div>

      <div className="flex gap-2">
        <input
          value={newTopic}
          onChange={e => setNewTopic(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addTopic()}
          placeholder="Add a topic…"
          className="flex-1 text-sm bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-indigo-400 transition-colors placeholder:text-slate-300"
        />
        <button
          onClick={addTopic}
          disabled={busy}
          className="px-4 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-60"
        >
          Add
        </button>
      </div>
    </div>
  )
}

export default function Subjects({ subjects, onSubjectsChanged, planSettings }: SubjectsProps) {
  const [detailId, setDetailId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [showRegenBanner, setShowRegenBanner] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const detail = subjects.find(s => s.id === detailId)

  const addSubject = async () => {
    setCreating(true)
    try {
      const doc = await createSubject({ name: 'New Subject', examDate: null, difficulty: 3, confidence: 3, topics: [] })
      onSubjectsChanged()
      setDetailId(doc._id)
      if (subjects.length > 0) setShowRegenBanner(true) // a plan already existed before this subject was added
    } finally {
      setCreating(false)
    }
  }

  const regeneratePlan = async () => {
    setRegenerating(true)
    try {
      await generatePlan({ dailyCapacityMinutes: planSettings.dailyMinutes, timePreference: planSettings.timePreference })
      setShowRegenBanner(false)
    } finally {
      setRegenerating(false)
    }
  }

  if (detail) {
    return (
      <SubjectDetail
        subject={detail}
        onBack={() => setDetailId(null)}
        onChanged={onSubjectsChanged}
      />
    )
  }

  return (
    <div className="px-4 pt-4 sm:pt-6 pb-24">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 mb-1">Subjects</h1>
          <p className="text-sm text-slate-400">Keep track of what you're learning.</p>
        </div>
        <button
          onClick={addSubject}
          disabled={creating}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold px-4 py-2.5 rounded-2xl shadow-md shadow-indigo-200 transition-all text-xs sm:text-sm disabled:opacity-60 cursor-pointer flex-shrink-0"
        >
          <span className="text-base leading-none font-bold">+</span>
          <span>{creating ? 'Adding…' : 'Add subject'}</span>
        </button>
      </div>

      {showRegenBanner && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-4 flex items-center justify-between gap-3 fade-in">
          <p className="text-sm text-indigo-700 font-medium">New subject added. Regenerate your plan to include it?</p>
          <button
            onClick={regeneratePlan}
            disabled={regenerating}
            className="flex-shrink-0 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors disabled:opacity-60"
          >
            {regenerating ? 'Working…' : 'Regenerate'}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {subjects.map(subject => {
          const days = daysUntil(subject.examDate)
          const pct = subject.topics.length > 0 ? Math.round((mastered(subject.topics) / subject.topics.length) * 100) : 0

          return (
            <button
              key={subject.id}
              onClick={() => setDetailId(subject.id)}
              className="w-full bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-left hover:border-slate-200 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0 shadow-sm"
                  style={{ background: subject.color + '20' }}
                >
                  {subject.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-800">{subject.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{days !== null ? `Exam in ${days} days` : 'No exam date'}</p>
                    </div>
                    <ProgressRing pct={pct} color={subject.color} />
                  </div>

                  <div className="flex gap-4 mt-3">
                    <div>
                      <p className="text-[10px] text-slate-400 mb-1">Difficulty</p>
                      <DotRating value={subject.difficulty} />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 mb-1">Confidence</p>
                      <DotRating value={subject.confidence} />
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 mt-2">
                    {subject.topics.length} topics · {mastered(subject.topics)} mastered
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
