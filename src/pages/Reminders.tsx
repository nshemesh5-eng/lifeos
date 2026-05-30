import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import './Reminders.css'

interface Reminder { id: string; user_id: string; title: string; time_of_day: string; frequency: string; day_of_week: number; day_of_month: number; active: boolean }

const FREQ = [
  { id: 'daily', label: 'כל יום' },
  { id: 'weekly', label: 'כל שבוע' },
  { id: 'monthly', label: 'כל חודש' },
]

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

const PRESETS = [
  { title: 'להניח תפילין', time_of_day: '07:00', frequency: 'daily', emoji: '🙏' },
  { title: 'לבדוק מה שלום ההורים', time_of_day: '19:00', frequency: 'weekly', emoji: '📞' },
  { title: 'לבדוק את ההשקעות', time_of_day: '09:00', frequency: 'monthly', emoji: '📈' },
  { title: 'ארוחת בוקר', time_of_day: '08:00', frequency: 'daily', emoji: '🥗' },
  { title: 'שתיית מים', time_of_day: '12:00', frequency: 'daily', emoji: '💧' },
]

export default function Reminders({ user }: { user: User }) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('08:00')
  const [freq, setFreq] = useState('daily')
  const [dow, setDow] = useState(0)
  const [dom, setDom] = useState(1)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('reminders').select('*').eq('user_id', user.id).order('created_at')
    setReminders(data || [])
  }, [user.id])

  useEffect(() => { load() }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title) return
    setSaving(true)
    const { data, error } = await supabase.from('reminders').insert({
      user_id: user.id, title, time_of_day: time, frequency: freq, day_of_week: dow, day_of_month: dom, active: true
    }).select().single()
    if (!error && data) setReminders(p => [...p, data])
    setSaving(false); setShowAdd(false); setTitle('')
  }

  const addPreset = async (p: typeof PRESETS[0]) => {
    const { data, error } = await supabase.from('reminders').insert({
      user_id: user.id, title: p.title, time_of_day: p.time_of_day, frequency: p.frequency, day_of_week: 0, day_of_month: 1, active: true
    }).select().single()
    if (!error && data) setReminders(prev => [...prev, data])
  }

  const toggle = async (id: string, active: boolean) => {
    await supabase.from('reminders').update({ active: !active }).eq('id', id)
    setReminders(p => p.map(r => r.id === id ? { ...r, active: !active } : r))
  }

  const remove = async (id: string) => {
    await supabase.from('reminders').delete().eq('id', id)
    setReminders(p => p.filter(r => r.id !== id))
  }

  const freqLabel = (r: Reminder) => {
    if (r.frequency === 'daily') return 'כל יום'
    if (r.frequency === 'weekly') return `כל ${DAYS[r.day_of_week]}`
    if (r.frequency === 'monthly') return `${r.day_of_month} לחודש`
    return r.frequency
  }

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{ color: 'var(--m-remind)' }}>◷</span> תזכורות</h1>
          <p className="module-sub">{reminders.filter(r=>r.active).length} פעילות</p>
        </div>
        <button className="btn-gold" onClick={() => setShowAdd(true)}>+ תזכורת</button>
      </div>

      {/* Presets */}
      {reminders.length === 0 && (
        <div className="remind-presets">
          <div className="remind-presets-title">תזכורות מוצעות</div>
          <div className="remind-presets-grid">
            {PRESETS.map(p => (
              <button key={p.title} className="remind-preset card card-hover" onClick={() => addPreset(p)}>
                <span className="remind-preset-emoji">{p.emoji}</span>
                <span className="remind-preset-title">{p.title}</span>
                <span className="remind-preset-freq">{p.time_of_day} · {FREQ.find(f=>f.id===p.frequency)?.label}</span>
                <span className="remind-preset-add">+</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active reminders */}
      <div className="remind-list">
        {reminders.map(r => (
          <div key={r.id} className={`remind-card card ${!r.active ? 'remind-inactive' : ''}`}>
            <div className="remind-card-left">
              <div className="remind-time">{r.time_of_day}</div>
              <div>
                <div className="remind-title">{r.title}</div>
                <div className="remind-freq">{freqLabel(r)}</div>
              </div>
            </div>
            <div className="remind-card-right">
              <button className={`remind-toggle ${r.active ? 'on' : 'off'}`} onClick={() => toggle(r.id, r.active)}>
                {r.active ? '⏸' : '▶'}
              </button>
              <button className="task-del" onClick={() => remove(r.id)}>✕</button>
            </div>
          </div>
        ))}
        {reminders.length === 0 && (
          <p className="text-hint" style={{ fontSize: 14, textAlign: 'center', padding: '32px 0' }}>הוסף תזכורות אישיות — שמשון יזכיר לך.</p>
        )}
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header"><h3>תזכורת חדשה</h3><button className="modal-close" onClick={() => setShowAdd(false)}>✕</button></div>
            <form onSubmit={add} className="modal-form">
              <div className="mfield"><label>תיאור</label><input className="form-input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="למשל: להתקשר לאמא" required /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="mfield"><label>שעה</label><input className="form-input" type="time" value={time} onChange={e=>setTime(e.target.value)} /></div>
                <div className="mfield"><label>תדירות</label>
                  <select className="form-input" value={freq} onChange={e=>setFreq(e.target.value)}>
                    {FREQ.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
              </div>
              {freq === 'weekly' && (
                <div className="mfield"><label>יום בשבוע</label>
                  <select className="form-input" value={dow} onChange={e=>setDow(parseInt(e.target.value))}>
                    {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
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
                <button type="submit" className="btn-primary" disabled={saving}>{saving?'...':'הוסף'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
