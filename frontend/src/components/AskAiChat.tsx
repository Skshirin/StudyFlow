import { useState, useRef, useEffect } from 'react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface AskAiChatProps {
  conceptName?: string | null
  moduleName?: string | null
  subjectName?: string | null
}

export default function AskAiChat({ conceptName, moduleName, subjectName }: AskAiChatProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: ChatMessage = { role: 'user', content: text }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const { api } = await import('../api/client')
      const res = await api.post('/ask-ai', {
        question: text,
        messages: updatedMessages,
        conceptName: conceptName || undefined,
        moduleName: moduleName || undefined,
        subjectName: subjectName || undefined
      })

      if (res.error === 'noAiProvider') {
        setError(res.message)
        return
      }
      if (res.error === 'aiFailed') {
        setError(res.message)
        return
      }
      if (res.answer) {
        setMessages(prev => [...prev, { role: 'assistant', content: res.answer }])
      }
    } catch (err: any) {
      setError(err.message || 'Failed to get AI response')
    } finally {
      setLoading(false)
    }
  }

  const contextLabel = conceptName || moduleName || subjectName || null

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 md:bottom-6 right-4 z-40 w-12 h-12 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-500 text-white shadow-lg shadow-violet-200 hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
        title="Ask AI about a concept"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    )
  }

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 z-40 w-[340px] sm:w-[380px] max-h-[500px] bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-300/40 flex flex-col overflow-hidden fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-indigo-50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center text-white text-xs">
            ✨
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">Ask AI</h3>
            {contextLabel && (
              <p className="text-[10px] text-slate-400 truncate max-w-[200px]">
                About: {contextLabel}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="w-7 h-7 rounded-lg hover:bg-white/80 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors text-sm font-bold"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px] max-h-[340px]">
        {messages.length === 0 && !error && (
          <div className="text-center py-8">
            <p className="text-2xl mb-2">💡</p>
            <p className="text-xs text-slate-400 font-medium">
              Ask any question about{' '}
              {conceptName ? `"${conceptName}"` : 'your study topics'}
            </p>
            <p className="text-[10px] text-slate-300 mt-1">
              e.g. "Explain the kernel trick simply" or "What's the difference between PoW and PoS?"
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-md'
                  : 'bg-slate-100 text-slate-700 rounded-bl-md'
              }`}
            >
              {msg.content.split('\n').map((line, j) => (
                <p key={j} className={j > 0 ? 'mt-1.5' : ''}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {error && (
          <div className="bg-rose-50 border border-rose-100 rounded-2xl px-3.5 py-2.5 text-xs text-rose-600 font-medium">
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-100 px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Ask about this concept…"
          className="flex-1 text-xs text-slate-700 placeholder:text-slate-300 bg-slate-50 rounded-xl px-3 py-2 outline-none focus:bg-slate-100 transition-colors"
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="w-8 h-8 rounded-xl bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-200 text-white disabled:text-slate-400 flex items-center justify-center transition-colors flex-shrink-0"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
