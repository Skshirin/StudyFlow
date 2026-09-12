import { useState } from 'react'
import { Subject, Module, Concept, ConceptStatus } from '../types'
import { updateConceptProgress } from '../api/endpoints'

interface ConceptDetailProps {
  subject: Subject
  module: Module
  concept: Concept
  onBack: () => void
  onStatusChanged: (conceptId: string, newStatus: ConceptStatus) => void
}

const importanceConfig: Record<number, { label: string; bg: string; text: string }> = {
  3: { label: 'HIGH IMPORTANCE', bg: 'bg-amber-100', text: 'text-amber-800' },
  2: { label: 'MEDIUM IMPORTANCE', bg: 'bg-blue-100', text: 'text-blue-800' },
  1: { label: 'STANDARD IMPORTANCE', bg: 'bg-slate-100', text: 'text-slate-600' },
}

const examRelevanceConfig: Record<number, { label: string; bg: string; text: string }> = {
  3: { label: 'HIGH EXAM RELEVANCE', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  2: { label: 'MEDIUM EXAM RELEVANCE', bg: 'bg-teal-100', text: 'text-teal-800' },
  1: { label: 'STANDARD EXAM RELEVANCE', bg: 'bg-slate-100', text: 'text-slate-600' },
}

export default function ConceptDetail({
  subject,
  module,
  concept,
  onBack,
  onStatusChanged,
}: ConceptDetailProps) {
  const [currentStatus, setCurrentStatus] = useState<ConceptStatus>(concept.status)
  const [updating, setUpdating] = useState(false)

  const isMastered = currentStatus === 'mastered'

  const toggleMastery = async () => {
    const nextStatus: ConceptStatus = isMastered ? 'not_started' : 'mastered'
    setUpdating(true)
    try {
      await updateConceptProgress(concept.id, nextStatus)
      setCurrentStatus(nextStatus)
      onStatusChanged(concept.id, nextStatus)
    } catch (err: any) {
      console.error('Failed to update concept status:', err)
    } finally {
      setUpdating(false)
    }
  }

  const impCfg = importanceConfig[concept.importance] || importanceConfig[2]
  const examCfg = examRelevanceConfig[concept.examRelevance] || examRelevanceConfig[2]

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-24 fade-in">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition-colors mb-6 cursor-pointer"
      >
        <span>←</span>
        <span>Back to {subject.name}</span>
      </button>

      {/* Header Info */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-mono">
            {subject.code || 'SYLLABUS'}
          </span>
          <span className="text-xs text-slate-400 font-medium">·</span>
          <span className="text-xs font-semibold text-slate-500">{module.name}</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 leading-tight mb-4">
          {concept.name}
        </h1>

        <div className="flex flex-wrap gap-2 mb-6">
          <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${impCfg.bg} ${impCfg.text}`}>
            {impCfg.label}
          </span>
          <span className={`text-[11px] font-bold px-3 py-1 rounded-full ${examCfg.bg} ${examCfg.text}`}>
            {examCfg.label}
          </span>
          <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-violet-100 text-violet-800">
            {concept.estimatedStudyMinutes} MIN STUDY TIME
          </span>
          <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-600">
            DIFFICULTY: {concept.difficulty}/5
          </span>
        </div>

        {/* Action Button: Mark Mastered */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                isMastered ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Status: {isMastered ? 'Mastered' : currentStatus.replace('_', ' ')}
            </span>
          </div>

          <button
            onClick={toggleMastery}
            disabled={updating}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50 ${
              isMastered
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                : 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-emerald-200'
            }`}
          >
            {updating ? 'Updating…' : isMastered ? 'Mark Not Started' : '✓ Mark as Mastered'}
          </button>
        </div>
      </div>

      {/* Syllabus Description */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 mb-6">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
          Syllabus Specification
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          {concept.description || 'This concept is part of the accredited Mumbai University syllabus module.'}
        </p>
      </div>

      {/* Study Resources */}
      {concept.resources && concept.resources.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 mb-6">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
            Recommended Resources & References
          </h2>
          <ul className="space-y-2">
            {concept.resources.map((res: any, idx: number) => {
              const title = typeof res === 'string' ? res : res.title || JSON.stringify(res)
              const url = typeof res === 'object' && res.url ? res.url : null
              return (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700"
                >
                  <span className="text-base">📖</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800">{title}</p>
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600 hover:underline mt-0.5 inline-block"
                      >
                        {url}
                      </a>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
