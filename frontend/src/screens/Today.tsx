import { useEffect, useState } from 'react'
import { Session, AuthUser } from '../types'
import SessionCard from '../components/SessionCard'
import { fetchToday, completeTask, missTask, adjustPlan } from '../api/endpoints'
import { mapBackendTask } from '../api/adapters'

interface PlanHealth {
  status: 'green' | 'yellow' | 'red'
  message: string
  requiredMinutes: number
  availableMinutes: number | null
  earliestExamDays: number | null
}

interface ImpactedRow {
  date: string
  addedMinutes: number
}

function FeedbackModal({ onClose }: { onClose: (rating: string | null) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => onClose(null)}>
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-t-3xl w-full max-w-md px-6 pt-6 pb-10 shadow-2xl fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-6" />
        <h3 className="text-lg font-bold text-slate-800 text-center mb-1">How did that feel?</h3>
        <p className="text-sm text-slate-400 text-center mb-6">Your feedback helps us adjust your plan</p>
        <div className="flex gap-3">
          {[
            { emoji: '😵', label: 'Difficult', color: 'bg-rose-50 border-rose-200 text-rose-600' },
            { emoji: '🙂', label: 'Normal', color: 'bg-slate-50 border-slate-200 text-slate-600' },
            { emoji: '😄', label: 'Easy', color: 'bg-emerald-50 border-emerald-200 text-emerald-600' },
          ].map(opt => (
            <button
              key={opt.label}
              onClick={() => onClose(opt.label)}
              className={`flex-1 flex flex-col items-center gap-1.5 border-2 rounded-2xl py-4 font-semibold text-sm transition-all hover:scale-105 active:scale-95 ${opt.color}`}
            >
              <span className="text-2xl">{opt.emoji}</span>
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => onClose(null)}
          className="w-full mt-4 text-sm text-slate-400 hover:text-slate-600 py-2 transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  )
}

function PlanUpdateModal({
  missedSummary,
  impacted,
  onClose,
}: {
  missedSummary?: { subjectEmoji: string; subjectName: string; topic: string; duration: number }
  impacted: ImpactedRow[]
  onClose: () => void
}) {
  const formatDate = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`)
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-t-3xl w-full max-w-md px-6 pt-6 pb-10 shadow-2xl fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-6" />
        <h3 className="text-lg font-bold text-slate-800 mb-1">Your plan has been rebalanced.</h3>
        <p className="text-sm text-slate-400 mb-5">
          {"No worries — we'll spread this work across your remaining time."}
        </p>

        {missedSummary && (
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 mb-4">
            <p className="text-xs font-bold text-rose-400 tracking-wider uppercase mb-2">Missed</p>
            <div className="flex items-center gap-2">
              <span className="text-base">{missedSummary.subjectEmoji}</span>
              <div>
                <p className="text-sm font-semibold text-slate-700">{missedSummary.subjectName}</p>
                <p className="text-xs text-slate-500">
                  {missedSummary.topic} · {missedSummary.duration} min
                </p>
              </div>
            </div>
          </div>
        )}

        {impacted.length > 0 ? (
          <>
            <p className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-2">Moved to</p>
            <div className="space-y-2 mb-5">
              {impacted.map((item, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-2.5">
                  <span className="text-sm font-medium text-slate-600">{formatDate(item.date)}</span>
                  <span className="text-sm font-semibold text-indigo-500">+{item.addedMinutes} min</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-5">
            <p className="text-sm text-amber-700">
              No spare capacity in the next few days — consider lightening your plan or increasing your daily time.
            </p>
          </div>
        )}

        {impacted.length > 0 && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-5 space-y-1.5">
            {['Daily limit maintained', 'Exam deadlines respected', 'Other priorities protected'].map(item => (
              <div key={item} className="flex items-center gap-2">
                <span className="text-emerald-500 font-bold text-sm">✓</span>
                <span className="text-sm text-emerald-700 font-medium">{item}</span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl text-sm transition-colors shadow-sm shadow-indigo-200"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

const HEALTH_CONFIG = {
  green: { icon: '🟢', label: 'On track', chip: 'bg-emerald-50 border-emerald-200 text-emerald-700 [&>span]:bg-emerald-500' },
  yellow: { icon: '🟡', label: 'Getting tight', chip: 'bg-amber-50 border-amber-200 text-amber-700 [&>span]:bg-amber-500' },
  red: { icon: '🔴', label: 'At risk', chip: 'bg-rose-50 border-rose-200 text-rose-700 [&>span]:bg-rose-500' },
}

function PlanHealthModal({ health, onClose }: { health: PlanHealth; onClose: () => void }) {
  const cfg = HEALTH_CONFIG[health.status]
  const requiredH = Math.round((health.requiredMinutes / 60) * 10) / 10
  const availableH = health.availableMinutes !== null ? Math.round((health.availableMinutes / 60) * 10) / 10 : null
  const bufferH = availableH !== null ? Math.round((availableH - requiredH) * 10) / 10 : null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-t-3xl w-full max-w-md px-6 pt-6 pb-10 shadow-2xl fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-6" />
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{cfg.icon}</span>
          <h3 className="text-xl font-bold text-slate-800">{cfg.label}</h3>
        </div>
        <p className="text-sm text-slate-500 mb-6">{health.message}</p>

        {availableH !== null && (
          <div className="space-y-3 mb-5">
            {[
              { label: 'Remaining study', value: `${requiredH}h`, pct: 100 },
              { label: 'Available capacity', value: `${availableH}h`, pct: availableH ? Math.min((requiredH / availableH) * 100, 100) : 0 },
              { label: 'Buffer', value: `${bufferH! > 0 ? bufferH : 0}h`, pct: bufferH! > 0 && availableH ? (bufferH! / availableH) * 100 : 0 },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600 font-medium">{item.label}</span>
                  <span className="font-bold text-slate-800">{item.value}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-400 rounded-full transition-all" style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold py-3 rounded-2xl text-sm transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}

type Toast = { id: number; message: string }

interface TodayProps {
  user?: AuthUser | null
}

export default function Today({ user }: TodayProps) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [planHealth, setPlanHealth] = useState<PlanHealth | null>(null)

  const [feedbackSessionId, setFeedbackSessionId] = useState<string | null>(null)
  const [planUpdate, setPlanUpdate] = useState<{
    missedSummary?: { subjectEmoji: string; subjectName: string; topic: string; duration: number }
    impacted: ImpactedRow[]
  } | null>(null)
  const [showPlanHealth, setShowPlanHealth] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [aiResponse, setAiResponse] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = (message: string) => {
    const id = Date.now()
    setToasts(t => [...t, { id, message }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000)
  }

  const loadToday = () => {
    setLoading(true)
    setLoadError(null)
    fetchToday()
      .then(res => {
        setSessions(res.tasks.map(mapBackendTask))
        setPlanHealth(res.planHealth)
      })
      .catch(err => setLoadError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadToday()
  }, [])

  const studySessions = sessions.filter(s => s.type !== 'break')
  const totalMin = sessions.reduce((acc, s) => acc + (s.type !== 'break' ? s.duration : 0), 0)
  const totalH = Math.floor(totalMin / 60)
  const totalM = totalMin % 60
  const totalStr = totalH > 0 ? (totalM > 0 ? `${totalH}h ${totalM}m` : `${totalH}h`) : `${totalM}m`
  const completedCount = studySessions.filter(s => s.status === 'completed').length

  const hour = new Date().getHours()
  const timeOfDay = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const greeting = user?.name ? `${timeOfDay}, ${user.name} 👋` : `${timeOfDay} 👋`

  const updateSession = (id: string, updates: Partial<Session>) => {
    setSessions(prev => prev.map(s => (s.id === id ? { ...s, ...updates } : s)))
  }

  const handleStart = (id: string) => updateSession(id, { status: 'active' }) // local-only UI state, no backend "start" concept

  const handleComplete = (id: string) => setFeedbackSessionId(id)

  const handleMissed = async (id: string) => {
    const session = sessions.find(s => s.id === id)
    try {
      const res = await missTask(id)
      updateSession(id, { status: 'missed' })
      setPlanUpdate({
        missedSummary: session
          ? { subjectEmoji: session.subjectEmoji, subjectName: session.subjectName, topic: session.topic, duration: session.duration }
          : undefined,
        impacted: res.impacted || [],
      })
    } catch (err: any) {
      addToast(err.message || 'Could not update that session')
    }
  }

  const handleFeedbackClose = async (rating: string | null) => {
    const id = feedbackSessionId
    setFeedbackSessionId(null)
    if (!id) return
    const feedback = rating ? (rating.toLowerCase() as 'easy' | 'normal' | 'difficult') : 'normal'
    try {
      await completeTask(id, feedback)
      updateSession(id, { status: 'completed' })
      addToast(rating ? `Session logged as ${rating.toLowerCase()} — plan updated` : 'Session completed ✓')
    } catch (err: any) {
      addToast(err.message || 'Could not save that')
    }
  }

  const handleAiSubmit = async () => {
    const text = aiInput.trim()
    if (!text) return
    setAiInput('')
    setAiLoading(true)
    setAiResponse(null)
    try {
      const res = await adjustPlan(text)
      setAiResponse(res.message)
      if (res.tasks) setSessions(res.tasks.map(mapBackendTask))
      if (res.impacted) setPlanUpdate({ impacted: res.impacted })
    } catch (err: any) {
      addToast(err.message || 'Could not adjust your plan')
    } finally {
      setAiLoading(false)
    }
  }

  const dotColor = (session: Session) => {
    if (session.type === 'break') return 'bg-emerald-300'
    if (session.status === 'completed') return 'bg-emerald-400'
    if (session.status === 'missed' || session.status === 'skipped') return 'bg-rose-300'
    if (session.status === 'active') return 'bg-indigo-500 ring-4 ring-indigo-100'
    return 'bg-slate-300'
  }

  if (loading) {
    return <div className="px-4 pt-24 text-center text-sm text-slate-400">Loading your day…</div>
  }

  if (loadError) {
    return (
      <div className="px-4 pt-24 text-center">
        <p className="text-sm text-rose-500 mb-3">{loadError}</p>
        <button onClick={loadToday} className="text-sm font-semibold text-indigo-600">
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="px-4 pt-4 sm:pt-6 pb-4">
        <div className="mb-5">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 mb-1">{greeting}</h1>
          {planHealth?.earliestExamDays !== null && planHealth?.earliestExamDays !== undefined ? (
            <p className="text-sm text-slate-400">{planHealth.earliestExamDays} days until your nearest exam</p>
          ) : (
            <p className="text-sm text-slate-400">No upcoming exams — great time to get ahead</p>
          )}
        </div>

        {planHealth && (
          <button
            onClick={() => setShowPlanHealth(true)}
            className={`inline-flex items-center gap-1.5 border text-xs font-semibold px-3 py-1.5 rounded-full transition-colors mb-4 ${HEALTH_CONFIG[planHealth.status].chip}`}
          >
            <span className="w-1.5 h-1.5 rounded-full" />
            {HEALTH_CONFIG[planHealth.status].label}
          </button>
        )}

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">{"Today's focus"}</p>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-2xl font-extrabold text-slate-800">{totalStr}</p>
              <p className="text-xs text-slate-400">planned</p>
            </div>
            <div className="w-px h-8 bg-slate-100" />
            <div>
              <p className="text-2xl font-extrabold text-slate-800">{studySessions.length}</p>
              <p className="text-xs text-slate-400">sessions</p>
            </div>
            <div className="w-px h-8 bg-slate-100" />
            <div>
              <p className="text-2xl font-extrabold text-slate-800">{completedCount}</p>
              <p className="text-xs text-slate-400">done</p>
            </div>
          </div>
          {completedCount > 0 && studySessions.length > 0 && (
            <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-400 rounded-full transition-all duration-500"
                style={{ width: `${(completedCount / studySessions.length) * 100}%` }}
              />
            </div>
          )}
        </div>

        {aiResponse && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-4 fade-in">
            <div className="flex items-start gap-2">
              <span className="text-sm">✨</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-indigo-700 font-medium leading-relaxed">{aiResponse}</p>
              </div>
              <button onClick={() => setAiResponse(null)} className="text-indigo-300 hover:text-indigo-500 text-lg leading-none">
                ×
              </button>
            </div>
          </div>
        )}

        {sessions.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-slate-400">Nothing scheduled for today. Enjoy the break!</p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-[30px] top-5 bottom-5 w-0.5 bg-slate-100 z-0" />
            {sessions.map(session => (
              <div key={session.id} className="relative flex gap-3 mb-3">
                <div className="flex-shrink-0 w-14 text-right pt-3.5">
                  <span className="text-xs font-medium text-slate-400">{session.time}</span>
                </div>
                <div className="flex flex-col items-center z-10 mt-3 flex-shrink-0">
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 transition-all duration-300 ${dotColor(session)}`} />
                </div>
                <div className="flex-1 min-w-0 pb-1">
                  <SessionCard session={session} onStart={handleStart} onComplete={handleComplete} onMissed={handleMissed} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="h-4" />
      </div>

      <div className="fixed bottom-16 md:bottom-6 left-0 right-0 z-30 px-4 pb-2">
        <div className="max-w-md md:max-w-2xl lg:max-w-3xl mx-auto">
          {aiLoading && (
            <div className="bg-indigo-50 rounded-2xl px-4 py-2.5 mb-2 fade-in flex items-center gap-2">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 dot-1" />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 dot-2" />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 dot-3" />
              </span>
              <span className="text-xs text-indigo-500 font-medium">Adjusting your plan…</span>
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-lg shadow-slate-200/60 flex items-center gap-2 px-4 py-3">
            <input
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAiSubmit()}
              placeholder="Feeling tired? Adjust today's plan…"
              className="flex-1 text-sm text-slate-700 placeholder:text-slate-300 bg-transparent outline-none"
            />
            <button
              onClick={handleAiSubmit}
              disabled={!aiInput.trim()}
              className="w-8 h-8 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-100 text-white disabled:text-slate-300 flex items-center justify-center transition-colors flex-shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="fixed top-4 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map(t => (
          <div key={t.id} className="bg-slate-800 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg fade-in">
            {t.message}
          </div>
        ))}
      </div>

      {feedbackSessionId && <FeedbackModal onClose={handleFeedbackClose} />}
      {planUpdate && (
        <PlanUpdateModal
          missedSummary={planUpdate.missedSummary}
          impacted={planUpdate.impacted}
          onClose={() => setPlanUpdate(null)}
        />
      )}
      {showPlanHealth && planHealth && <PlanHealthModal health={planHealth} onClose={() => setShowPlanHealth(false)} />}
    </>
  )
}
