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
  green: {
    icon: '🟢',
    label: 'On track',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    text: 'text-emerald-700',
    bar: 'bg-indigo-500',
  },
  yellow: {
    icon: '🟡',
    label: 'Getting tight',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    text: 'text-amber-700',
    bar: 'bg-amber-500',
  },
  red: {
    icon: '🔴',
    label: 'At risk',
    bg: 'bg-rose-50',
    border: 'border-rose-100',
    text: 'text-rose-700',
    bar: 'bg-rose-500',
  },
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
      fetchSubjects().then(res => res.map((s: any, i: number) => mapBackendSubject(s, i))),
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

  // Calculate overall syllabus concept totals across all courses
  let allTotalConcepts = 0
  let allMasteredConcepts = 0
  subjects.forEach(s => {
    const total = s.totalConcepts || s.modules.reduce((acc, m) => acc + m.concepts.length, 0)
    const mastered = s.completedConcepts || s.modules.reduce((acc, m) => acc + m.concepts.filter(c => c.status === 'mastered').length, 0)
    allTotalConcepts += total
    allMasteredConcepts += mastered
  })

  if (loading) {
    return <div className="px-4 pt-24 text-center text-sm text-slate-400">Loading Plan Health & Syllabus Progress…</div>
  }

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
    <div className="max-w-2xl mx-auto px-4 pt-4 sm:pt-6 pb-24 fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 mb-1">Plan Health</h1>
          <p className="text-sm text-slate-400">Syllabus feasibility & capacity balance.</p>
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

      {/* Plan Health Banner */}
      <div className={`${cfg.bg} border ${cfg.border} rounded-3xl p-5 mb-5 shadow-xs`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{cfg.icon}</span>
          <span className={`text-xl font-extrabold ${cfg.text}`}>{cfg.label}</span>
        </div>
        <p className={`text-sm leading-relaxed ${cfg.text}`}>{health.message}</p>
      </div>

      {/* Syllabus Concepts Overall Mastery */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 mb-5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
          Syllabus Mastery
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-indigo-50/60 rounded-2xl p-4">
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Mastered</p>
            <p className="text-2xl font-extrabold text-indigo-700">{allMasteredConcepts}</p>
            <p className="text-[11px] text-indigo-500 mt-0.5">core concepts complete</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Remaining</p>
            <p className="text-2xl font-extrabold text-slate-700">{Math.max(0, allTotalConcepts - allMasteredConcepts)}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">concepts left to study</p>
          </div>
        </div>
      </div>

      {/* Capacity Overview */}
      {availableH !== null && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 mb-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
            Time & Capacity Overview
          </p>
          <div className="space-y-4">
            {[
              { label: 'Remaining study required', value: `${requiredH}h`, pct: availableH ? Math.min((requiredH / availableH) * 100, 100) : 0 },
              { label: 'Total available capacity', value: `${availableH}h`, pct: 100 },
              { label: 'Buffer time', value: `${bufferH}h`, pct: availableH ? Math.min(((bufferH || 0) / availableH) * 100, 100) : 0 },
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

      {/* By Syllabus Subject */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 mb-5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
          By Syllabus Course
        </p>
        <div className="space-y-4">
          {subjects.map(s => {
            const days = daysUntil(s.examDate)
            const totalConcepts = s.totalConcepts || s.modules.reduce((acc, m) => acc + m.concepts.length, 0)
            const masteredCount = s.completedConcepts || s.modules.reduce((acc, m) => acc + m.concepts.filter(c => c.status === 'mastered').length, 0)
            const inProgressCount = s.modules.reduce((acc, m) => acc + m.concepts.filter(c => c.status === 'learned' || c.status === 'needs_revision').length, 0)
            const progressScore = masteredCount + (inProgressCount * 0.5)
            const pct = totalConcepts > 0 ? Math.round((progressScore / totalConcepts) * 100) : 0

            return (
              <div key={s.id} className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: s.color + '20' }}>
                  {s.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500 font-mono">{s.code}</span>
                      <span className="text-sm font-bold text-slate-700 truncate">{s.name}</span>
                    </div>
                    <span className="text-xs font-extrabold text-slate-600">{pct}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: s.color }} />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {days !== null ? (days > 0 ? `Exam in ${days} days` : 'Exam today!') : 'No exam set'} · {masteredCount}/{totalConcepts} concepts mastered{inProgressCount > 0 ? ` · ${inProgressCount} in progress` : ''}
                  </p>
                </div>
              </div>
            )
          })}
          {subjects.length === 0 && <p className="text-sm text-slate-400">No syllabus courses enrolled.</p>}
        </div>
      </div>

      {nearestExam && (
        <p className="text-xs text-slate-400 text-center font-medium">
          Nearest exam: {nearestExam.name} in {nearestExam.days} days
        </p>
      )}
    </div>
  )
}
