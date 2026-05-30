import { useState, useRef, useEffect } from 'react'
import { askShimshon, ShimshonMessage, LifeContext } from '../lib/shimshon'
import './ShimshonChat.css'

interface Props {
  context: LifeContext
  briefing?: string
}

export default function ShimshonChat({ context, briefing }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ShimshonMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text?: string) => {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')

    const userMsg: ShimshonMessage = { role: 'user', content: msg, timestamp: new Date() }
    const next = [...messages, userMsg]
    setMessages(next)
    setLoading(true)

    const reply = await askShimshon(next, context)
    setMessages([...next, { role: 'shimshon', content: reply, timestamp: new Date() }])
    setLoading(false)
  }

  const quickActions = [
    'מה יש לי היום?',
    'איך אני עומד תקציבית?',
    'מה אני אוכל היום?',
  ]

  return (
    <>
      {/* Floating button */}
      <button className={`shimshon-fab ${open ? 'open' : ''}`} onClick={() => setOpen(!open)}>
        <span className="shimshon-fab-icon">ש</span>
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
                <div className="shimshon-status">
                  <span className="shimshon-dot" />
                  פעיל
                </div>
              </div>
            </div>
            <button className="shimshon-close" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="shimshon-messages">
            {/* Briefing */}
            {briefing && messages.length === 0 && (
              <div className="shimshon-msg shimshon-msg--ai">
                <div className="shimshon-bubble">{briefing}</div>
                <div className="shimshon-time">ברייפינג בוקר</div>
              </div>
            )}

            {/* No messages yet */}
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
                <div className="shimshon-bubble shimshon-typing">
                  <span /><span /><span />
                </div>
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
            <button className="shimshon-send" onClick={() => send()} disabled={!input.trim() || loading}>
              ←
            </button>
          </div>
        </div>
      )}
    </>
  )
}
