import { useState, useEffect } from 'react'
import { Subject, Module, Concept, CatalogSubject } from '../types'
import { fetchCatalog, enrollSubjects } from '../api/endpoints'

interface SubjectsProps {
  subjects: Subject[]
  onSubjectsChanged: () => void
  onSelectConcept: (subject: Subject, module: Module, concept: Concept) => void
}

const importanceBadge: Record<number, { label: string; bg: string; text: string }> = {
  3: { label: 'HIGH IMP', bg: 'bg-amber-100', text: 'text-amber-800' },
  2: { label: 'MED IMP', bg: 'bg-blue-100', text: 'text-blue-800' },
  1: { label: 'LOW IMP', bg: 'bg-slate-100', text: 'text-slate-600' },
}

const examBadge: Record<number, { label: string; bg: string; text: string }> = {
  3: { label: 'HIGH EXAM', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  2: { label: 'MED EXAM', bg: 'bg-teal-100', text: 'text-teal-800' },
  1: { label: 'LOW EXAM', bg: 'bg-slate-100', text: 'text-slate-600' },
}

function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const r = 22
  const c = 2 * Math.PI * r
  const dash = (pct / 100) * c
  return (
    <svg width="58" height="58" className="-rotate-90">
      <circle cx="29" cy="29" r={r} fill="none" stroke="#F1F5F9" strokeWidth="5" />
      <circle
        cx="29"
        cy="29"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="5"
        strokeDasharray={`${dash} ${c}`}
        strokeLinecap="round"
      />
      <text
        x="29"
        y="29"
        textAnchor="middle"
        dominantBaseline="central"
        className="rotate-90 font-bold text-slate-700"
        style={{ fontSize: 11, transform: 'rotate(90deg)', transformOrigin: '29px 29px' }}
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

function SubjectDetail({
  subject,
  onBack,
  onSelectConcept,
}: {
  subject: Subject
  onBack: () => void
  onSelectConcept: (subject: Subject, module: Module, concept: Concept) => void
}) {
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    // Expand the first module by default
    if (subject.modules.length > 0) {
      init[subject.modules[0].id] = true
    }
    return init
  })

  const toggleModule = (id: string) => {
    setExpandedModules(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const days = daysUntil(subject.examDate)
  const totalConcepts = subject.totalConcepts || subject.modules.reduce((acc, m) => acc + m.concepts.length, 0)
  const completedConcepts = subject.completedConcepts || subject.modules.reduce((acc, m) => acc + m.concepts.filter(c => c.status === 'mastered').length, 0)
  const pct = totalConcepts > 0 ? Math.round((completedConcepts / totalConcepts) * 100) : 0

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-24 fade-in">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors mb-6 cursor-pointer"
      >
        <span>←</span>
        <span>All Subjects</span>
      </button>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 shadow-sm"
          style={{ background: subject.color + '20' }}
        >
          {subject.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono">
              {subject.code || 'SYLLABUS'}
            </span>
            {subject.targetGoal && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                GOAL: {subject.targetGoal.replace('_', ' ')}
              </span>
            )}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 leading-tight">
            {subject.name}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {days !== null ? (days > 0 ? `Exam in ${days} days` : 'Exam today!') : 'No exam date set'}
            {subject.credits ? ` · ${subject.credits} Credits` : ''}
          </p>
        </div>
      </div>

      {/* Overview Card */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Syllabus Completion
            </p>
            <p className="text-lg font-extrabold text-slate-800">
              {completedConcepts} of {totalConcepts} concepts mastered
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {subject.modules.length} modules structured according to Mumbai University syllabus
            </p>
          </div>
          <ProgressRing pct={pct} color={subject.color} />
        </div>
      </div>

      {/* Modules & Concepts Hierarchy */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-extrabold text-slate-800">Syllabus Modules</h2>
        <span className="text-xs font-semibold text-slate-400">
          Tap concept to view details
        </span>
      </div>

      <div className="space-y-4">
        {subject.modules.map(mod => {
          const isExpanded = Boolean(expandedModules[mod.id])
          const modMastered = mod.concepts.filter(c => c.status === 'mastered').length

          return (
            <div
              key={mod.id}
              className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden transition-all"
            >
              {/* Module Header Bar */}
              <button
                onClick={() => toggleModule(mod.id)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                      Module {mod.order}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      {modMastered}/{mod.concepts.length} mastered
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 leading-snug">
                    {mod.name}
                  </h3>
                </div>
                <span
                  className={`text-slate-400 font-bold transition-transform duration-200 text-lg ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                >
                  ›
                </span>
              </button>

              {/* Concepts List */}
              {isExpanded && (
                <div className="border-t border-slate-100 divide-y divide-slate-100/70 bg-slate-50/40">
                  {mod.concepts.map(concept => {
                    const isM = concept.status === 'mastered'
                    const imp = importanceBadge[concept.importance] || importanceBadge[2]
                    const ex = examBadge[concept.examRelevance] || examBadge[2]

                    return (
                      <div
                        key={concept.id}
                        onClick={() => onSelectConcept(subject, mod, concept)}
                        className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-white transition-colors cursor-pointer"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p
                              className={`text-xs font-semibold ${
                                isM ? 'text-slate-400 line-through' : 'text-slate-800'
                              }`}
                            >
                              {concept.name}
                            </p>
                            {isM && (
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                ✓ Mastered
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${imp.bg} ${imp.text}`}>
                              {imp.label}
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${ex.bg} ${ex.text}`}>
                              {ex.label}
                            </span>
                            <span className="text-[9px] text-slate-400 font-medium">
                              · {concept.estimatedStudyMinutes}m
                            </span>
                          </div>
                        </div>

                        <span className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors">
                          ›
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {subject.modules.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-sm text-slate-400">
            No modules found for this syllabus course.
          </div>
        )}
      </div>
    </div>
  )
}

export default function Subjects({
  subjects,
  onSubjectsChanged,
  onSelectConcept,
}: SubjectsProps) {
  const [detailId, setDetailId] = useState<string | null>(null)
  const [catalog, setCatalog] = useState<CatalogSubject[]>([])
  const [showCatalogModal, setShowCatalogModal] = useState(false)
  const [enrolling, setEnrolling] = useState(false)

  useEffect(() => {
    fetchCatalog()
      .then(res => setCatalog(res))
      .catch(err => console.error('Failed to load catalog:', err))
  }, [])

  const detail = subjects.find(s => s.id === detailId)

  if (detail) {
    return (
      <SubjectDetail
        subject={detail}
        onBack={() => setDetailId(null)}
        onSelectConcept={onSelectConcept}
      />
    )
  }

  // Find catalog subjects not yet enrolled
  const enrolledCodes = new Set(subjects.map(s => s.code?.toUpperCase()))
  const availableCatalog = catalog.filter(c => !enrolledCodes.has(c.code.toUpperCase()))

  const handleEnroll = async (catSubject: CatalogSubject) => {
    setEnrolling(true)
    try {
      await enrollSubjects({
        subjects: [
          {
            subjectId: catSubject._id,
            targetGoal: 'SCORE_WELL',
            confidence: 3,
          },
        ],
      })
      setShowCatalogModal(false)
      onSubjectsChanged()
    } catch (err: any) {
      console.error('Enroll failed:', err)
    } finally {
      setEnrolling(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-24 fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 mb-1">
            Syllabus Courses
          </h1>
          <p className="text-sm text-slate-400">
            Official curriculum modules and concept hierarchy.
          </p>
        </div>

        {availableCatalog.length > 0 && (
          <button
            onClick={() => setShowCatalogModal(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm shadow-indigo-100 cursor-pointer transition-all active:scale-95"
          >
            + Add Course
          </button>
        )}
      </div>

      <div className="space-y-4">
        {subjects.map(subject => {
          const days = daysUntil(subject.examDate)
          const totalConcepts = subject.totalConcepts || subject.modules.reduce((acc, m) => acc + m.concepts.length, 0)
          const completedConcepts = subject.completedConcepts || subject.modules.reduce((acc, m) => acc + m.concepts.filter(c => c.status === 'mastered').length, 0)
          const pct = totalConcepts > 0 ? Math.round((completedConcepts / totalConcepts) * 100) : 0

          return (
            <div
              key={subject.id}
              onClick={() => setDetailId(subject.id)}
              className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
                    style={{ background: subject.color + '20' }}
                  >
                    {subject.emoji}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono">
                        {subject.code || 'COURSE'}
                      </span>
                      {subject.targetGoal && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                          {subject.targetGoal.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    <h2 className="text-base font-extrabold text-slate-800 group-hover:text-indigo-600 transition-colors leading-snug">
                      {subject.name}
                    </h2>
                  </div>
                </div>

                <ProgressRing pct={pct} color={subject.color} />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-400">
                <span>
                  {subject.modules.length} Modules · {completedConcepts}/{totalConcepts} Concepts
                </span>
                <span className="font-semibold text-slate-500">
                  {days !== null ? (days > 0 ? `Exam in ${days}d` : 'Exam today!') : 'No exam set'} →
                </span>
              </div>
            </div>
          )
        })}

        {subjects.length === 0 && (
          <div className="bg-white rounded-3xl border border-slate-100 p-8 text-center">
            <span className="text-4xl block mb-3">📚</span>
            <p className="text-base font-bold text-slate-700 mb-1">No enrolled courses</p>
            <p className="text-xs text-slate-400 mb-5">
              Select one of the Mumbai University syllabus courses to get started.
            </p>
            {availableCatalog.length > 0 && (
              <button
                onClick={() => setShowCatalogModal(true)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm cursor-pointer"
              >
                Enroll from Catalog
              </button>
            )}
          </div>
        )}
      </div>

      {/* Catalog Enrollment Modal */}
      {showCatalogModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={() => setShowCatalogModal(false)}
        >
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md px-6 pt-6 pb-8 shadow-2xl fade-in"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-slate-800 mb-1">Select Syllabus Course</h3>
            <p className="text-xs text-slate-400 mb-5">
              Choose from the official curriculum courses.
            </p>

            <div className="space-y-3 mb-6">
              {availableCatalog.map(cat => (
                <div
                  key={cat._id}
                  className="p-4 rounded-2xl border border-slate-200 hover:border-indigo-400 flex items-center justify-between gap-3 transition-colors"
                >
                  <div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono">
                      {cat.code}
                    </span>
                    <p className="text-sm font-bold text-slate-800 mt-1">{cat.name}</p>
                    <p className="text-xs text-slate-400">
                      {cat.moduleCount} modules · {cat.conceptCount} concepts · {cat.credits} credits
                    </p>
                  </div>
                  <button
                    disabled={enrolling}
                    onClick={() => handleEnroll(cat)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                  >
                    Enroll
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowCatalogModal(false)}
              className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-800 font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
