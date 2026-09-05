import { useEffect, useState } from 'react'
import { Session } from '../types'
import { fetchByDate } from '../api/endpoints'
import { mapBackendTask } from '../api/adapters'
import SessionCard from '../components/SessionCard'

interface Day {
  label: string
  dateLabel: string
  dateStr: string
  sessions: Session[]
  planned: number
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function loadStatus(planned: number, capacity: number): 'on-track' | 'heavy' | 'at-risk' {
  if (capacity <= 0) return 'on-track'
  const ratio = planned / capacity
  if (ratio > 1.1) return 'at-risk'
  if (ratio > 1.0) return 'heavy'
  return 'on-track'
}

const loadConfig = {
  'on-track': { dot: 'bg-emerald-400', label: 'On track', badge: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  heavy: { dot: 'bg-amber-400', label: 'Heavy', badge: 'bg-amber-50 text-amber-600 border-amber-200' },
  'at-risk': { dot: 'bg-rose-400', label: 'At risk', badge: 'bg-rose-50 text-rose-600 border-rose-200' },
}

const fmtMin = (m: number) => {
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min}m`
  if (min === 0) return `${h}h`
  return `${h}h ${min}m`
}

export default function WeeklyPlan({ dailyCapacityMinutes }: { dailyCapacityMinutes: number }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState<Day[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const dateObjs = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() + i)
      return d
    })

    Promise.all(dateObjs.map(d => fetchByDate(toDateStr(d))))
      .then(results => {
        const built: Day[] = results.map((res, i) => {
          const sessions = res.tasks.map(mapBackendTask)
          const planned = sessions.filter((s: Session) => s.type !== 'break').reduce((sum: number, s: Session) => sum + s.duration, 0)
          return {
            label: WEEKDAY_LABELS[dateObjs[i].getDay()],
            dateLabel: dateObjs[i].toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            dateStr: res.date,
            sessions,
            planned,
          }
        })
        setDays(built)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="px-4 pt-24 text-center text-sm text-slate-400">Loading your week…</div>
  if (error) {
    return (
      <div className="px-4 pt-24 text-center">
        <p className="text-sm text-rose-500">{error}</p>
      </div>
    )
  }
  if (days.length === 0) return null

  const day = days[selectedIndex]
  const status = loadStatus(day.planned, dailyCapacityMinutes)
  const cfg = loadConfig[status]

  return (
    <div className="px-4 pt-4 sm:pt-6 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-800 mb-0.5">Your plan</h1>
        <p className="text-sm text-slate-400">Every session, every reason.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-1 -mx-4 px-4">
        {days.map((d, i) => {
          const active = i === selectedIndex
          const dStatus = loadStatus(d.planned, dailyCapacityMinutes)
          const dCfg = loadConfig[dStatus]
          return (
            <button
              key={d.dateStr}
              onClick={() => setSelectedIndex(i)}
              className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 rounded-2xl min-w-[52px] transition-all duration-200 ${
                active ? 'bg-indigo-500 shadow-sm shadow-indigo-200' : 'bg-white border border-slate-100 hover:border-slate-200'
              }`}
            >
              <span className={`text-xs font-bold tracking-wide ${active ? 'text-indigo-100' : 'text-slate-400'}`}>{d.label}</span>
              <span className={`text-xs font-semibold ${active ? 'text-white' : 'text-slate-600'}`}>{d.dateLabel.split(' ')[1]}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${dCfg.dot} ${active ? 'opacity-70' : ''}`} />
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span className={`text-[10px] font-bold tracking-wider uppercase px-2 py-1 rounded-full border ${cfg.badge}`}>{cfg.label}</span>
        <span className="text-xs text-slate-400">·</span>
        <span className="text-xs text-slate-500 font-medium">
          {fmtMin(day.planned)} planned · {fmtMin(dailyCapacityMinutes)} capacity
        </span>
      </div>

      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-6">
        <div
          className={`h-full rounded-full transition-all ${
            status === 'at-risk' ? 'bg-rose-400' : status === 'heavy' ? 'bg-amber-400' : 'bg-indigo-400'
          }`}
          style={{ width: `${Math.min((day.planned / Math.max(dailyCapacityMinutes, 1)) * 100, 100)}%` }}
        />
      </div>

      {day.sessions.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">Nothing scheduled this day.</p>
      ) : (
        <div className="relative">
          <div className="absolute left-[30px] top-5 bottom-5 w-0.5 bg-slate-100 z-0" />
          {day.sessions.map(session => (
            <div key={session.id} className="relative flex gap-3 mb-3">
              <div className="flex-shrink-0 w-14 text-right pt-3.5">
                <span className="text-xs font-medium text-slate-400">{session.time}</span>
              </div>
              <div className="flex flex-col items-center z-10 mt-3 flex-shrink-0">
                <div className={`w-3 h-3 rounded-full ${session.type === 'break' ? 'bg-emerald-300' : 'bg-slate-300'}`} />
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <SessionCard session={session} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
