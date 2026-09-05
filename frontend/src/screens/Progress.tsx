import { useEffect, useState } from 'react'
import { Subject } from '../types'
import { fetchPlanHealth, fetchSubjects } from '../api/endpoints'
import { mapBackendSubject } from '../api/adapters'

interface ProgressProps {
  subjects: Subject[]
}

interface PlanHealth {
  status: 'green' | 'yellow' | 'red'
  message: string
  requiredMinutes: number
  availableMinutes: number | null
  earliestExamDays: number | null
}

function daysUntil(date: string | null) {
  if (!date) return null
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000)
}

const STATUS_CONFIG = {
  green: { icon: '🟢', label: 'On track', bg: 'bg-emerald-50', border: 'border-emerald-100', text: 'text-emerald-700', bar: 'bg-indigo-400' },
  yellow: { icon: '🟡', label: 'Getting tight', bg: 'bg-amber-50', border: 'border-amber-100', text: 'text-amber-700', bar: 'bg-amber-400' },
  red: { icon: '🔴', label: 'At risk', bg: 'bg-rose-50', border: 'border-rose-100', text: 'text-rose-700', bar: 'bg-rose-400' },
}

export default function Progress({ subjects: initialSubjects }: ProgressProps) {
  const [subjects, setSubjects] = useState<Subject[]>(initialSubjects)
  const [health, setHealth] = useState<PlanHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = () => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetchPlanHealth(),
      fetchSubjects().then(res => res.map((s: any, i: number) => mapBackendSubject(s, i)))
    ])
      .then(([healthRes, subjectsRes]) => {
        setHealth(healthRes)
        setSubjects(subjectsRes)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  }, [])

  const nearestExam = subjects
    .filter(s => s.examDate)
    .map(s => ({ name: s.name, days: daysUntil(s.examDate) }))
    .filter((s): s is { name: string; days: number } => s.days !== null && s.days > 0)
    .sort((a, b) => a.days - b.days)[0]

  if (loading) return <div className="px-4 pt-24 text-center text-sm text-slate-400">Loading Plan Health…</div>
  if (error || !health) {
    return (
      <div className="px-4 pt-24 text-center">
        <p className="text-sm text-rose-500">{error || 'Could not load Plan Health.'}</p>
      </div>
    )
  }

  const cfg = STATUS_CONFIG[health.status]
  const requiredH = Math.round((health.requiredMinutes / 60) * 10) / 10
  const availableH = health.availableMinutes !== null ? Math.round((health.availableMinutes / 60) * 10) / 10 : null
  const bufferH = availableH !== null ? Math.max(0, Math.round((availableH - requiredH) * 10) / 10) : null

  return (
    <div className="px-4 pt-4 sm:pt-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 mb-1">Plan Health</h1>
          <p className="text-sm text-slate-400">How your plan is holding up.</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200/80 text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:border-slate-300 shadow-xs transition-all cursor-pointer disabled:opacity-50"
        >
          <span className={`text-sm ${loading ? 'animate-spin' : ''}`}>🔄</span>
          <span>Refresh</span>
        </button>
      </div>

      <div className={`${cfg.bg} border ${cfg.border} rounded-2xl p-5 mb-5`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{cfg.icon}</span>
          <span className={`text-xl font-extrabold ${cfg.text}`}>{cfg.label}</span>
        </div>
        <p className={`text-sm leading-relaxed ${cfg.text}`}>{health.message}</p>
      </div>

      {availableH !== null && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Capacity overview</p>
          <div className="space-y-4">
            {[
              { label: 'Remaining study', value: `${requiredH}h`, pct: availableH ? Math.min((requiredH / availableH) * 100, 100) : 0 },
              { label: 'Available capacity', value: `${availableH}h`, pct: 100 },
              { label: 'Buffer', value: `${bufferH}h`, pct: availableH ? Math.min(((bufferH || 0) / availableH) * 100, 100) : 0 },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-slate-600 font-medium">{item.label}</span>
                  <span className="font-bold text-slate-800">{item.value}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${cfg.bar}`} style={{ width: `${item.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">By subject</p>
        <div className="space-y-4">
          {subjects.map(s => {
            const days = daysUntil(s.examDate)
            const masteredCount = s.topics.filter(t => t.status === 'mastered').length
            const inProgressCount = s.topics.filter(t => t.status === 'learned' || t.status === 'needs-revision').length
            const progressScore = masteredCount + (inProgressCount * 0.5)
            const pct = s.topics.length > 0 ? Math.round((progressScore / s.topics.length) * 100) : 0
            return (
              <div key={s.id} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0" style={{ background: s.color + '20' }}>
                  {s.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-sm font-semibold text-slate-700">{s.name}</span>
                    <span className="text-xs font-bold text-slate-500">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: s.color }} />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {days !== null ? `Exam in ${days} days` : 'No exam'} · {masteredCount}/{s.topics.length} mastered{inProgressCount > 0 ? ` · ${inProgressCount} in progress` : ''}
                  </p>
                </div>
              </div>
            )
          })}
          {subjects.length === 0 && <p className="text-sm text-slate-400">No subjects yet.</p>}
        </div>
      </div>

      {nearestExam && (
        <p className="text-xs text-slate-400 text-center">
          Nearest exam: {nearestExam.name} in {nearestExam.days} days
        </p>
      )}
    </div>
  )
}
