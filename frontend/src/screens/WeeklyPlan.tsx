import { useEffect, useState } from 'react'
import { Session } from '../types'
import { fetchCurrentPlan } from '../api/endpoints'
import { mapBackendTask } from '../api/adapters'
import SessionCard from '../components/SessionCard'

interface Day {
  dayNumber: number
  weekNumber: number
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

const fmtMin = (m: number) => {
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min}m`
  if (min === 0) return `${h}h`
  return `${h}h ${min}m`
}

export default function WeeklyPlan({ dailyCapacityMinutes = 135 }: { dailyCapacityMinutes?: number }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState<Day[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [activeWeek, setActiveWeek] = useState<number>(1)

  useEffect(() => {
    setLoading(true)
    setError(null)

    fetchCurrentPlan()
      .then(res => {
        const rawTasks: any[] = res?.tasks || []
        const startDateStr = res?.startDate || toDateStr(new Date())
        const endDateStr = res?.endDate || toDateStr(new Date(Date.now() + 13 * 86400000))

        const start = new Date(`${startDateStr}T00:00:00`)
        const end = new Date(`${endDateStr}T00:00:00`)
        const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)

        // Group tasks by date
        const tasksByDate: Record<string, Session[]> = {}
        rawTasks.forEach((t: any) => {
          const s = mapBackendTask(t)
          if (!tasksByDate[t.date]) tasksByDate[t.date] = []
          tasksByDate[t.date].push(s)
        })

        const builtDays: Day[] = []
        for (let i = 0; i < totalDays; i++) {
          const d = new Date(start)
          d.setDate(d.getDate() + i)
          const dateString = toDateStr(d)
          const rawDaySessions = tasksByDate[dateString] || []
          const dayStudySessions = rawDaySessions.filter((s: Session) => s.type !== 'break')
          const planned = dayStudySessions.reduce((sum: number, s: Session) => sum + s.duration, 0)

          const interleavedSessions: Session[] = []
          if (dayStudySessions.length >= 1) {
            dayStudySessions.forEach((s, idx) => {
              interleavedSessions.push(s)
              if (idx < dayStudySessions.length - 1) {
                const existingBreak = rawDaySessions.filter((b: Session) => b.type === 'break')[idx]
                interleavedSessions.push(
                  existingBreak || {
                    id: `break-${dateString}-${idx}`,
                    time: '',
                    subjectId: null,
                    subjectName: 'Break',
                    subjectEmoji: '☕',
                    subjectColor: '#94A3B8',
                    topic: '',
                    conceptId: null,
                    importance: null,
                    examRelevance: null,
                    difficulty: null,
                    type: 'break',
                    duration: 10,
                    whyToday: 'Rest, hydrate, and prepare for next session',
                    status: 'upcoming',
                  }
                )
              }
            })
          }

          builtDays.push({
            dayNumber: i + 1,
            weekNumber: Math.floor(i / 7) + 1,
            label: WEEKDAY_LABELS[d.getDay()],
            dateLabel: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            dateStr: dateString,
            sessions: interleavedSessions,
            planned,
          })
        }

        setDays(builtDays)
        setSelectedIndex(0)
        setActiveWeek(1)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="px-4 pt-24 text-center text-sm text-slate-400">Loading your plan…</div>
  if (error) {
    return (
      <div className="px-4 pt-24 text-center">
        <p className="text-sm text-rose-500">{error}</p>
      </div>
    )
  }
  if (days.length === 0) {
    return (
      <div className="px-4 pt-24 text-center">
        <p className="text-sm text-slate-400">No active plan found. Please generate a study plan in Today.</p>
      </div>
    )
  }

  const totalWeeks = Math.max(1, Math.ceil(days.length / 7))
  const weekDays = days.filter(d => d.weekNumber === activeWeek)
  const day = days[selectedIndex] || days[0]

  return (
    <div className="px-4 pt-4 sm:pt-6 pb-24">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-slate-800 mb-0.5">Study Schedule</h1>
        <p className="text-sm text-slate-400">
          Full {days.length}-day date range ({days[0]?.dateLabel} – {days[days.length - 1]?.dateLabel})
        </p>
      </div>

      {/* Week Selector Tabs */}
      {totalWeeks > 1 && (
        <div className="flex gap-2 mb-4 bg-slate-100 p-1 rounded-2xl w-fit">
          {Array.from({ length: totalWeeks }, (_, w) => w + 1).map(weekNum => (
            <button
              key={weekNum}
              onClick={() => {
                setActiveWeek(weekNum)
                const firstDayOfW = days.findIndex(d => d.weekNumber === weekNum)
                if (firstDayOfW !== -1) setSelectedIndex(firstDayOfW)
              }}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeWeek === weekNum
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Week {weekNum} (Days {(weekNum - 1) * 7 + 1}–{Math.min(weekNum * 7, days.length)})
            </button>
          ))}
        </div>
      )}

      {/* Day Selector Buttons for Active Week */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4">
        {weekDays.map(d => {
          const globalIdx = days.findIndex(x => x.dateStr === d.dateStr)
          const active = globalIdx === selectedIndex
          return (
            <button
              key={d.dateStr}
              onClick={() => setSelectedIndex(globalIdx)}
              className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2.5 rounded-2xl min-w-[56px] transition-all duration-200 cursor-pointer ${
                active ? 'bg-indigo-600 shadow-md shadow-indigo-200' : 'bg-white border border-slate-200 hover:border-slate-300'
              }`}
            >
              <span className={`text-[10px] font-bold uppercase tracking-wider ${active ? 'text-indigo-200' : 'text-slate-400'}`}>
                {d.label}
              </span>
              <span className={`text-xs font-bold ${active ? 'text-white' : 'text-slate-700'}`}>
                {d.dateLabel.split(' ')[1]}
              </span>
              <span className={`text-[10px] font-medium ${active ? 'text-indigo-100' : 'text-slate-400'}`}>
                D{d.dayNumber}
              </span>
            </button>
          )
        })}
      </div>

      {/* Active Day Overview Card */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 mb-5 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800">
            Day {day.dayNumber} · {day.label}, {day.dateLabel}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {day.sessions.filter(s => s.type !== 'break').length} study sessions planned · {fmtMin(day.planned)} total
          </p>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700">
          Week {day.weekNumber}
        </span>
      </div>

      {/* Session List */}
      {day.sessions.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-400">No sessions scheduled for this day.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {day.sessions.map((session, idx) => (
            <div key={session.id || idx} className="relative flex items-start gap-3">
              <div className="flex-shrink-0 w-8 text-center pt-3">
                <span className="text-xs font-extrabold text-slate-400">#{idx + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <SessionCard session={session} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

