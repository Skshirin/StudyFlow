import { useState, useEffect } from 'react'
import { Subject, TimePreference, CatalogSubject } from '../types'
import { fetchCatalog, enrollSubjects, generatePlan, fetchSubjects } from '../api/endpoints'
import { mapBackendSubject } from '../api/adapters'

interface OnboardingProps {
  onComplete: (subjects: Subject[], dailyMinutes: number, pref: TimePreference) => void
}

const DEFAULT_PROMPTS = [
  "My exam is next week. I don't want to top, I just want to pass this subject.",
  "Exam is in 14 days, aiming to top the class with thorough concept mastery.",
  "Exam is in 5 days and I haven't started studying.",
  "I'm weak in Module 3 and want to focus on it before the exam."
]

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [catalog, setCatalog] = useState<CatalogSubject[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('')
  const [promptText, setPromptText] = useState<string>(DEFAULT_PROMPTS[0])
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [parsedPlanFeedback, setParsedPlanFeedback] = useState<string | null>(null)

  useEffect(() => {
    fetchCatalog()
      .then(res => {
        setCatalog(res)
        if (res.length > 0) {
          setSelectedSubjectId(res[0]._id)
        }
      })
      .catch(err => {
        setErrorMessage(err.message || 'Could not load syllabus catalog')
      })
      .finally(() => setLoadingCatalog(false))
  }, [])

  const selectedSubject = catalog.find(c => c._id === selectedSubjectId)

  const handleGeneratePlan = async () => {
    if (!selectedSubject) return
    setIsProcessing(true)
    setErrorMessage(null)

    try {
      const lower = promptText.toLowerCase()
      let inferredGoal: 'PASS' | 'TOP' | 'EMERGENCY' | 'SCORE_WELL' = 'SCORE_WELL'
      if (lower.includes('just pass') || lower.includes('want to pass') || lower.includes('pass this') || lower.includes('only pass')) {
        inferredGoal = 'PASS'
      } else if (lower.includes('top') || lower.includes('master') || lower.includes('100%')) {
        inferredGoal = 'TOP'
      } else if (lower.includes('emergency') || lower.includes('haven\'t started')) {
        inferredGoal = 'EMERGENCY'
      }

      let examDays = 14

      if (lower.includes('next week') || lower.includes('1 week') || lower.includes('7 days')) {
        examDays = 7
      } else if (lower.includes('tomorrow') || lower.includes('1 day')) {
        examDays = 1
      } else if (lower.includes('3 days')) {
        examDays = 3
      } else if (lower.includes('5 days')) {
        examDays = 5
      } else if (lower.includes('3 weeks') || lower.includes('21 days')) {
        examDays = 21
      }

      const examDateObj = new Date()
      examDateObj.setDate(examDateObj.getDate() + examDays)
      const examDateStr = examDateObj.toISOString().split('T')[0]

      // 1. Enroll student in course
      await enrollSubjects({
        subjects: [
          {
            subjectId: selectedSubject._id,
            examDate: examDateStr,
            targetGoal: inferredGoal as any,
            confidence: 3,
          },
        ],
      })

      // 2. Generate plan using Gemini AI intelligence layer + deterministic scheduler
      let fullPrompt = promptText
      if (!lower.includes(selectedSubject.name.toLowerCase()) && !lower.includes(selectedSubject.code.toLowerCase())) {
        fullPrompt = `For ${selectedSubject.name}: ${promptText}`
      }

      const planRes = await generatePlan({
        prompt: fullPrompt,
        days: examDays,
        subjectId: selectedSubject._id,
        targetGoal: inferredGoal,
        timePreference: 'flexible'
      })

      const planNotice = planRes.strategyExplanation || planRes.feasibility?.message || 'Study plan generated successfully ✓'
      setParsedPlanFeedback(planNotice)

      const subs = await fetchSubjects()
      const mapped = subs.map((s: any, idx: number) => mapBackendSubject(s, idx))

      setTimeout(() => {
        onComplete(mapped, 135, 'flexible')
      }, 1200)
    } catch (err: any) {
      setIsProcessing(false)
      setErrorMessage(err.message || 'Failed to generate study plan')
    }
  }

  if (loadingCatalog) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-xl animate-pulse mb-4 text-indigo-600">
          ⚡
        </div>
        <p className="text-sm font-semibold text-slate-700">Loading syllabus courses…</p>
      </div>
    )
  }

  return (
    <div className="py-2">
      {/* Progress pill header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Step {step} of 2
        </span>
        <div className="flex items-center gap-1.5">
          <div className={`h-2 rounded-full transition-all duration-300 ${step === 1 ? 'w-8 bg-indigo-600' : 'w-2 bg-indigo-200'}`} />
          <div className={`h-2 rounded-full transition-all duration-300 ${step === 2 ? 'w-8 bg-indigo-600' : 'w-2 bg-slate-200'}`} />
        </div>
      </div>

      {/* STEP 1: Syllabus Catalog Selection */}
      {step === 1 && (
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight mb-2">
            Select Your Course
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            Choose from the verified Mumbai University syllabus catalog.
          </p>

          <div className="space-y-3 mb-6">
            {catalog.map(c => {
              const isSelected = c._id === selectedSubjectId
              return (
                <div
                  key={c._id}
                  onClick={() => setSelectedSubjectId(c._id)}
                  className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-600'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📚</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-mono">
                          {c.code}
                        </span>
                        <span className="text-xs font-semibold text-slate-400">{c.credits} Credits</span>
                      </div>
                      <p className="font-bold text-slate-800 text-sm mt-0.5">{c.name}</p>
                      <p className="text-xs text-slate-400">
                        {c.moduleCount} modules · {c.conceptCount} concepts
                      </p>
                    </div>
                  </div>
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 text-transparent'
                    }`}
                  >
                    ✓
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              onClick={() => setStep(2)}
              disabled={!selectedSubjectId}
              className="w-full sm:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-2xl shadow-md shadow-indigo-200 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>Continue with {catalog.find(c => c._id === selectedSubjectId)?.name || 'Course'}</span>
              <span>→</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Natural-Language Request & Goal */}
      {step === 2 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono">
              {selectedSubject?.code}
            </span>
            <span className="text-xs font-semibold text-slate-500">{selectedSubject?.name}</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight mb-2">
            What is your exam goal?
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            Describe your situation in natural language. Gemini AI will analyze your intent and formulate a strategic syllabus allocation.
          </p>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 mb-6">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
              Natural Language Request
            </label>
            <textarea
              rows={3}
              value={promptText}
              onChange={e => setPromptText(e.target.value)}
              placeholder="e.g. My exam is next week. I don't want to top, I just want to pass this subject."
              className="w-full text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none resize-none"
            />

            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Quick Prompts
              </p>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPromptText(prompt)}
                    className="text-xs text-left py-1.5 px-3 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 transition-colors text-slate-600 cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {errorMessage && (
            <div className="p-4 mb-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
              {errorMessage}
            </div>
          )}

          {parsedPlanFeedback && (
            <div className="p-4 mb-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 fade-in">
              ✨ {parsedPlanFeedback}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100 gap-3">
            <button
              onClick={() => setStep(1)}
              disabled={isProcessing}
              className="px-5 py-3 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              ← Back
            </button>
            <button
              onClick={handleGeneratePlan}
              disabled={isProcessing || !promptText.trim()}
              className="w-full sm:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold rounded-2xl shadow-md shadow-indigo-200 transition-all text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Analyzing Syllabus & Building Plan…</span>
                </>
              ) : (
                <>
                  <span>Generate Plan ✨</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
