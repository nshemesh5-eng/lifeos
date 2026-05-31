import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import './Reminders.css'

interface Reminder {
  id: string; title: string; time_of_day: string; frequency: string
  day_of_week: number; day_of_month: number; active: boolean; created_at: string
}

const FREQ_LABELS: Record<string, string> = {
  daily: 'כל יום', weekly: 'כל שבוע', monthly: 'כל חודש'
}
const DAYS_HE = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת']

const PRESETS = [
  { title: 'להניח תפילין', time_of_day: '07:30', frequency: 'daily',   emoji: '🙏', category: 'spirit' },
  { title: 'התקשר לאמא', time_of_day: '19:00', frequency: 'weekly',   emoji: '📞', category: 'family', day_of_week: 5 },
  { title: 'בדיקת השקעות', time_of_day: '09:00', frequency: 'monthly', emoji: '📈', category: 'finance', day_of_month: 1 },
  { title: 'שתיית מים', time_of_day: '08:00', frequency: 'daily',   emoji: '💧', category: 'health' },
  { title: 'קריאה לפני שינה', time_of_day: '22:00', frequency: 'daily',   emoji: '📚', category: 'growth' },
  { title: 'גיבוי מסמכים', time_of_day: '10:00', frequency: 'monthly', emoji: '💾', category: 'work', day_of_month: 28 },
]

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  spirit:  { label: 'רוחני',   color: '#9F7AFF' },
  family:  { label: 'משפחה',   color: '#EC4899' },
  finance: { label: 'פיננסי',  color: '#F5C842' },
  health:  { label: 'בריאות',  color: '#10B981' },
  growth:  { label: 'צמיחה',   color: '#3B82F6' },
  work:    { label: 'עבודה',   color: '#F59E0B' },
  other:   { label: 'אחר',     color: '#6B7280' },
}

