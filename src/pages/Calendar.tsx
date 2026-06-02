import { useState, useEffect, useCallback, useRef } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, subMonths, addMonths,
  isSameDay, getDay, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks,
  isSameMonth, parseISO, isToday, differenceInMinutes, setHours, setMinutes, getHours, getMinutes
} from 'date-fns'
import { he } from 'date-fns/locale'
import './Calendar.css'

// ─── Types ───────────────────────────────────────────────
interface CalEvent {
  id: string
  user_id?: string
  title: string
  date: string          // yyyy-MM-dd
  start_time?: string   // HH:mm
  end_time?: string     // HH:mm
  color: string
  category: string
  location?: string
  description?: string
  url?: string          // Zoom/Meet link
  recurring?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
  recurring_until?: string
  all_day?: boolean
  google_id?: string    // if synced from Google Calendar
  reminder_minutes?: number  // 0=at time, 15, 30, 60...
}

type ViewMode = 'month' | 'week' | 'day' | 'agenda'

// ─── Constants ───────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  work:      '#3B82F6',
  personal:  '#8B5CF6',
  health:    '#10B981',
  finance:   '#F5C842',
  family:    '#EC4899',
  sport:     '#F97316',
  education: '#06B6D4',
  other:     '#6B7280',
}
const CAT_LABELS: Record<string, string> = {
  work: 'עבודה', personal: 'אישי', health: 'בריאות', finance: 'פיננסי',
  family: 'משפחה', sport: 'ספורט', education: 'לימודים', other: 'אחר',
}
const DAYS_HE = ['א','ב','ג','ד','ה','ו','ש']
const HOURS = Array.from({length: 24}, (_,i) => i)

// ─── Google Calendar OAuth helpers ───────────────────────
const GSCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const GCLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

function useGoogleAuth() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('gcal_token'))
  const [loading, setLoading] = useState(false)

  const login = useCallback(() => {
    if (!GCLIENT_ID) {
      alert('הגדר VITE_GOOGLE_CLIENT_ID כדי לחבר Google Calendar')
      return
    }
    const params = new URLSearchParams({
      client_id: GCLIENT_ID,
      redirect_uri: window.location.origin + '/gcal-callback',
      response_type: 'token',
      scope: GSCOPE,
      prompt: 'consent',
    })
    window.location.href = `https://accounts.google.com/o/oauth2/auth?${params}`
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('gcal_token')
    setToken(null)
  }, [])

  // Handle OAuth redirect
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('access_token')) {
      const p = new URLSearchParams(hash.substring(1))
      const t = p.get('access_token')
      if (t) {
        localStorage.setItem('gcal_token', t)
        setToken(t)
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }, [])

  const fetchGoogleEvents = useCallback(async (from: Date, to: Date): Promise<CalEvent[]> => {
    if (!token) return []
    setLoading(true)
    try {
      const params = new URLSearchParams({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '100',
      })
      const r = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!r.ok) {
        if (r.status === 401) logout()
        return []
      }
      const data = await r.json()
      return (data.items || []).map((item: any) => ({
        id: 'gcal_' + item.id,
        google_id: item.id,
        title: item.summary || 'ללא כותרת',
        date: (item.start.date || item.start.dateTime || '').substring(0, 10),
        start_time: item.start.dateTime ? format(new Date(item.start.dateTime), 'HH:mm') : undefined,
        end_time: item.end.dateTime ? format(new Date(item.end.dateTime), 'HH:mm') : undefined,
        all_day: !!item.start.date,
        color: '#4285F4',
        category: 'work',
        location: item.location,
        description: item.description,
        url: item.hangoutLink || item.conferenceData?.entryPoints?.[0]?.uri,
      }))
    } catch { return [] }
    finally { setLoading(false) }
  }, [token, logout])

  return { token, login, logout, fetchGoogleEvents, loading }
}

