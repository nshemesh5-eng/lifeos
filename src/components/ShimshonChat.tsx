import { useState, useRef, useEffect } from 'react'
import { askShimshon, ShimshonMessage, LifeContext, detectNavIntent } from '../lib/shimshon'
import './ShimshonChat.css'

interface Props {
  context?: LifeContext
  briefing?: string
  onNavigate?: (page: string) => void
  onRefresh?: () => void
  embedded?: boolean
  userId?: string
  authToken?: string
}

function estimateUsage(messages: ShimshonMessage[]): number {
  const totalChars = messages.reduce((s, m) => s + m.content.length, 0)
  return Math.min(100, Math.round((totalChars / 8000) * 100))
}

const PAGE_LABELS: Record<string, string> = {
  finance:'₪ פיננסים', workout:'◈ אימונים', tasks:'☰ משימות',
  habits:'◎ הרגלים', reminders:'◷ תזכורות', invest:'△ השקעות', nutrition:'🥗 תזונה',
}

export default function ShimshonChat({ context, briefing, onNavigate, onRefresh, embedded, userId, authToken }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ShimshonMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem('shimshon-messages')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0)
          return parsed.map((m: any) => ({...m, timestamp: new Date(m.timestamp)}))
      }
    } catch {}
    return []
  })
  const [warned80, setWarned80] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [navSuggest, setNavSuggest] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const usage = estimateUsage(messages)
  const show80Warning = usage >= 80 && !warned80

  const saveMessages = (next: ShimshonMessage[]) => {
    setMessages(next)
    try { sessionStorage.setItem('shimshon-messages', JSON.stringify(next)) } catch {}
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (usage >= 80 && !warned80) setWarned80(false) // reset to show again
  }, [usage])

  const send = async (text?: string) => {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')
    setNavSuggest(null)

    const userMsg: ShimshonMessage = { role: 'user', content: msg, timestamp: new Date() }
    const next = [...messages, userMsg]
    saveMessages(next)
    setLoading(true)

    const reply = await askShimshon(next, context ?? ({} as LifeContext), userId, authToken)
    let finalReply = reply
    if (reply.startsWith('__REFRESH__:')) finalReply = reply.replace('__REFRESH__:', '')
    const aiMsg: ShimshonMessage = { role: 'shimshon', content: finalReply, timestamp: new Date() }
    saveMessages([...next, aiMsg])

    const nav = detectNavIntent(finalReply)
    if (nav && onNavigate) setNavSuggest(nav)
    setLoading(false)
  }

  const quickActions = [
    { label: 'מה יש לי היום?' },
    { label: 'איך אני עומד תקציבית?' },
    { label: 'מה לא עשיתי עדיין?' },
  ]

  if (embedded) {
    return (
      <aside className="shimshon-embedded">
        <div className="shimshon-messages shimshon-embedded-msgs">
          {messages.length === 0 && (
            <div className="shimshon-empty-state">
              <div className="shimshon-empty-av">ש</div>
              <p>מה אפשר לעשות בשבילך?</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`shimshon-msg shimshon-msg--${m.role}`}>{m.content}</div>
          ))}
          {loading && <div className="shimshon-msg shimshon-msg--shimshon shimshon-loading">...</div>}
          {navSuggest && onNavigate && (
            <div className="shimshon-nav-suggest">
              <button onClick={() => { onNavigate(navSuggest); setNavSuggest(null) }}>פתח ←</button>
              <span>פתח: {navSuggest}</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="shimshon-quick">
          {quickActions.map(a => (
            <button key={a.label} className="shimshon-quick-btn" onClick={() => send(a.label)}>{a.label}</button>
          ))}
          {onNavigate && Object.entries(PAGE_LABELS).map(([k, v]) => (
            <button key={k} className="shimshon-quick-btn shimshon-quick-nav" onClick={() => onNavigate(k)}>{v} →</button>
          ))}
        </div>
        <div className="shimshon-input">
          <button className="shimshon-back" onClick={() => saveMessages([])}>&#x2190;</button>
          <input type="text" placeholder="שאל את שמשון..." value={input}
            onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} disabled={loading} />
        </div>
      </aside>
    )
  }

  return (
    <div className={`shimshon-widget ${open ? 'shimshon-widget--open' : ''}`}>
      <button className="shimshon-fab" onClick={() => setOpen(!open)}>
        <span className="shimshon-fab-av">ש</span>
        <span className="shimshon-fab-label">שמשון</span>
        <span className="shimshon-fab-sub">LIFE OS</span>
        {messages.length > 0 && !open && <span className="shimshon-badge">{messages.length}</span>}
      </button>
      {open && (
        <div className="shimshon-panel">
          <div className="shimshon-header">
            <span>שמשון</span>
            <button onClick={() => setOpen(false)}>✕</button>
          </div>
          <div className="shimshon-messages">
            {messages.length === 0 && <div className="shimshon-empty-state"><p>מה אפשר לעשות בשבילך?</p></div>}
            {messages.map((m, i) => <div key={i} className={`shimshon-msg shimshon-msg--${m.role}`}>{m.content}</div>)}
            {loading && <div className="shimshon-msg shimshon-msg--shimshon shimshon-loading">...</div>}
            <div ref={bottomRef} />
          </div>
          <div className="shimshon-quick">
            {quickActions.map(a => <button key={a.label} className="shimshon-quick-btn" onClick={() => send(a.label)}>{a.label}</button>)}
          </div>
          <div className="shimshon-input">
            <input type="text" placeholder="שאל את שמשון..." value={input}
              onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} disabled={loading} />
            <button onClick={() => send()} disabled={loading || !input.trim()}>שלח</button>
          </div>
        </div>
      )}
    </div>
  )
}