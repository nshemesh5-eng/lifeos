import { useState, useRef, useEffect } from 'react'
import { askShimshon, ShimshonMessage, LifeContext } from '../lib/shimshon'
import './ShimshonChat.css'

interface Props {
  context: LifeContext
  briefing?: string
  onNavigate?: (page: string) => void
  usagePercent?: number
}

// Detect navigation intent in response
function extractNavigation(text: string): string | null {
  const navMap: Record<string, string[]> = {
    finance: ['פיננסים', 'כסף', 'תקציב', 'הוצאות', 'הכנסות', 'עסקאות', 'suntrack', 'fintrack'],
    workout: ['אימון', 'אימונים', 'כושר', 'ספורט', 'חדר כושר', 'סטים'],
    tasks: ['משימות', 'משימה', 'רשימה', 'לעשות'],
    habits: ['הרגלים', 'הרגל', 'streak'],
    reminders: ['תזכורות', 'תזכורת', 'להזכיר'],
    invest: ['השקעות', 'השקעה', 'תיק'],
  }
  const lower = text.toLowerCase()
  for (const [page, keywords] of Object.entries(navMap)) {
    if (keywords.some(k => lower.includes(k))) return page
  }
  return null
}

export default function ShimshonChat({ context, briefing, onNavigate, usagePercent = 0 }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ShimshonMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestedNav, setSuggestedNav] = useState<string | null>(null)
  const [showWarning, setShowWarning] = useState(usagePercent >= 80)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (usagePercent >= 80) setShowWarning(true)
  }, [usagePercent])

  const send = async (text?: string) => {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')
    setSuggestedNav(null)

    const userMsg: ShimshonMessage = { role: 'user', content: msg, timestamp: new Date() }
    const next = [...messages, userMsg]
    setMessages(next)
    setLoading(true)

    const reply = await askShimshon(next, context)
    const aiMsg: ShimshonMessage = { role: 'shimshon', content: reply, timestamp: new Date() }
    setMessages([...next, aiMsg])
    setLoading(false)

    // Check if user wants to navigate
    const navFromQ = extractNavigation(msg)
    const navFromA = extractNavigation(reply)
    if (navFromQ || navFromA) setSuggestedNav(navFromQ || navFromA)
  }

  const PAGE_LABELS: Record<string, string> = {
    finance: '₪ פיננסים', workout: '◈ אימונים', tasks: '☰ משימות',
    habits: '◎ הרגלים', reminders: '◷ תזכורות', invest: '△ השקעות',
  }

  const quickActions = ['מה יש לי היום?', 'איך אני עומד תקציבית?', 'מה עשיתי השבוע?']

  return (
    <>
      {/* Usage warning toast */}
      {showWarning && !open && (
        <div className="shimshon-warning" onClick={() => { setOpen(true); setShowWarning(false) }}>
          <span>⚠️</span>
          <span>ניצול context: <strong>{usagePercent}%</strong> — שמשון מאזהיר</span>
          <button onClick={e => { e.stopPropagation(); setShowWarning(false) }}>✕</button>
        </div>
      )}

      {/* FAB */}
      <button className={`shimshon-fab ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
        <span className="shimshon-fab-icon">ש</span>
        {!open && usagePercent >= 80 && <span className="shimshon-fab-alert">!</span>}
        {!open && <span className="shimshon-fab-pulse" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="shimshon-panel fade-in">
          <div className="shimshon-header">
            <div className="shimshon-header-info">
              <div className="shimshon-avatar">ש</div>
              <div>
                <div className="shimshon-name">שמשון</div>
                <div className="shimshon-status"><span className="shimshon-dot" />פעיל · Life OS</div>
              </div>
            </div>
            <button className="shimshon-close" onClick={() => setOpen(false)}>✕</button>
          </div>

          {/* Usage bar */}
          {usagePercent > 0 && (
            <div className="shimshon-usage">
              <span>context</span>
              <div className="shimshon-usage-bar">
                <div className="shimshon-usage-fill" style={{
                  width: `${usagePercent}%`,
                  background: usagePercent >= 80 ? 'var(--red)' : usagePercent >= 60 ? 'var(--amber)' : 'var(--green)'
                }} />
              </div>
              <span style={{ color: usagePercent >= 80 ? 'var(--red)' : 'var(--text3)' }}>{usagePercent}%</span>
            </div>
          )}

          <div className="shimshon-messages">
            {briefing && messages.length === 0 && (
              <div className="shimshon-msg shimshon-msg--ai">
                <div className="shimshon-bubble">{briefing}</div>
                <div className="shimshon-time">ברייפינג בוקר</div>
              </div>
            )}
            {!briefing && messages.length === 0 && (
              <div className="shimshon-empty">
                <div className="shimshon-empty-icon">ש</div>
                <p>מה אפשר לעשות בשבילך?</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`shimshon-msg shimshon-msg--${m.role === 'user' ? 'user' : 'ai'}`}>
                <div className="shimshon-bubble">{m.content}</div>
              </div>
            ))}
            {loading && (
              <div className="shimshon-msg shimshon-msg--ai">
                <div className="shimshon-bubble shimshon-typing"><span /><span /><span /></div>
              </div>
            )}

            {/* Navigation suggestion */}
            {suggestedNav && onNavigate && (
              <div className="shimshon-nav-suggest fade-in">
                <span>עבור ל{PAGE_LABELS[suggestedNav]}</span>
                <button className="shimshon-nav-btn" onClick={() => { onNavigate(suggestedNav); setOpen(false); setSuggestedNav(null) }}>
                  פתח ←
                </button>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Quick actions */}
          {messages.length === 0 && (
            <div className="shimshon-quick">
              {quickActions.map(q => (
                <button key={q} className="shimshon-quick-btn" onClick={() => send(q)}>{q}</button>
              ))}
              {/* Module shortcuts */}
              <div className="shimshon-shortcuts">
                {Object.entries(PAGE_LABELS).map(([page, label]) => onNavigate && (
                  <button key={page} className="shimshon-shortcut" onClick={() => { onNavigate(page); setOpen(false) }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="shimshon-input-row">
            <input
              className="shimshon-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="שאל את שמשון..."
            />
            <button className="shimshon-send" onClick={() => send()} disabled={!input.trim() || loading}>←</button>
          </div>
        </div>
      )}
    </>
  )
}