// ─── Helpers ─────────────────────────────────────────────
function expandRecurring(event: CalEvent, from: Date, to: Date): CalEvent[] {
  if (!event.recurring || event.recurring === 'none') return [event]
  const results: CalEvent[] = []
  let d = parseISO(event.date)
  const until = event.recurring_until ? parseISO(event.recurring_until) : to
  while (d <= (until < to ? until : to)) {
    if (d >= from) results.push({ ...event, id: event.id + '_' + format(d,'yyyyMMdd'), date: format(d,'yyyy-MM-dd') })
    if (event.recurring === 'daily') d = addDays(d, 1)
    else if (event.recurring === 'weekly') d = addWeeks(d, 1)
    else if (event.recurring === 'monthly') d = addMonths(d, 1)
    else if (event.recurring === 'yearly') d = addMonths(d, 12)
    else break
  }
  return results
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// ─── Main Component ───────────────────────────────────────
export default function Calendar({ user }: { user: User }) {
  const [current, setCurrent] = useState(new Date())
  const [selected, setSelected] = useState(new Date())
  const [view, setView] = useState<ViewMode>('month')
  const [events, setEvents] = useState<CalEvent[]>([])
  const [googleEvents, setGoogleEvents] = useState<CalEvent[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editEvent, setEditEvent] = useState<CalEvent | null>(null)
  const [showGoogleSync, setShowGoogleSync] = useState(false)
  const { token: gToken, login: gLogin, logout: gLogout, fetchGoogleEvents, loading: gLoading } = useGoogleAuth()

  // Form state
  const [fTitle, setFTitle] = useState('')
  const [fDate, setFDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [fStartTime, setFStartTime] = useState('09:00')
  const [fEndTime, setFEndTime] = useState('10:00')
  const [fCat, setFCat] = useState('personal')
  const [fAllDay, setFAllDay] = useState(false)
  const [fRecurring, setFRecurring] = useState<CalEvent['recurring']>('none')
  const [fRecurringUntil, setFRecurringUntil] = useState('')
  const [fLocation, setFLocation] = useState('')
  const [fDescription, setFDescription] = useState('')
  const [fUrl, setFUrl] = useState('')
  const [fReminder, setFReminder] = useState(15)

  // Load from Supabase
  const load = useCallback(async () => {
    const { data } = await supabase
      .from('cal_events')
      .select('*')
      .eq('user_id', user.id)
      .order('date')
    setEvents(data || [])
  }, [user.id])

  useEffect(() => { load() }, [load])

  // Sync Google events for current view range
  useEffect(() => {
    if (!gToken) return
    const from = view === 'month' ? startOfMonth(current) :
                 view === 'week' ? startOfWeek(current, {weekStartsOn: 0}) :
                 current
    const to = view === 'month' ? endOfMonth(current) :
               view === 'week' ? endOfWeek(current, {weekStartsOn: 0}) :
               addDays(current, 1)
    fetchGoogleEvents(addDays(from,-7), addDays(to,7)).then(setGoogleEvents)
  }, [gToken, current, view, fetchGoogleEvents])

  // All events merged
  const allEvents = [...events, ...googleEvents]

  // Expand recurring events for current view
  const visibleFrom = view === 'month' ? startOfMonth(current) : view === 'week' ? startOfWeek(current,{weekStartsOn:0}) : current
  const visibleTo = view === 'month' ? endOfMonth(current) : view === 'week' ? endOfWeek(current,{weekStartsOn:0}) : addDays(current,1)
  const expandedEvents = allEvents.flatMap(e => expandRecurring(e, addDays(visibleFrom,-30), addDays(visibleTo,30)))

  const eventsForDate = (d: Date) => expandedEvents
    .filter(e => e.date === format(d, 'yyyy-MM-dd'))
    .sort((a,b) => (a.start_time||'00:00').localeCompare(b.start_time||'00:00'))

  // Save event
  const saveEvent = async () => {
    if (!fTitle) return
    const payload = {
      user_id: user.id,
      title: fTitle, date: fDate,
      start_time: fAllDay ? null : fStartTime,
      end_time: fAllDay ? null : fEndTime,
      color: CAT_COLORS[fCat] || '#6B7280',
      category: fCat, all_day: fAllDay,
      recurring: fRecurring, recurring_until: fRecurringUntil || null,
      location: fLocation || null, description: fDescription || null,
      url: fUrl || null, reminder_minutes: fReminder,
    }
    if (editEvent && !editEvent.google_id) {
      await supabase.from('cal_events').update(payload).eq('id', editEvent.id)
    } else {
      await supabase.from('cal_events').insert(payload)
    }
    load()
    closeForm()
  }

  const deleteEvent = async (id: string) => {
    await supabase.from('cal_events').delete().eq('id', id)
    load()
  }

  const openAdd = (date?: Date) => {
    const d = date || selected
    setFDate(format(d, 'yyyy-MM-dd'))
    setFTitle(''); setFStartTime('09:00'); setFEndTime('10:00')
    setFCat('personal'); setFAllDay(false); setFRecurring('none')
    setFRecurringUntil(''); setFLocation(''); setFDescription(''); setFUrl(''); setFReminder(15)
    setEditEvent(null)
    setShowAdd(true)
  }

  const openEdit = (e: CalEvent) => {
    if (e.google_id) return // can't edit google events
    setEditEvent(e)
    setFTitle(e.title); setFDate(e.date)
    setFStartTime(e.start_time || '09:00'); setFEndTime(e.end_time || '10:00')
    setFCat(e.category); setFAllDay(!!e.all_day)
    setFRecurring(e.recurring || 'none'); setFRecurringUntil(e.recurring_until || '')
    setFLocation(e.location || ''); setFDescription(e.description || '')
    setFUrl(e.url || ''); setFReminder(e.reminder_minutes ?? 15)
    setShowAdd(true)
  }

  const closeForm = () => { setShowAdd(false); setEditEvent(null) }

  const today = new Date()

  // ── Month View ────────────────────────────────────────
  const MonthView = () => {
    const ms = startOfMonth(current), me = endOfMonth(current)
    const days = eachDayOfInterval({ start: ms, end: me })
    const startPad = getDay(ms)
    return (
      <div className="cal-month">
        <div className="cal-weekheader">
          {DAYS_HE.map(d => <div key={d} className="cal-weekday">{d}</div>)}
        </div>
        <div className="cal-grid">
          {Array.from({length: startPad}, (_,i) => <div key={'p'+i} className="cal-cell cal-empty" />)}
          {days.map(d => {
            const dayEvts = eventsForDate(d)
            const isSel = isSameDay(d, selected)
            const isT = isToday(d)
            return (
              <div
                key={d.toString()}
                className={`cal-cell ${isSel?'selected':''} ${isT?'today':''} ${!isSameMonth(d,current)?'other-month':''}`}
                onClick={() => setSelected(d)}
                onDoubleClick={() => { setSelected(d); openAdd(d) }}
              >
                <div className="cal-day-num">{format(d, 'd')}</div>
                <div className="cal-day-events">
                  {dayEvts.slice(0,3).map(e => (
                    <div
                      key={e.id}
                      className="cal-event-chip"
                      style={{ background: e.color }}
                      onClick={ev => { ev.stopPropagation(); openEdit(e) }}
                      title={e.title + (e.start_time ? ' ' + e.start_time : '')}
                    >
                      {e.start_time && <span className="chip-time">{e.start_time}</span>}
                      {e.url && <span className="chip-icon">🎥</span>}
                      {e.title}
                    </div>
                  ))}
                  {dayEvts.length > 3 && <div className="cal-more">+{dayEvts.length-3}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Week View ─────────────────────────────────────────
  const WeekView = () => {
    const weekStart = startOfWeek(current, {weekStartsOn: 0})
    const weekDays = Array.from({length:7}, (_,i) => addDays(weekStart, i))
    return (
      <div className="cal-week">
        <div className="cal-week-header">
          <div className="cal-hour-label" />
          {weekDays.map(d => (
            <div key={d.toString()} className={`cal-week-dayhead ${isToday(d)?'today':''}`}>
              <div className="cal-week-dname">{format(d,'EEE',{locale:he})}</div>
              <div className={`cal-week-dnum ${isToday(d)?'today-circle':''}`}>{format(d,'d')}</div>
            </div>
          ))}
        </div>
        <div className="cal-week-body">
          <div className="cal-hours-col">
            {HOURS.map(h => (
              <div key={h} className="cal-hour-slot">
                <span>{h.toString().padStart(2,'0')}:00</span>
              </div>
            ))}
          </div>
          {weekDays.map(d => {
            const dayEvts = eventsForDate(d).filter(e => !e.all_day && e.start_time)
            return (
              <div key={d.toString()} className={`cal-week-col ${isToday(d)?'today-col':''}`}
                   onDoubleClick={() => { setSelected(d); openAdd(d) }}>
                {HOURS.map(h => <div key={h} className="cal-hour-cell" />)}
                {dayEvts.map(e => {
                  const top = (timeToMinutes(e.start_time!) / 60) * 60 // 60px per hour
                  const height = e.end_time
                    ? Math.max(20, ((timeToMinutes(e.end_time) - timeToMinutes(e.start_time!)) / 60) * 60)
                    : 40
                  return (
                    <div key={e.id} className="cal-week-event"
                         style={{ top, height, background: e.color }}
                         onClick={() => openEdit(e)}>
                      <div className="cal-we-title">{e.title}</div>
                      {e.start_time && <div className="cal-we-time">{e.start_time}{e.end_time?' – '+e.end_time:''}</div>}
                      {e.url && <span className="cal-we-meet">🎥</span>}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Day View ──────────────────────────────────────────
  const DayView = () => {
    const dayEvts = eventsForDate(selected)
    const timedEvts = dayEvts.filter(e => !e.all_day && e.start_time)
    const allDayEvts = dayEvts.filter(e => e.all_day || !e.start_time)
    return (
      <div className="cal-day-view">
        {allDayEvts.length > 0 && (
          <div className="cal-allday-strip">
            {allDayEvts.map(e => (
              <div key={e.id} className="cal-event-chip" style={{background:e.color}} onClick={() => openEdit(e)}>
                {e.title}
              </div>
            ))}
          </div>
        )}
        <div className="cal-day-body">
          <div className="cal-hours-col">
            {HOURS.map(h => <div key={h} className="cal-hour-slot"><span>{h.toString().padStart(2,'0')}:00</span></div>)}
          </div>
          <div className="cal-day-col" onDoubleClick={() => openAdd(selected)}>
            {HOURS.map(h => <div key={h} className="cal-hour-cell" />)}
            {timedEvts.map(e => {
              const top = (timeToMinutes(e.start_time!) / 60) * 60
              const height = e.end_time
                ? Math.max(30, ((timeToMinutes(e.end_time) - timeToMinutes(e.start_time!)) / 60) * 60)
                : 50
              return (
                <div key={e.id} className="cal-week-event" style={{top, height, background:e.color}} onClick={() => openEdit(e)}>
                  <div className="cal-we-title">{e.title}</div>
                  <div className="cal-we-time">{e.start_time}{e.end_time?' – '+e.end_time:''}</div>
                  {e.location && <div className="cal-we-loc">📍 {e.location}</div>}
                  {e.url && <a className="cal-we-meet" href={e.url} target="_blank" onClick={ev=>ev.stopPropagation()}>🎥 הצטרף</a>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── Agenda View ───────────────────────────────────────
  const AgendaView = () => {
    const next30 = Array.from({length:30}, (_,i) => addDays(today,i))
    return (
      <div className="cal-agenda">
        {next30.map(d => {
          const dayEvts = eventsForDate(d)
          if (dayEvts.length === 0) return null
          return (
            <div key={d.toString()} className="agenda-day">
              <div className={`agenda-date ${isToday(d)?'today':''}`}>
                <span className="agenda-dow">{format(d,'EEE',{locale:he})}</span>
                <span className="agenda-dnum">{format(d,'d MMM',{locale:he})}</span>
              </div>
              <div className="agenda-events">
                {dayEvts.map(e => (
                  <div key={e.id} className="agenda-event" style={{borderColor:e.color}} onClick={() => openEdit(e)}>
                    <div className="agenda-ev-time">
                      {e.all_day ? 'כל היום' : (e.start_time || '')}
                      {e.end_time && ' – ' + e.end_time}
                    </div>
                    <div className="agenda-ev-title">{e.title}</div>
                    {e.location && <div className="agenda-ev-loc">📍 {e.location}</div>}
                    {e.url && <a href={e.url} target="_blank" className="agenda-ev-url" onClick={ev=>ev.stopPropagation()}>🎥 הצטרף</a>}
                    {e.description && <div className="agenda-ev-desc">{e.description}</div>}
                    {e.google_id && <span className="google-badge">G</span>}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────
  return (
    <div className="module-page fade-in">
      {/* Header */}
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{color:'var(--m-calendar)'}}>▦</span> לוח שנה</h1>
          <p className="module-sub">{format(current, 'MMMM yyyy', {locale:he})}</p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {/* Google Calendar */}
          {gToken ? (
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span className="google-connected">G ✓</span>
              {gLoading && <span style={{fontSize:11,color:'var(--text3)'}}>מסנכרן...</span>}
              <button className="btn-ghost" style={{fontSize:11}} onClick={gLogout}>נתק</button>
            </div>
          ) : (
            <button className="btn-ghost" style={{fontSize:12}} onClick={gLogin}>
              <span style={{color:'#4285F4',fontWeight:700}}>G</span> Google Calendar
            </button>
          )}
          {/* View tabs */}
          <div className="view-tabs">
            {(['month','week','day','agenda'] as ViewMode[]).map(v => (
              <button key={v} className={`view-tab ${view===v?'active':''}`} onClick={() => setView(v)}>
                {v==='month'?'חודש':v==='week'?'שבוע':v==='day'?'יום':'יומן'}
              </button>
            ))}
          </div>
          {/* Nav */}
          <button className="btn-ghost" onClick={() => {
            if(view==='month') setCurrent(p=>subMonths(p,1))
            else if(view==='week') setCurrent(p=>subWeeks(p,1))
            else setCurrent(p=>addDays(p,-1))
          }}>←</button>
          <button className="btn-ghost" onClick={() => { setCurrent(new Date()); setSelected(new Date()) }}>היום</button>
          <button className="btn-ghost" onClick={() => {
            if(view==='month') setCurrent(p=>addMonths(p,1))
            else if(view==='week') setCurrent(p=>addWeeks(p,1))
            else setCurrent(p=>addDays(p,1))
          }}>→</button>
          <button className="btn-gold" onClick={() => openAdd()}>+ אירוע</button>
        </div>
      </div>

      {/* Selected day summary for month view */}
      {view === 'month' && (
        <div className="cal-selected-strip">
          <strong>{format(selected,'EEEE, d בMMMM',{locale:he})}</strong>
          <span style={{marginRight:12,color:'var(--text3)',fontSize:13}}>
            {eventsForDate(selected).length} אירועים
          </span>
          <button className="btn-ghost" style={{fontSize:12,height:28}} onClick={() => openAdd(selected)}>+ הוסף</button>
          <div className="selected-events">
            {eventsForDate(selected).map(e => (
              <div key={e.id} className="sel-event" style={{borderColor:e.color}}>
                <span className="sel-dot" style={{background:e.color}} />
                <span className="sel-time">{e.all_day?'כל היום':e.start_time||''}</span>
                <span className="sel-title">{e.title}</span>
                {e.url && <a href={e.url} target="_blank" className="sel-meet">🎥</a>}
                {e.location && <span className="sel-loc">📍 {e.location}</span>}
                {!e.google_id && <button className="sel-del" onClick={()=>deleteEvent(e.id)}>✕</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main view */}
      <div className="cal-main">
        {view === 'month' && <MonthView />}
        {view === 'week' && <WeekView />}
        {view === 'day' && <DayView />}
        {view === 'agenda' && <AgendaView />}
      </div>

      {/* Add/Edit Modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && closeForm()}>
          <div className="modal-card card fade-in" style={{maxWidth:520}}>
            <div className="modal-header">
              <h3>{editEvent ? 'עריכת אירוע' : 'אירוע חדש'}</h3>
              <button className="modal-close" onClick={closeForm}>✕</button>
            </div>
            <div className="modal-form" style={{gap:14}}>

              <div className="mfield">
                <label>כותרת *</label>
                <input className="form-input" value={fTitle} onChange={e=>setFTitle(e.target.value)}
                       placeholder="שם האירוע" autoFocus />
              </div>

              <div className="mfield">
                <label>תאריך</label>
                <input className="form-input" type="date" value={fDate} onChange={e=>setFDate(e.target.value)} />
              </div>

              <div className="mfield">
                <label><input type="checkbox" checked={fAllDay} onChange={e=>setFAllDay(e.target.checked)} style={{marginLeft:6}} />כל היום</label>
              </div>

              {!fAllDay && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div className="mfield">
                    <label>שעת התחלה</label>
                    <input className="form-input" type="time" value={fStartTime} onChange={e=>setFStartTime(e.target.value)} />
                  </div>
                  <div className="mfield">
                    <label>שעת סיום</label>
                    <input className="form-input" type="time" value={fEndTime} onChange={e=>setFEndTime(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="mfield">
                <label>קטגוריה</label>
                <select className="form-input" value={fCat} onChange={e=>setFCat(e.target.value)}>
                  {Object.entries(CAT_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              <div className="mfield">
                <label>חזרה</label>
                <select className="form-input" value={fRecurring} onChange={e=>setFRecurring(e.target.value as any)}>
                  <option value="none">ללא חזרה</option>
                  <option value="daily">יומי</option>
                  <option value="weekly">שבועי</option>
                  <option value="monthly">חודשי</option>
                  <option value="yearly">שנתי</option>
                </select>
              </div>

              {fRecurring !== 'none' && (
                <div className="mfield">
                  <label>חזרה עד (אופציונלי)</label>
                  <input className="form-input" type="date" value={fRecurringUntil} onChange={e=>setFRecurringUntil(e.target.value)} />
                </div>
              )}

              <div className="mfield">
                <label>מיקום</label>
                <input className="form-input" value={fLocation} onChange={e=>setFLocation(e.target.value)} placeholder="כתובת / מיקום" />
              </div>

              <div className="mfield">
                <label>קישור Zoom / Meet</label>
                <input className="form-input" value={fUrl} onChange={e=>setFUrl(e.target.value)} placeholder="https://zoom.us/..." />
              </div>

              <div className="mfield">
                <label>תזכורת</label>
                <select className="form-input" value={fReminder} onChange={e=>setFReminder(Number(e.target.value))}>
                  <option value={0}>בזמן האירוע</option>
                  <option value={10}>10 דקות לפני</option>
                  <option value={15}>15 דקות לפני</option>
                  <option value={30}>30 דקות לפני</option>
                  <option value={60}>שעה לפני</option>
                  <option value={1440}>יום לפני</option>
                </select>
              </div>

              <div className="mfield">
                <label>הערות</label>
                <textarea className="form-input" rows={3} style={{height:'auto',padding:'10px 14px'}}
                  value={fDescription} onChange={e=>setFDescription(e.target.value)} placeholder="תיאור / הערות..." />
              </div>

              <div className="modal-actions">
                {editEvent && <button className="btn-ghost" style={{color:'var(--red)'}} onClick={()=>{deleteEvent(editEvent.id);closeForm()}}>מחק</button>}
                <button className="btn-ghost" onClick={closeForm}>ביטול</button>
                <button className="btn-gold" onClick={saveEvent}>שמור</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
