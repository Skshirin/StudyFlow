import { useState } from 'react'
import { Subject, TimePreference } from '../types'
import { createSubject, generatePlan } from '../api/endpoints'
import { mapBackendSubject } from '../api/adapters'

interface OnboardingProps {
  onComplete: (subjects: Subject[], dailyMinutes: number, pref: TimePreference) => void
}

interface DraftSubject {
  id: string
  name: string
  examDate: string
  difficulty: number
  confidence: number
  topics: string[]
  topicInput: string
}

const emojis: Record<string, string> = {
  mathematics: '📐',
  math: '📐',
  'computer science': '💻',
  cs: '💻',
  physics: '⚛️',
  chemistry: '🧪',
  biology: '🧬',
  history: '📜',
  english: '📖',
  economics: '📈',
}

const colors = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6']

function guessEmoji(name: string) {
  const lower = name.toLowerCase()
  for (const key of Object.keys(emojis)) {
    if (lower.includes(key)) return emojis[key]
  }
  return '📚'
}

function DotPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i)}
          className={`w-3 h-3 rounded-full transition-all duration-150 ${
            i <= value ? 'bg-indigo-500 scale-110' : 'bg-slate-200 hover:bg-slate-300'
          }`}
        />
      ))}
    </div>
  )
}

function SubjectCard({
  subject,
  onChange,
  onRemove,
}: {
  subject: DraftSubject
  onChange: (s: DraftSubject) => void
  onRemove: () => void
}) {
  const addTopic = () => {
    const trimmed = subject.topicInput.trim()
    if (trimmed && !subject.topics.includes(trimmed)) {
      onChange({ ...subject, topics: [...subject.topics, trimmed], topicInput: '' })
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">{guessEmoji(subject.name)}</span>
        <input
          value={subject.name}
          onChange={e => onChange({ ...subject, name: e.target.value })}
          placeholder="Subject name"
          className="flex-1 text-sm font-semibold text-slate-800 placeholder:text-slate-300 bg-transparent outline-none border-b border-slate-200 focus:border-indigo-400 pb-1 transition-colors"
        />
        <button
          onClick={onRemove}
          className="text-slate-300 hover:text-rose-400 text-lg leading-none transition-colors ml-1"
        >
          ×
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400 w-20 flex-shrink-0">Exam date</label>
          <input
            type="date"
            value={subject.examDate}
            onChange={e => onChange({ ...subject, examDate: e.target.value })}
            className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-indigo-400 transition-colors"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400 w-20 flex-shrink-0">Difficulty</label>
          <DotPicker value={subject.difficulty} onChange={v => onChange({ ...subject, difficulty: v })} />
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400 w-20 flex-shrink-0">Confidence</label>
          <DotPicker value={subject.confidence} onChange={v => onChange({ ...subject, confidence: v })} />
        </div>

        <div>
          <label className="text-xs text-slate-400 block mb-2">Topics</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {subject.topics.map(t => (
              <span
                key={t}
                className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-600 font-medium px-2.5 py-1 rounded-full"
              >
                {t}
                <button
                  type="button"
                  onClick={() => onChange({ ...subject, topics: subject.topics.filter(x => x !== t) })}
                  className="text-indigo-400 hover:text-indigo-700 leading-none"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={subject.topicInput}
              onChange={e => onChange({ ...subject, topicInput: e.target.value })}
              onKeyDown={e => e.key === 'Enter' && addTopic()}
              placeholder="Add a topic…"
              className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-indigo-400 transition-colors placeholder:text-slate-300"
            />
            <button
              type="button"
              onClick={addTopic}
              className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 rounded-lg transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const timePrefOptions: { id: TimePreference; icon: string; label: string; hint: string }[] = [
  { id: 'morning', icon: '☀️', label: 'Morning', hint: '6am – 12pm' },
  { id: 'afternoon', icon: '🌤', label: 'Afternoon', hint: '12pm – 5pm' },
  { id: 'evening', icon: '🌙', label: 'Evening', hint: '5pm – 10pm' },
  { id: 'flexible', icon: '✨', label: 'Flexible', hint: 'Whenever works' },
]

function newDraft(): DraftSubject {
  return { id: crypto.randomUUID(), name: '', examDate: '', difficulty: 3, confidence: 3, topics: [], topicInput: '' }
}

function ProgressDots({ step }: { step: number }) {
  return (
    <div className="flex gap-2 items-center justify-center">
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === step ? 'w-6 h-2.5 bg-indigo-500' : i < step ? 'w-2.5 h-2.5 bg-indigo-200' : 'w-2.5 h-2.5 bg-slate-200'
          }`}
        />
      ))}
    </div>
  )
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadDone, setLoadDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<DraftSubject[]>([
    { id: 's1', name: 'Mathematics', examDate: '2026-09-17', difficulty: 4, confidence: 2, topics: ['Integration', 'Differentiation', 'Probability'], topicInput: '' },
  ])
  const [dailyMinutes, setDailyMinutes] = useState(120)
  const [timePref, setTimePref] = useState<TimePreference>('evening')

  const formatMinutes = (m: number) => {
    const h = Math.floor(m / 60)
    const min = m % 60
    if (h === 0) return `${min} min`
    if (min === 0) return `${h}h`
    return `${h}h ${min}m`
  }

  const nearestExam = subjects
    .filter(s => s.examDate)
    .map(s => ({ name: s.name, date: new Date(s.examDate) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0]

  const daysUntilExam = nearestExam
    ? Math.ceil((nearestExam.date.getTime() - Date.now()) / 86400000)
    : null

  const handleGenerate = async () => {
    setError(null)
    setLoading(true)
    try {
      const validDrafts = subjects.filter(s => s.name.trim())
      const created: Subject[] = []
      for (let i = 0; i < validDrafts.length; i++) {
        const d = validDrafts[i]
        const doc = await createSubject({
          name: d.name.trim(),
          examDate: d.examDate || null,
          difficulty: d.difficulty,
          confidence: d.confidence,
          topics: d.topics,
        })
        created.push(mapBackendSubject(doc, i))
      }
      await generatePlan({ dailyCapacityMinutes: dailyMinutes, timePreference: timePref })

      setLoadDone(true)
      setTimeout(() => onComplete(created, dailyMinutes, timePref), 1200)
    } catch (err: any) {
      setLoading(false)
      setError(err.message || 'Something went wrong building your plan. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6">
        {!loadDone ? (
          <div className="text-center fade-in">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500 flex items-center justify-center text-2xl mx-auto mb-6 shadow-lg shadow-indigo-200">
              📐
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Building your plan…</h2>
            <p className="text-sm text-slate-400 mb-8">Analysing subjects, deadlines & confidence</p>
            <div className="flex gap-2 justify-center">
              <span className="w-2 h-2 rounded-full bg-indigo-400 dot-1" />
              <span className="w-2 h-2 rounded-full bg-indigo-400 dot-2" />
              <span className="w-2 h-2 rounded-full bg-indigo-400 dot-3" />
            </div>
          </div>
        ) : (
          <div className="text-center fade-in">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500 flex items-center justify-center text-2xl mx-auto mb-6 shadow-lg shadow-emerald-200">
              ✨
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">{"Your plan is ready!"}</h2>
            <p className="text-sm text-slate-400">Taking you to today's sessions…</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200/70">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-wider">
            Step {step} of 3
          </span>
          <span className="text-xs text-slate-400 font-medium hidden sm:inline">
            {step === 1 ? '• Add subjects' : step === 2 ? '• Study schedule' : '• Final review'}
          </span>
        </div>
        <ProgressDots step={step} />
      </div>

      {step === 1 && (
        <div className="fade-in">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 mb-1">{"Let's build your study plan"}</h1>
          <p className="text-sm text-slate-400 mb-6">{"Tell us what you're studying and we'll organize the rest."}</p>

          <div className="space-y-4">
            {subjects.map((s, i) => (
              <SubjectCard
                key={s.id}
                subject={s}
                onChange={updated => setSubjects(subjects.map(x => (x.id === s.id ? updated : x)))}
                onRemove={() => setSubjects(subjects.filter(x => x.id !== s.id))}
              />
            ))}
          </div>

          <button
            onClick={() => setSubjects([...subjects, newDraft()])}
            className="w-full mt-4 py-3.5 rounded-2xl border-2 border-dashed border-slate-200 text-sm font-semibold text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-all flex items-center justify-center gap-2 cursor-pointer bg-white/60 hover:bg-white"
          >
            <span className="text-lg leading-none font-bold">+</span>
            <span>Add another subject</span>
          </button>

          <div className="mt-8 pt-6 border-t border-slate-200/80 flex items-center justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={subjects.filter(s => s.name.trim()).length === 0}
              className="w-full sm:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-md shadow-indigo-200 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Continue</span>
              <span>→</span>
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="fade-in">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 mb-1">How much time can you study?</h1>
          <p className="text-sm text-slate-400 mb-8">{"We'll create a plan that fits your real life."}</p>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6 text-center">
            <p className="text-5xl font-extrabold text-indigo-500 mb-1">{formatMinutes(dailyMinutes)}</p>
            <p className="text-sm text-slate-400 mb-6">per day</p>
            <input
              type="range"
              min={30}
              max={360}
              step={15}
              value={dailyMinutes}
              onChange={e => setDailyMinutes(Number(e.target.value))}
              className="w-full cursor-pointer"
              style={{
                background: `linear-gradient(to right, #6366F1 0%, #6366F1 ${((dailyMinutes - 30) / 330) * 100}%, #E2E8F0 ${((dailyMinutes - 30) / 330) * 100}%, #E2E8F0 100%)`,
              }}
            />
            <div className="flex justify-between text-xs text-slate-300 mt-2">
              <span>30 min</span>
              <span>6 hrs</span>
            </div>
          </div>

          <p className="text-sm font-semibold text-slate-600 mb-3">When do you prefer studying?</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {timePrefOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => setTimePref(opt.id)}
                className={`rounded-2xl border-2 p-4 text-left transition-all duration-200 cursor-pointer ${
                  timePref === opt.id
                    ? 'border-indigo-400 bg-indigo-50 shadow-sm shadow-indigo-100'
                    : 'border-slate-100 bg-white hover:border-slate-200'
                }`}
              >
                <span className="text-2xl block mb-2">{opt.icon}</span>
                <p className={`text-sm font-semibold ${timePref === opt.id ? 'text-indigo-700' : 'text-slate-700'}`}>
                  {opt.label}
                </p>
                <p className="text-xs text-slate-400">{opt.hint}</p>
              </button>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200/80 flex items-center justify-between gap-3">
            <button
              onClick={() => setStep(1)}
              className="px-5 py-3 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              ← Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="w-full sm:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-2xl shadow-md shadow-indigo-200 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Continue</span>
              <span>→</span>
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="fade-in">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 mb-1">{"You're all set ✨"}</h1>
          <p className="text-sm text-slate-400 mb-6">{"Here's your study profile. Ready to generate your plan?"}</p>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <div className="bg-indigo-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-extrabold text-indigo-600">{subjects.filter(s => s.name).length}</p>
                <p className="text-xs text-indigo-400 font-medium">Subjects</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-extrabold text-slate-700">{formatMinutes(dailyMinutes)}</p>
                <p className="text-xs text-slate-400 font-medium">Per day</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-base font-bold text-slate-700 truncate">
                  {timePrefOptions.find(t => t.id === timePref)?.icon}{' '}
                  {timePrefOptions.find(t => t.id === timePref)?.label}
                </p>
                <p className="text-xs text-slate-400 font-medium">Preference</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-extrabold text-slate-700">
                  {daysUntilExam !== null ? `${daysUntilExam}d` : '—'}
                </p>
                <p className="text-xs text-slate-400 font-medium">Nearest exam</p>
              </div>
            </div>

            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Subjects</p>
            <div className="flex flex-wrap gap-2">
              {subjects.filter(s => s.name).map(s => (
                <span key={s.id} className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-50 text-slate-600 border border-slate-100 px-3 py-1.5 rounded-full">
                  <span>{guessEmoji(s.name)}</span>
                  {s.name}
                </span>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-rose-500 text-center mb-3">{error}</p>}

          <div className="mt-8 pt-6 border-t border-slate-200/80 flex items-center justify-between gap-3">
            <button
              onClick={() => setStep(2)}
              className="px-5 py-3 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              ← Back
            </button>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="w-full sm:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-2xl shadow-md shadow-indigo-200 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <span>Generate my plan ✨</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