export default function Reminders({ user }: { user: User }) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('08:00')
  const [freq, setFreq] = useState('daily')
  const [dow, setDow] = useState(0)
  const [dom, setDom] = useState(1)
  const [category, setCategory] = useState('other')
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all'|'daily'|'weekly'|'monthly'>('all')

  const load = useCallback(async () => {
    const { data } = await supabase.from('reminders').select('*').eq('user_id', user.id).order('time_of_day')
    setReminders(data || [])
  }, [user.id])

  useEffect(() => { load() }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title) return
    setSaving(true)
    const { data, error } = await supabase.from('reminders').insert({
      user_id: user.id, title, time_of_day: time, frequency: freq,
      day_of_week: dow, day_of_month: dom, active: true
    }).select().single()
    if (!error && data) setReminders(p => [...p, data].sort((a,b) => a.time_of_day.localeCompare(b.time_of_day)))
    setSaving(false); setShowAdd(false); setTitle('')
  }

  const addPreset = async (p: typeof PRESETS[0]) => {
    const { data, error } = await supabase.from('reminders').insert({
      user_id: user.id, title: p.title, time_of_day: p.time_of_day,
      frequency: p.frequency, day_of_week: p.day_of_week ?? 0,
      day_of_month: p.day_of_month ?? 1, active: true
    }).select().single()
    if (!error && data) setReminders(p => [...p, data].sort((a,b) => a.time_of_day.localeCompare(b.time_of_day)))
  }

  const toggle = async (id: string, active: boolean) => {
    await supabase.from('reminders').update({ active: !active }).eq('id', id)
    setReminders(p => p.map(r => r.id === id ? { ...r, active: !active } : r))
  }

  const remove = async (id: string) => {
    await supabase.from('reminders').delete().eq('id', id)
    setReminders(p => p.filter(r => r.id !== id))
  }

  const filtered = filter === 'all' ? reminders : reminders.filter(r => r.frequency === filter)
  const active = filtered.filter(r => r.active)
  const inactive = filtered.filter(r => !r.active)

  // Today's schedule
  const now = new Date()
  const todayDow = now.getDay()
  const todayDom = now.getDate()
  const todaySchedule = reminders.filter(r => {
    if (!r.active) return false
    if (r.frequency === 'daily') return true
    if (r.frequency === 'weekly' && r.day_of_week === todayDow) return true
    if (r.frequency === 'monthly' && r.day_of_month === todayDom) return true
    return false
  }).sort((a,b) => a.time_of_day.localeCompare(b.time_of_day))

  const freqLabel = (r: Reminder) => {
    if (r.frequency === 'daily') return 'כל יום'
    if (r.frequency === 'weekly') return `כל ${DAYS_HE[r.day_of_week]}`
    if (r.frequency === 'monthly') return `${r.day_of_month} לחודש`
    return r.frequency
  }

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{ color: 'var(--m-remind)' }}>◷</span> תזכורות</h1>
          <p className="module-sub">{reminders.filter(r=>r.active).length} פעילות · {todaySchedule.length} היום</p>
        </div>
        <button className="btn-gold" onClick={() => setShowAdd(true)}>+ תזכורת</button>
      </div>

      {/* Today timeline */}
      {todaySchedule.length > 0 && (
        <div className="card remind-today">
          <div className="remind-today-title">
            📅 היום — {format(now, 'EEEE d בMMMM', { locale: he })}
          </div>
          <div className="remind-timeline">
            {todaySchedule.map(r => {
              const [h, m] = r.time_of_day.split(':').map(Number)
              const isPast = h < now.getHours() || (h === now.getHours() && m < now.getMinutes())
              return (
                <div key={r.id} className={`remind-tl-item ${isPast ? 'past' : ''}`}>
                  <div className="remind-tl-time">{r.time_of_day}</div>
                  <div className="remind-tl-dot" style={{ background: isPast ? 'var(--text3)' : 'var(--m-remind)' }} />
                  <div className="remind-tl-text">{r.title}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Presets — show only if no reminders */}
      {reminders.length === 0 && (
        <div className="remind-presets-section">
          <div className="remind-section-label">הוסף במהירות</div>
          <div className="remind-presets-grid">
            {PRESETS.map(p => (
              <button key={p.title} className="remind-preset card card-hover" onClick={() => addPreset(p)}>
                <span className="remind-preset-emoji">{p.emoji}</span>
                <div>
                  <div className="remind-preset-title">{p.title}</div>
                  <div className="remind-preset-sub">{p.time_of_day} · {FREQ_LABELS[p.frequency]}</div>
                </div>
                <span className="remind-preset-plus">+</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="remind-filters">
        {(['all','daily','weekly','monthly'] as const).map(f => (
          <button key={f} className={`remind-filter-btn ${filter===f?'active':''}`} onClick={() => setFilter(f)}>
            {f==='all'?'הכל':f==='daily'?'יומי':f==='weekly'?'שבועי':'חודשי'}
            <span className="remind-filter-count">
              {f==='all' ? reminders.length : reminders.filter(r=>r.frequency===f).length}
            </span>
          </button>
        ))}
      </div>

      {/* Active reminders */}
      <div className="remind-list">
        {active.map(r => (
          <div key={r.id} className="remind-card card">
            <div className="remind-card-time">{r.time_of_day}</div>
            <div className="remind-card-body">
              <div className="remind-card-title">{r.title}</div>
              <div className="remind-card-freq">{freqLabel(r)}</div>
            </div>
            <div className="remind-card-actions">
              <button className="remind-toggle on" onClick={() => toggle(r.id, r.active)} title="השהה">⏸</button>
              <button className="task-del2" onClick={() => remove(r.id)}>✕</button>
            </div>
          </div>
        ))}

        {inactive.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="remind-section-label">מושהות</div>
            {inactive.map(r => (
              <div key={r.id} className="remind-card card" style={{ opacity: 0.45 }}>
                <div className="remind-card-time">{r.time_of_day}</div>
                <div className="remind-card-body">
                  <div className="remind-card-title">{r.title}</div>
                  <div className="remind-card-freq">{freqLabel(r)}</div>
                </div>
                <div className="remind-card-actions">
                  <button className="remind-toggle off" onClick={() => toggle(r.id, r.active)} title="הפעל">▶</button>
                  <button className="task-del2" onClick={() => remove(r.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <div className="tasks-empty2">
            <div style={{ fontSize: 36, marginBottom: 12 }}>◷</div>
            <p>אין תזכורות. הוסף תזכורת ושמשון יזכיר לך.</p>
            <button className="btn-ghost" style={{ marginTop: 12 }} onClick={() => setShowAdd(true)}>הוסף ראשונה</button>
          </div>
        )}
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header">
              <h3>תזכורת חדשה</h3>
              <button className="modal-close" onClick={() => setShowAdd(false)}>✕</button>
            </div>

            {/* Quick presets in modal */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>מהיר</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {PRESETS.map(p => (
                  <button key={p.title} style={{
                    padding: '4px 10px', borderRadius: 99, fontSize: 12,
                    background: 'var(--surface2)', border: '0.5px solid var(--border)',
                    color: 'var(--text2)', cursor: 'pointer'
                  }} onClick={() => { addPreset(p); setShowAdd(false) }}>
                    {p.emoji} {p.title}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={add} className="modal-form">
              <div className="mfield"><label>תיאור</label>
                <input className="form-input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="מה תרצה לזכור?" required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="mfield"><label>שעה</label>
                  <input className="form-input" type="time" value={time} onChange={e=>setTime(e.target.value)} />
                </div>
                <div className="mfield"><label>תדירות</label>
                  <select className="form-input" value={freq} onChange={e=>setFreq(e.target.value)}>
                    <option value="daily">כל יום</option>
                    <option value="weekly">כל שבוע</option>
                    <option value="monthly">כל חודש</option>
                  </select>
                </div>
              </div>
              {freq === 'weekly' && (
                <div className="mfield"><label>יום בשבוע</label>
                  <select className="form-input" value={dow} onChange={e=>setDow(parseInt(e.target.value))}>
                    {DAYS_HE.map((d,i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
              {freq === 'monthly' && (
                <div className="mfield"><label>יום בחודש</label>
                  <select className="form-input" value={dom} onChange={e=>setDom(parseInt(e.target.value))}>
                    {Array.from({length:28},(_,i)=>i+1).map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowAdd(false)}>ביטול</button>
                <button type="submit" className="btn-gold" disabled={saving}>{saving?'...':'הוסף'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
