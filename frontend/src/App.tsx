import { useEffect, useState } from 'react'
import { Subject, Module, Concept, Screen, TimePreference, AuthUser } from './types'
import { fetchSubjects, createGuestSession } from './api/endpoints'
import { mapBackendSubject } from './api/adapters'
import { getStoredUser, clearAuthSession, setAuthSession } from './api/client'

import Onboarding from './screens/Onboarding'
import Today from './screens/Today'
import WeeklyPlan from './screens/WeeklyPlan'
import Subjects from './screens/Subjects'
import ConceptDetail from './screens/ConceptDetail'
import Progress from './screens/Progress'
import AuthScreen from './screens/AuthScreen'
import BottomNav from './components/BottomNav'
import UserMenu from './components/UserMenu'
import AskAiChat from './components/AskAiChat'

const SETTINGS_KEY = 'studyflow_plan_settings'

function loadPlanSettings(): { dailyMinutes: number; timePreference: TimePreference } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore malformed storage
  }
  return { dailyMinutes: 120, timePreference: 'flexible' }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(getStoredUser())
  const [isGuest, setIsGuest] = useState<boolean>(() => Boolean(getStoredUser()?.isGuest))
  const [checking, setChecking] = useState(true)
  const [onboarded, setOnboarded] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>('today')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [{ dailyMinutes, timePreference }, setPlanSettings] = useState(loadPlanSettings())
  const [activeConceptInfo, setActiveConceptInfo] = useState<{
    subject: Subject
    module: Module
    concept: Concept
  } | null>(null)

  const isAuthenticated = Boolean(currentUser)

  const checkOnboarding = () => {
    setChecking(true)
    setCheckError(null)
    fetchSubjects()
      .then(res => {
        const mapped = res.map((s: any, i: number) => mapBackendSubject(s, i))
        setSubjects(mapped)
        setOnboarded(mapped.length > 0)
      })
      .catch(err => {
        if (err.message && (err.message.includes('401') || err.message.includes('expired') || err.message.includes('Authentication'))) {
          handleLogout()
        } else {
          setCheckError(err.message)
        }
      })
      .finally(() => setChecking(false))
  }

  const refreshSubjects = () => {
    fetchSubjects()
      .then(res => setSubjects(res.map((s: any, i: number) => mapBackendSubject(s, i))))
      .catch(() => {})
  }

  const handleLogout = () => {
    clearAuthSession()
    setCurrentUser(null)
    setIsGuest(false)
    setOnboarded(false)
    setSubjects([])
    setCheckError(null)
    setChecking(false)
  }

  const handleAuthSuccess = (user: AuthUser) => {
    setCurrentUser(user)
    setIsGuest(Boolean(user.isGuest))
    setSubjects([]) // clear immediately to prevent any stale bleed
    setOnboarded(false)
    setChecking(true)
    fetchSubjects()
      .then(res => {
        const mapped = res.map((s: any, i: number) => mapBackendSubject(s, i))
        setSubjects(mapped)
        setOnboarded(mapped.length > 0)
      })
      .catch(err => setCheckError(err.message))
      .finally(() => setChecking(false))
  }

  const handleContinueAsGuest = async () => {
    setChecking(true)
    setCheckError(null)
    try {
      const res = await createGuestSession()
      setAuthSession(res.token, res.user)
      setCurrentUser(res.user)
      setIsGuest(true)
      setSubjects([])
      setOnboarded(false)
      checkOnboarding()
    } catch (err: any) {
      setCheckError(err.message || 'Failed to start guest session')
      setChecking(false)
    }
  }

  // P0.1: Single callback for any progress change (task completion, manual mastery toggle)
  // Refreshes the shared subjects state so Today/Subjects/Progress all reflect the same data
  const handleProgressChanged = () => {
    refreshSubjects()
  }

  useEffect(() => {
    const handleAuthChanged = () => {
      setCurrentUser(getStoredUser())
    }
    window.addEventListener('studyflow:auth-changed', handleAuthChanged)
    return () => window.removeEventListener('studyflow:auth-changed', handleAuthChanged)
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      checkOnboarding()
    } else {
      setChecking(false)
    }
  }, [isAuthenticated])

  // 1. Unauthenticated -> Auth Screen
  if (!isAuthenticated) {
    return (
      <AuthScreen
        onAuthSuccess={handleAuthSuccess}
        onContinueAsGuest={handleContinueAsGuest}
      />
    )
  }

  // 2. Checking state
  if (checking) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center text-xl shadow-lg shadow-indigo-200 animate-pulse text-white mb-4">
          ⚡
        </div>
        <p className="text-sm font-semibold text-slate-700">Loading syllabus…</p>
      </div>
    )
  }

  // 3. Error state
  if (checkError) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4">
        <p className="text-sm text-rose-500 mb-4">{checkError}</p>
        <div className="flex gap-3">
          <button onClick={checkOnboarding} className="px-4 py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 rounded-xl cursor-pointer">
            Retry
          </button>
          <button onClick={handleLogout} className="px-4 py-2 text-sm font-semibold text-rose-600 bg-rose-50 rounded-xl cursor-pointer">
            Log out
          </button>
        </div>
      </div>
    )
  }

  // 4. Onboarding state: Syllabus Catalog Selection + Natural Language Goal
  if (!onboarded) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/70 shadow-xs">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center text-sm font-bold shadow-md shadow-indigo-200">
                ⚡
              </div>
              <span className="font-extrabold text-slate-800 text-lg tracking-tight">StudyFlow V2</span>
            </div>
            <div className="flex items-center gap-2">
              <UserMenu
                user={currentUser}
                subjectCount={0}
                onLogout={handleLogout}
              />
            </div>
          </div>
        </header>

        <main className="max-w-xl lg:max-w-2xl mx-auto px-4 sm:px-6 py-6">
          <Onboarding
            onComplete={(subs: Subject[], mins: number, pref: TimePreference) => {
              setSubjects(subs)
              const settings = { dailyMinutes: mins, timePreference: pref }
              setPlanSettings(settings)
              localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
              setOnboarded(true)
              setScreen('today')
            }}
          />
        </main>
      </div>
    )
  }

  // Derive active concept context for AskAiChat
  const aiChatContext = activeConceptInfo
    ? {
        conceptName: activeConceptInfo.concept.name,
        moduleName: activeConceptInfo.module.name,
        subjectName: activeConceptInfo.subject.name,
      }
    : { conceptName: null, moduleName: null, subjectName: null }

  // 5. Main authenticated dashboard
  return (
    <div className="min-h-screen bg-slate-50 pb-24 md:pb-12">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/70 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between">
          <button
            onClick={() => setScreen('today')}
            className="flex items-center gap-2.5 hover:opacity-85 transition-opacity cursor-pointer focus:outline-none"
          >
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center text-sm font-bold shadow-md shadow-indigo-200">
              ⚡
            </div>
            <span className="font-extrabold text-slate-800 text-lg tracking-tight">StudyFlow V2</span>
          </button>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/90 p-1 rounded-2xl border border-slate-200/50">
            {[
              { id: 'today', icon: '🏠', label: 'Today' },
              { id: 'plan', icon: '📅', label: 'Plan' },
              { id: 'subjects', icon: '📚', label: 'Subjects' },
              { id: 'progress', icon: '📊', label: 'Progress' },
            ].map(item => {
              const active = screen === item.id || (item.id === 'subjects' && screen === 'concept-detail')
              return (
                <button
                  key={item.id}
                  onClick={() => setScreen(item.id as Screen)}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                  }`}
                >
                  <span className="text-sm">{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>

          <div className="flex items-center gap-2">
            <UserMenu
              user={currentUser}
              subjectCount={subjects.length}
              onLogout={handleLogout}
            />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
        {screen === 'today' && <Today user={currentUser} onProgressChanged={handleProgressChanged} />}
        {screen === 'plan' && <WeeklyPlan dailyCapacityMinutes={dailyMinutes} />}
        {screen === 'subjects' && (
          <Subjects
            subjects={subjects}
            onSubjectsChanged={refreshSubjects}
            onSelectConcept={(sub, mod, con) => {
              setActiveConceptInfo({ subject: sub, module: mod, concept: con })
              setScreen('concept-detail')
            }}
          />
        )}
        {screen === 'concept-detail' && activeConceptInfo && (
          <ConceptDetail
            subject={activeConceptInfo.subject}
            module={activeConceptInfo.module}
            concept={activeConceptInfo.concept}
            onBack={() => setScreen('subjects')}
            onStatusChanged={(conceptId, newStatus) => {
              handleProgressChanged()
              setActiveConceptInfo(prev =>
                prev ? { ...prev, concept: { ...prev.concept, status: newStatus } } : null
              )
            }}
          />
        )}
        {screen === 'progress' && <Progress subjects={subjects} />}
      </main>
      <BottomNav screen={screen} setScreen={setScreen} />

      {/* P1.2: Global Ask AI floating chat */}
      <AskAiChat
        conceptName={aiChatContext.conceptName}
        moduleName={aiChatContext.moduleName}
        subjectName={aiChatContext.subjectName}
      />
    </div>
  )
}
