import { useState, useRef, useEffect } from 'react'
import { AuthUser } from '../types'

interface UserMenuProps {
  user: AuthUser | null
  subjectCount: number
  onLogout: () => void
}

export default function UserMenu({ user, subjectCount, onLogout }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const initial = user?.name ? user.name[0].toUpperCase() : 'S'

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        onClick={() => setIsOpen(v => !v)}
        title={user ? `${user.name} (${user.email})` : 'User Profile'}
        className="flex items-center gap-2 sm:px-2.5 sm:py-1.5 p-1 rounded-2xl bg-white border border-slate-200/80 hover:border-slate-300 shadow-xs hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer group"
      >
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center font-bold text-xs shadow-xs group-hover:scale-105 transition-transform">
          {initial}
        </div>
        <div className="hidden sm:block text-left pr-1">
          <p className="text-xs font-bold text-slate-800 leading-tight truncate max-w-[120px]">
            {user?.name || 'Student'}
          </p>
          <p className="text-[10px] text-slate-400 font-medium leading-none truncate max-w-[120px]">
            {user?.email ? 'Account' : 'Guest'}
          </p>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 hidden sm:block ${isOpen ? 'rotate-180 text-indigo-600' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          {/* Backdrop on mobile */}
          <div
            className="fixed inset-0 bg-slate-900/10 backdrop-blur-[1px] z-40 sm:hidden"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute right-0 mt-2 w-72 origin-top-right rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-black/5 z-50 border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            {/* Header info */}
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-extrabold text-base border border-indigo-100">
                {initial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">
                  {user?.name || 'Guest Student'}
                </p>
                <p className="text-xs text-slate-400 truncate">
                  {user?.email || 'Local offline session'}
                </p>
              </div>
            </div>

            {/* Quick stats */}
            <div className="py-3 text-xs text-slate-500 flex justify-between items-center">
              <span className="font-medium">Active Subjects:</span>
              <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                {subjectCount}
              </span>
            </div>

            {/* Logout button */}
            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  setIsOpen(false)
                  onLogout()
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 active:bg-rose-100 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                {user ? 'Log out' : 'Switch / Reset Session'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
