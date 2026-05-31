import { useState, useCallback } from 'react'
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

export default function Calendar() {
  const [current, setCurrent] = useState(new Date())
  const [events, setEvents] = useState<CalEvent[]>(() => {
    try { return JSON.parse(localStorage.getItem('shimshon_calendar') || '[]') } catch { return [] }
  })
  const [selected, setSelected] = useState<Date | null>(new Date())
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [cat, setCat] = useState('personal')

  const saveEvents = (evts: CalEvent[]) => {
    setEvents(evts)
    localStorage.setItem('shimshon_calendar', JSON.stringify(evts))
  }

  const addEvent = () => {
    if (!title || !selected) return
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
  const startPad = getDay(ms) // 0=Sunday

  // Selected day events
  const selEvents = selected ? events.filter(e => e.date === format(selected, 'yyyy-MM-dd'))
    .sort((a,b) => (a.time||'').localeCompare(b.time||'')) : []

  const today = new Date()

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{ color:'var(--m-calendar)' }}>▦</span> לוח שנה</h1>
          <p className="module-sub">{format(current, 'MMMM yyyy', {locale:he})}</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn-ghost" onClick={() => setCurrent(subMonths(current,1))}>→</button>
          <button className="btn-ghost" onClick={() => setCurrent(new Date())}>היום</button>
          <button className="btn-ghost" onClick={() => setCurrent(addMonths(current,1))}>←</button>
          <button className="btn-gold" onClick={() => { setSelected(selected || new Date()); setShowAdd(true) }}>+ אירוע</button>
        </div>
      </div>

      <div className="cal-layout">
        {/* Calendar grid */}
        <div className="cal-grid-wrap card">
          {/* Day headers */}
          <div className="cal-day-headers">
            {DAYS_HE.map(d => <div key={d} className="cal-day-hdr">{d}</div>)}
          </div>

          {/* Calendar cells */}
          <div className="cal-cells">
            {/* Padding cells */}
            {Array.from({length: startPad}, (_,i) => (
              <div key={`pad-${i}`} className="cal-cell cal-pad" />
            ))}

            {days.map(day => {
              const ds = format(day, 'yyyy-MM-dd')
              const dayEvents = events.filter(e => e.date === ds)
              const isToday = isSameDay(day, today)
              const isSelected = selected && isSameDay(day, selected)
              return (
                <div key={ds} className={`cal-cell ${isToday?'cal-today':''} ${isSelected?'cal-selected':''}`}
                  onClick={() => setSelected(day)}>
                  <div className="cal-cell-num">{format(day, 'd')}</div>
                  <div className="cal-cell-events">
                    {dayEvents.slice(0,2).map(e => (
                      <div key={e.id} className="cal-event-dot" style={{ background: e.color }} title={e.title} />
                    ))}
                    {dayEvents.length > 2 && <span className="cal-event-more">+{dayEvents.length-2}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Selected day panel */}
        <div className="cal-day-panel card">
          <div className="cal-panel-title">
            {selected ? format(selected, 'EEEE, d בMMMM', {locale:he}) : 'בחר יום'}
          </div>
          {selEvents.length === 0 && (
            <div style={{textAlign:'center', padding:'32px 0', color:'var(--text3)'}}>
              <div style={{fontSize:28, marginBottom:8}}>📅</div>
              <p style={{fontSize:13}}>אין אירועים ביום זה</p>
              <button className="btn-ghost" style={{marginTop:12,fontSize:12}} onClick={() => setShowAdd(true)}>+ הוסף אירוע</button>
            </div>
          )}
          {selEvents.map(e => (
            <div key={e.id} className="cal-panel-event">
              <div className="cal-panel-event-bar" style={{ background: e.color }} />
              <div className="cal-panel-event-body">
                {e.time && <div className="cal-panel-time">{e.time}</div>}
                <div className="cal-panel-title2">{e.title}</div>
                <div className="cal-panel-cat" style={{ color: e.color }}>{e.category}</div>
              </div>
              <button className="task-del2" onClick={() => removeEvent(e.id)}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Add event modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header">
              <h3>אירוע חדש — {selected ? format(selected,'d בMMMM',{locale:he}) : ''}</h3>
              <button className="modal-close" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div className="modal-form">
              <div className="mfield"><label>כותרת</label><input className="form-input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="פגישה, אירוע..." autoFocus /></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="mfield"><label>שעה</label><input className="form-input" type="time" value={time} onChange={e=>setTime(e.target.value)} /></div>
                <div className="mfield"><label>קטגוריה</label>
                  <select className="form-input" value={cat} onChange={e=>setCat(e.target.value)}>
                    <option value="work">עבודה</option>
                    <option value="personal">אישי</option>
                    <option value="health">בריאות</option>
                    <option value="finance">פיננסי</option>
                    <option value="other">אחר</option>
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
