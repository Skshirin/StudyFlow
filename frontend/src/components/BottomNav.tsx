import { Screen } from '../types'

interface BottomNavProps {
  screen: Screen
  setScreen: (s: Screen) => void
}

const navItems: { screen: Screen; icon: string; label: string }[] = [
  { screen: 'today', icon: '🏠', label: 'Today' },
  { screen: 'plan', icon: '📅', label: 'Plan' },
  { screen: 'subjects', icon: '📚', label: 'Subjects' },
  { screen: 'progress', icon: '📊', label: 'Progress' },
]

export default function BottomNav({ screen, setScreen }: BottomNavProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-t border-slate-100 safe-area-pb md:hidden">
      <div className="max-w-md mx-auto flex">
        {navItems.map(item => {
          const active = screen === item.screen
          return (
            <button
              key={item.screen}
              onClick={() => setScreen(item.screen)}
              className="flex-1 flex flex-col items-center gap-0.5 py-3 transition-opacity"
            >
              <span className={`text-xl transition-all duration-200 ${active ? 'scale-110' : 'opacity-50'}`}>
                {item.icon}
              </span>
              <span
                className={`text-[10px] font-semibold tracking-wide transition-colors ${
                  active ? 'text-indigo-600' : 'text-slate-400'
                }`}
              >
                {item.label}
              </span>
              {active && (
                <span className="w-1 h-1 rounded-full bg-indigo-500" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
