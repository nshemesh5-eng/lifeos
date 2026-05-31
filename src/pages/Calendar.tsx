import { useState } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, subMonths, addMonths, isSameDay, getDay } from 'date-fns'
import { he } from 'date-fns/locale'
import './Calendar.css'

const DAYS_HE = ['א','ב','ג','ד','ה','ו','ש']

interface CalEvent {
  id: string; title: string; date: string; time?: string; color: string; category: string
}

const CAT_COLORS: Record<string, string> = {
  work: '#3B82F6', personal: '#8B5CF6', health: '#10B981', finance: '#F5C842', other: '#6B7280'
}
const CAT_LABELS: Record<string, string> = {
  work: 'עבודה', personal: 'אישי', health: 'בריאות', finance: 'פיננסי', other: 'אחר'
}

export default function Calendar() {
  const [current, setCurrent] = useState(new Date())
  const [events, setEvents] = useState<CalEvent[]>(() => {
    try { return JSON.parse(localStorage.getItem('shimshon_calendar') || '[]') } catch { return [] }
  })
  const [selected, setSelected] = useState<Date>(new Date())
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [cat, setCat] = useState('personal')

  const saveEvents = (evts: CalEvent[]) => {
    setEvents(evts)
    localStorage.setItem('shimshon_calendar', JSON.stringify(evts))
  }

  const addEvent = () => {
    if (!title) return
    const newEvt: CalEvent = {
      id: Date.now().toString(),
      title, date: format(selected, 'yyyy-MM-dd'),
      time, color: CAT_COLORS[cat] || '#6B7280', category: cat
    }
    saveEvents([...events, newEvt])
    setShowAdd(false); setTitle(''); setTime('')
  }

  const removeEvent = (id: string) => saveEvents(events.filter(e => e.id !== id))

  const ms = startOfMonth(current)
  const me = endOfMonth(current)
  const days = eachDayOfInterval({ start: ms, end: me })
  const startPad = getDay(ms) // 0=Sunday in Israel

  const today = new Date()

  const selEvents = events
    .filter(e => e.date === format(selected, 'yyyy-MM-dd'))
    .sort((a,b) => (a.time||'').localeCompare(b.time||''))

  // Month events count for color intensity
  const eventsByDate: Record<string, CalEvent[]> = {}
  events.forEach(e => {
    if (!eventsByDate[e.date]) eventsByDate[e.date] = []
    eventsByDate[e.date].push(e)
  })

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title">
            <span style={{ color:'var(--m-calendar)' }}>▦</span> לוח שנה
          </h1>
          <p className="module-sub">{format(current, 'MMMM yyyy', {locale:he})}</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn-ghost" onClick={() => setCurrent(p => subMonths(p,1))}>←</button>
          <button className="btn-ghost" onClick={() => { setCurrent(new Date()); setSelected(new Date()) }}>היום</button>
          <button className="btn-ghost" onClick={() => setCurrent(p => addMonths(p,1))}>→</button>
          <button className="btn-gold" onClick={() => setShowAdd(true)}>+ אירוע</button>
        </div>
      </div>

      <div className="cal-layout">
        {/* Calendar grid */}
        <div className="cal-grid-wrap card">
          <div className="cal-day-headers">
            {DAYS_HE.map(d => <div key={d} className="cal-day-hdr">{d}</div>)}
          </div>
          <div className="cal-cells">
            {Array.from({length: startPad}, (_,i) => (
              <div key={`p${i}`} className="cal-cell cal-pad" />
            ))}
            {days.map(day => {
              const ds = format(day, 'yyyy-MM-dd')
              const dayEvts = eventsByDate[ds] || []
              const isToday = isSameDay(day, today)
              const isSelected = isSameDay(day, selected)
              return (
                <div key={ds}
                  className={`cal-cell ${isToday?'cal-today':''} ${isSelected&&!isToday?'cal-selected':''}`}
                  onClick={() => setSelected(day)}>
                  <div className="cal-cell-num">{format(day,'d')}</div>
                  <div className="cal-cell-dots">
                    {dayEvts.slice(0,3).map((e,i) => (
                      <div key={i} className="cal-event-dot" style={{ background: e.color }} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Day panel */}
        <div className="cal-day-panel card">
          <div className="cal-panel-date">
            {isSameDay(selected, today) && <span className="cal-today-chip">היום</span>}
            {format(selected, 'EEEE, d בMMMM', {locale:he})}
          </div>

          {selEvents.length === 0 ? (
            <div className="cal-empty-day">
              <div>📅</div>
              <p>אין אירועים</p>
              <button className="btn-ghost" style={{fontSize:12,height:32}} onClick={() => setShowAdd(true)}>+ הוסף</button>
            </div>
          ) : selEvents.map(e => (
            <div key={e.id} className="cal-event-card">
              <div className="cal-event-bar" style={{ background: e.color }} />
              <div className="cal-event-body">
                {e.time && <div className="cal-event-time">{e.time}</div>}
                <div className="cal-event-title">{e.title}</div>
                <div className="cal-event-cat" style={{ color: e.color }}>{CAT_LABELS[e.category] || e.category}</div>
              </div>
              <button className="task-del2" onClick={() => removeEvent(e.id)}>✕</button>
            </div>
          ))}

          {selEvents.length > 0 && (
            <button className="btn-ghost" style={{width:'100%', marginTop:4}} onClick={() => setShowAdd(true)}>
              + הוסף אירוע
            </button>
          )}
        </div>
      </div>

      {/* Upcoming events */}
      {events.length > 0 && (
        <div className="card cal-upcoming">
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 }}>
            אירועים קרובים
          </div>
          {events
            .filter(e => e.date >= format(today, 'yyyy-MM-dd'))
            .sort((a,b) => a.date.localeCompare(b.date))
            .slice(0, 5)
            .map(e => (
              <div key={e.id} className="cal-upcoming-row">
                <div className="cal-upcoming-dot" style={{ background: e.color }} />
                <div className="cal-upcoming-date">{format(new Date(e.date), 'd בMMM', {locale:he})}</div>
                <div className="cal-upcoming-title">{e.title}</div>
                {e.time && <div className="cal-upcoming-time">{e.time}</div>}
                <button className="task-del2" onClick={() => removeEvent(e.id)}>✕</button>
              </div>
            ))}
        </div>
      )}

      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header">
              <h3>אירוע — {format(selected,'d בMMMM',{locale:he})}</h3>
              <button className="modal-close" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div className="modal-form">
              <div className="mfield"><label>כותרת</label>
                <input className="form-input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="שם האירוע" autoFocus />
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="mfield"><label>שעה</label>
                  <input className="form-input" type="time" value={time} onChange={e=>setTime(e.target.value)} />
                </div>
                <div className="mfield"><label>קטגוריה</label>
                  <select className="form-input" value={cat} onChange={e=>setCat(e.target.value)}>
                    {Object.entries(CAT_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setShowAdd(false)}>ביטול</button>
                <button className="btn-gold" onClick={addEvent} disabled={!title}>הוסף</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
