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

// Estimate rough token/context usage
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
  const [messages, setMessages] = useState<ShimshonMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [navSuggest, setNavSuggest] = useState<string | null>(null)
  const [warned80, setWarned80] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const usage = estimateUsage(messages)
  const show80Warning = usage >= 80 && !warned80

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
    setMessages(next)
    setLoading(true)

    const reply = await askShimshon(next, context)
    const aiMsg: ShimshonMessage = { role: 'shimshon', content: reply, timestamp: new Date() }
    // needsRefresh is handled by askShimshon returning a special prefix
    if (reply.startsWith('__REFRESH__:')) {
      const actualReply = reply.replace('__REFRESH__:', '')
      const aiMsg2: ShimshonMessage = { role: 'shimshon', content: actualReply, timestamp: new Date() }
      setMessages(prev => [...prev.slice(0,-1), aiMsg2])
      if (onRefresh) setTimeout(() => onRefresh(), 800)
      return
    }
    setMessages([...next, aiMsg])
    setLoading(false)

    // Detect navigation intent
    const nav = detectNavIntent(msg) || detectNavIntent(reply)
    if (nav && onNavigate) setNavSuggest(nav)
  }

  const quickActions = [
    'מה יש לי היום?',
    'איך אני עומד תקציבית?',
    'מה לא עשיתי עדיין?',
  ]

  // Embedded mode — render just the chat content (for AI panel)
  if (embedded) {
    return (
      <div className="shimshon-embedded">
        <div className="shimshon-messages shimshon-embedded-msgs">
          {messages.length === 0 && (
            <div className="shimshon-empty-state">
              <div className="shimshon-empty-av">ש</div>
              <p>מה אפשר לעשות בשבילך?</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`shimshon-msg ${m.role === 'user' ? 'shimshon-user' : 'shimshon-ai'}`}>
              <div className="shimshon-bubble">{m.content}</div>
            </div>
          ))}
          {loading && (
            <div className="shimshon-msg shimshon-ai">
              <div className="shimshon-bubble shimshon-typing"><span /><span /><span /></div>
            </div>
          )}
          {navSuggest && onNavigate && (
            <div className="shimshon-nav-chip fade-in">
              <span>פתח: {PAGE_LABELS[navSuggest]}</span>
              <button onClick={() => { onNavigate(navSuggest); setNavSuggest(null) }}>פתח ←</button>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        {messages.length === 0 && (
          <div className="shimshon-quick" style={{padding:'0 12px'}}>
            {quickActions.slice(0,3).map(q => (
              <button key={q} className="shimshon-quick-btn" onClick={() => send(q)}>{q}</button>
            ))}
          </div>
        )}
        <div className="shimshon-input-area shimshon-embedded-input">
          <input className="shimshon-input" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="שאל את שמשון..." />
          <button className="shimshon-send" onClick={() => send()} disabled={!input.trim() || loading}>←</button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* 80% warning toast */}
      {show80Warning && !open && (
        <div className="shimshon-warning" onClick={() => { setOpen(true); setWarned80(true) }}>
          <span>⚠️</span>
          <span>שיחה ארוכה — שמשון ב-<strong>{usage}%</strong> קיבולת</span>
          <button onClick={e => { e.stopPropagation(); setWarned80(true) }}>✕</button>
        </div>
      )}

      {/* FAB */}
      <button
        className={`shimshon-fab ${open ? 'open' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="שמשון"
      >
        <span className="shimshon-fab-letter">ש</span>
        {!open && usage >= 80 && <span className="shimshon-fab-badge">!</span>}
        {!open && <span className="shimshon-fab-pulse" />}
      </button>

      {/* Panel */}
      {open && (
        <div className="shimshon-panel fade-in">
          {/* Header */}
          <div className="shimshon-header">
            <div className="shimshon-header-left">
              <div className="shimshon-av">ש</div>
              <div>
                <div className="shimshon-name">שמשון</div>
                <div className="shimshon-status">
                  <span className="shimshon-dot" />
                  פעיל
                </div>
              </div>
            </div>
            <button className="shimshon-x" onClick={() => setOpen(false)}>✕</button>
          </div>

          {/* Context usage bar */}
          {messages.length > 2 && (
            <div className="shimshon-ctx-bar">
              <span>context</span>
              <div className="shimshon-ctx-track">
                <div className="shimshon-ctx-fill" style={{
                  width: `${usage}%`,
                  background: usage >= 80 ? 'var(--red)' : usage >= 60 ? 'var(--amber)' : 'var(--green)'
                }} />
              </div>
              <span style={{ color: usage >= 80 ? 'var(--red)' : 'var(--text3)' }}>{usage}%</span>
            </div>
          )}

          {/* Messages */}
          <div className="shimshon-msgs">
            {briefing && messages.length === 0 && (
              <div className="shimshon-msg shimshon-ai">
                <div className="shimshon-bubble">{briefing}</div>
                <div className="shimshon-ts">ברייפינג בוקר</div>
              </div>
            )}
            {!briefing && messages.length === 0 && (
              <div className="shimshon-empty-state">
                <div className="shimshon-empty-av">ש</div>
                <p>מה אפשר לעשות בשבילך?</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`shimshon-msg ${m.role === 'user' ? 'shimshon-user' : 'shimshon-ai'}`}>
                <div className="shimshon-bubble">{m.content}</div>
              </div>
            ))}
            {loading && (
              <div className="shimshon-msg shimshon-ai">
                <div className="shimshon-bubble shimshon-typing">
                  <span /><span /><span />
                </div>
              </div>
            )}

            {/* Nav suggestion */}
            {navSuggest && onNavigate && (
              <div className="shimshon-nav-chip fade-in">
                <span>פתח: {PAGE_LABELS[navSuggest]}</span>
                <button onClick={() => { onNavigate(navSuggest); setOpen(false); setNavSuggest(null) }}>
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
              {onNavigate && (
                <div className="shimshon-shortcuts">
                  {Object.entries(PAGE_LABELS).map(([page, label]) => (
                    <button key={page} className="shimshon-shortcut"
                      onClick={() => { onNavigate(page); setOpen(false) }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Input */}
          <div className="shimshon-input-area">
            <input
              className="shimshon-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="שאל את שמשון..."
              autoFocus
            />
            <button
              className="shimshon-send"
              onClick={() => send()}
              disabled={!input.trim() || loading}
            >←</button>
          </div>
        </div>
      )}
    </>
  )
}
