import { useState } from 'react'
import { AuthUser } from '../types'
import { loginUser, registerUser } from '../api/endpoints'
import { setAuthSession } from '../api/client'

interface AuthScreenProps {
  onAuthSuccess: (user: AuthUser) => void
  onContinueAsGuest?: () => void
}

export default function AuthScreen({ onAuthSuccess, onContinueAsGuest }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Please provide both email and password.')
      return
    }

    if (mode === 'register' && password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        const res = await loginUser({ email, password })
        setAuthSession(res.token, res.user)
        onAuthSuccess(res.user)
      } else {
        const res = await registerUser({ name: name.trim() || 'Student', email, password })
        setAuthSession(res.token, res.user)
        onAuthSuccess(res.user)
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/20 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Logo Badge */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-lg shadow-indigo-200 mb-4 transform hover:rotate-3 transition-transform">
          <span className="text-2xl">⚡</span>
        </div>
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">StudyFlow</h1>
        <p className="mt-1 text-sm text-slate-500">
          Smart, adaptive study planning powered by spaced repetition
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white/80 backdrop-blur-xl py-8 px-6 sm:px-10 shadow-xl shadow-slate-200/50 rounded-3xl border border-slate-100/80">
          {/* Mode Switcher */}
          <div className="flex p-1 bg-slate-100 rounded-2xl mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login')
                setError(null)
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                mode === 'login'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register')
                setError(null)
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
                mode === 'register'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-5 p-3.5 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-2.5 text-rose-600 text-xs animate-shake">
              <span className="text-base leading-none">⚠️</span>
              <span className="font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Your Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Alex"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-slate-50/50"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-slate-50/50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder={mode === 'register' ? 'At least 6 characters' : '••••••••'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-11 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all bg-slate-50/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-xs text-slate-400 hover:text-slate-600 select-none"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-bold text-sm rounded-2xl shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Processing...</span>
                </>
              ) : mode === 'login' ? (
                'Log In'
              ) : (
                'Get Started'
              )}
            </button>
          </form>

          {onContinueAsGuest && (
            <div className="mt-6 pt-5 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={onContinueAsGuest}
                className="text-xs font-semibold text-slate-400 hover:text-indigo-600 transition-colors"
              >
                Skip for now — Continue as Guest →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
