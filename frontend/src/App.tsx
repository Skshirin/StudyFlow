import { useEffect, useState } from 'react'
import { Subject, Screen, TimePreference, AuthUser } from './types'
import { fetchSubjects } from './api/endpoints'
import { mapBackendSubject } from './api/adapters'
import { getStoredUser, getAuthToken, clearAuthSession } from './api/client'

import Onboarding from './screens/Onboarding'
import Today from './screens/Today'
import WeeklyPlan from './screens/WeeklyPlan'
import Subjects from './screens/Subjects'
import Progress from './screens/Progress'
import AuthScreen from './screens/AuthScreen'
import BottomNav from './components/BottomNav'
import UserMenu from './components/UserMenu'

const SETTINGS_KEY = 'studyflow_plan_settings'
const GUEST_KEY = 'studyflow_guest_mode'

function loadPlanSettings(): { dailyMinutes: number; timePreference: TimePreference } {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore malformed storage, fall through to defaults
  }
  return { dailyMinutes: 120, timePreference: 'flexible' }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(getStoredUser())
  const [isGuest, setIsGuest] = useState<boolean>(() => localStorage.getItem(GUEST_KEY) === 'true')
  const [checking, setChecking] = useState(true)
  const [onboarded, setOnboarded] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [screen, setScreen] = useState<Screen>('today')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [{ dailyMinutes, timePreference }, setPlanSettings] = useState(loadPlanSettings())

  const isAuthenticated = Boolean(currentUser || isGuest)

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
        // If 401 or auth error, let auth screen take over
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
    localStorage.removeItem(GUEST_KEY)
    setCurrentUser(null)
    setIsGuest(false)
    setOnboarded(false)
    setSubjects([])
    setChecking(false)
  }

  const handleAuthSuccess = (user: AuthUser) => {
    setCurrentUser(user)
    setIsGuest(false)
    localStorage.removeItem(GUEST_KEY)
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

  const handleContinueAsGuest = () => {
    setIsGuest(true)
    localStorage.setItem(GUEST_KEY, 'true')
    checkOnboarding()
  }

  useEffect(() => {
    const handleAuthChanged = () => {
      setCurrentUser(getStoredUser())
      if (!getAuthToken() && !localStorage.getItem(GUEST_KEY)) {
        setIsGuest(false)
        setOnboarded(false)
      }
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
  }, [currentUser?.userId, isGuest])

  // 1. Not logged in and not guest
  if (!isAuthenticated) {
    return (
      <AuthScreen
        onAuthSuccess={handleAuthSuccess}
        onContinueAsGuest={handleContinueAsGuest}
      />
    )
  }

  // 2. Loading state while checking user's subjects
  if (checking) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-lg font-bold shadow-lg shadow-indigo-200 animate-pulse">
            ⚡
          </div>
          <p className="text-sm font-medium text-slate-400">Loading your StudyFlow…</p>
        </div>
      </div>
    )
  }

  // 3. Error state
  if (checkError) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-rose-500 mb-3">{checkError}</p>
        <p className="text-xs text-slate-400 mb-4">
          Make sure the backend is running and VITE_API_BASE_URL points to it.
        </p>
        <div className="flex gap-3">
          <button onClick={checkOnboarding} className="px-4 py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 rounded-xl">
            Retry
          </button>
          <button onClick={handleLogout} className="px-4 py-2 text-sm font-semibold text-rose-600 bg-rose-50 rounded-xl">
            Log out
          </button>
        </div>
      </div>
    )
  }

  // 4. Onboarding state for new accounts
  if (!onboarded) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/70 shadow-xs">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center text-sm font-bold shadow-md shadow-indigo-200">
                ⚡
              </div>
              <span className="font-extrabold text-slate-800 text-lg tracking-tight">StudyFlow</span>
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
            }}
          />
        </main>
      </div>
    )
  }

  // 5. Main authenticated dashboard
  return (
    <div className="min-h-screen bg-slate-50 pb-24 md:pb-12">
      {/* Sticky Top Header with StudyFlow Logo, Desktop Nav Tabs & User Logout Menu */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/70 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between">
          <button
            onClick={() => setScreen('today')}
            className="flex items-center gap-2.5 hover:opacity-85 transition-opacity cursor-pointer focus:outline-none"
          >
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center text-sm font-bold shadow-md shadow-indigo-200">
              ⚡
            </div>
            <span className="font-extrabold text-slate-800 text-lg tracking-tight">StudyFlow</span>
          </button>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/90 p-1 rounded-2xl border border-slate-200/50">
            {[
              { id: 'today', icon: '🏠', label: 'Today' },
              { id: 'plan', icon: '📅', label: 'Plan' },
              { id: 'subjects', icon: '📚', label: 'Subjects' },
              { id: 'progress', icon: '📊', label: 'Progress' },
            ].map(item => {
              const active = screen === item.id
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
        {screen === 'today' && <Today user={currentUser} />}
        {screen === 'plan' && <WeeklyPlan dailyCapacityMinutes={dailyMinutes} />}
        {screen === 'subjects' && (
          <Subjects
            subjects={subjects}
            onSubjectsChanged={refreshSubjects}
            planSettings={{ dailyMinutes, timePreference }}
          />
        )}
        {screen === 'progress' && <Progress subjects={subjects} />}
      </main>
      <BottomNav screen={screen} setScreen={setScreen} />
    </div>
  )
}
