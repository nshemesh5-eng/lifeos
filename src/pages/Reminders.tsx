import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { format, addDays } from 'date-fns'
import { he } from 'date-fns/locale'
import './Reminders.css'

interface Reminder {
  id: string; title: string; time_of_day: string; frequency: string
  day_of_week: number; day_of_month: number; active: boolean
  category: string; emoji?: string; description?: string
  last_triggered?: string; created_at: string; snooze_until?: string
}

const FREQ_LABELS: Record<string, string> = {
  once: 'חד פעמי', daily: 'כל יום', weekly: 'כל שבוע', monthly: 'כל חודש', workdays: 'ימי עבודה'
}
const DAYS_HE = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת']

const PRESETS = [
  { title: 'שתיית מים', time_of_day: '08:00', frequency: 'daily', emoji: '💧', category: 'health', description: 'לפחות 8 כוסות מים ביום' },
  { title: 'אימון ספורט', time_of_day: '07:00', frequency: 'daily', emoji: '💪', category: 'health' },
  { title: 'התקשר להורים', time_of_day: '19:00', frequency: 'weekly', emoji: '📞', category: 'family', day_of_week: 5 },
  { title: 'בדיקת השקעות', time_of_day: '09:00', frequency: 'monthly', emoji: '📈', category: 'finance', day_of_month: 1 },
  { title: 'קריאה לפני שינה', time_of_day: '22:00', frequency: 'daily', emoji: '📚', category: 'growth' },
  { title: 'מדיטציה', time_of_day: '07:30', frequency: 'daily', emoji: '🧘', category: 'spirit' },
  { title: 'גיבוי מסמכים', time_of_day: '10:00', frequency: 'monthly', emoji: '💾', category: 'work', day_of_month: 28 },
  { title: 'ניקיון שבועי', time_of_day: '10:00', frequency: 'weekly', emoji: '🧹', category: 'home', day_of_week: 6 },
  { title: 'עדכון תוכנות', time_of_day: '20:00', frequency: 'monthly', emoji: '🔄', category: 'work', day_of_month: 15 },
  { title: 'שלם חשבונות', time_of_day: '10:00', frequency: 'monthly', emoji: '💳', category: 'finance', day_of_month: 5 },
  { title: 'ביקור רופא שיניים', time_of_day: '09:00', frequency: 'monthly', emoji: '🦷', category: 'health', day_of_month: 1 },
  { title: 'ארוחה משפחתית', time_of_day: '18:00', frequency: 'weekly', emoji: '🍽️', category: 'family', day_of_week: 5 },
]

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  spirit:  { label: 'רוחני',   color: '#9F7AFF' },
  family:  { label: 'משפחה',   color: '#EC4899' },
  finance: { label: 'פיננסי',  color: '#F5C842' },
  health:  { label: 'בריאות',  color: '#10B981' },
  growth:  { label: 'צמיחה',   color: '#3B82F6' },
  work:    { label: 'עבודה',   color: '#F59E0B' },
  home:    { label: 'בית',     color: '#06B6D4' },
  other:   { label: 'אחר',     color: '#6B7280' },
}

function isReminderDueToday(r: Reminder): boolean {
  const now = new Date()
  const dow = now.getDay() // 0=Sun
  const dom = now.getDate()
  if (r.frequency === 'daily') return true
  if (r.frequency === 'workdays') return dow >= 0 && dow <= 4
  if (r.frequency === 'weekly') return r.day_of_week === dow
  if (r.frequency === 'monthly') return r.day_of_month === dom
  return false
}

function nextOccurrence(r: Reminder): string {
  const now = new Date()
  if (r.frequency === 'daily' || r.frequency === 'workdays') {
    const [h,m] = r.time_of_day.split(':').map(Number)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m)
    if (today > now) return 'היום ' + r.time_of_day
    const tom = addDays(today, 1)
    return format(tom, 'EEE d/M', {locale:he}) + ' ' + r.time_of_day
  }
  if (r.frequency === 'weekly') {
    const dow = now.getDay()
    const diff = ((r.day_of_week - dow) + 7) % 7 || 7
    const next = addDays(now, diff)
    return format(next, 'EEE d/M', {locale:he}) + ' ' + r.time_of_day
  }
  if (r.frequency === 'monthly') {
    const next = new Date(now.getFullYear(), now.getMonth(), r.day_of_month)
    if (next <= now) next.setMonth(next.getMonth()+1)
    return format(next, 'd/M', {locale:he}) + ' ' + r.time_of_day
  }
  return r.time_of_day
}

export default function Reminders({ user }: { user: User }) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [editR, setEditR] = useState<Reminder|null>(null)
  const [filter, setFilter] = useState<'all'|'daily'|'weekly'|'monthly'|'today'>('all')
  const [catFilter, setCatFilter] = useState('all')
  const [saving, setSaving] = useState(false)

  // Form
  const [fTitle, setFTitle] = useState('')
  const [fTime, setFTime] = useState('08:00')
  const [fFreq, setFFreq] = useState('daily')
  const [fDow, setFDow] = useState(0)
  const [fDom, setFDom] = useState(1)
  const [fCat, setFCat] = useState('other')
  const [fEmoji, setFEmoji] = useState('🔔')
  const [fDesc, setFDesc] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('reminders').select('*').eq('user_id', user.id).order('time_of_day')
    setReminders(data || [])
  }, [user.id])

  useEffect(() => { load() }, [load])

  const openAdd = (preset?: any) => {
    setEditR(null)
    setFTitle(preset?.title || '')
    setFTime(preset?.time_of_day || '08:00')
    setFFreq(preset?.frequency || 'daily')
    setFDow(preset?.day_of_week ?? 0)
    setFDom(preset?.day_of_month ?? 1)
    setFCat(preset?.category || 'other')
    setFEmoji(preset?.emoji || '🔔')
    setFDesc(preset?.description || '')
    setShowPresets(false)
    setShowAdd(true)
  }

  const openEdit = (r: Reminder) => {
    setEditR(r)
    setFTitle(r.title); setFTime(r.time_of_day); setFFreq(r.frequency)
    setFDow(r.day_of_week); setFDom(r.day_of_month); setFCat(r.category)
    setFEmoji(r.emoji || '🔔'); setFDesc(r.description || '')
    setShowAdd(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fTitle) return
    setSaving(true)
    const payload = { user_id: user.id, title: fTitle, time_of_day: fTime, frequency: fFreq,
                      day_of_week: fDow, day_of_month: fDom, active: true,
                      category: fCat, emoji: fEmoji, description: fDesc || null }
    if (editR) await supabase.from('reminders').update(payload).eq('id', editR.id)
    else await supabase.from('reminders').insert(payload)
    setSaving(false)
    load()
    setShowAdd(false)
  }

  const toggle = async (r: Reminder) => {
    await supabase.from('reminders').update({ active: !r.active }).eq('id', r.id)
    setReminders(prev => prev.map(x => x.id === r.id ? {...x, active: !r.active} : x))
  }

  const remove = async (id: string) => {
    await supabase.from('reminders').delete().eq('id', id)
    setReminders(prev => prev.filter(x => x.id !== id))
  }

  const snooze = async (r: Reminder) => {
    const until = new Date(Date.now() + 60*60*1000).toISOString() // snooze 1hr
    await supabase.from('reminders').update({ snooze_until: until }).eq('id', r.id)
    load()
  }

  // Filtered
  const filtered = reminders.filter(r => {
    if (filter === 'today' && !isReminderDueToday(r)) return false
    if (filter !== 'all' && filter !== 'today' && r.frequency !== filter) return false
    if (catFilter !== 'all' && r.category !== catFilter) return false
    return true
  })

  const dueToday = reminders.filter(r => r.active && isReminderDueToday(r))

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{color:'var(--m-reminders)'}}>🔔</span> תזכורות</h1>
          <p className="module-sub">{dueToday.length} תזכורות לפעיל היום</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn-ghost" onClick={() => setShowPresets(true)}>✨ הצעות</button>
          <button className="btn-gold" onClick={() => openAdd()}>+ תזכורת</button>
        </div>
      </div>

      {/* Today due strip */}
      {dueToday.length > 0 && (
        <div className="rem-today-strip">
          <div className="rem-today-title">📅 היום</div>
          <div className="rem-today-list">
            {dueToday.map(r => (
              <div key={r.id} className="rem-today-chip">
                <span>{r.emoji || '🔔'}</span>
                <span>{r.title}</span>
                <span style={{color:'var(--text3)',fontSize:11}}>{r.time_of_day}</span>
                <button className="rem-snooze" onClick={() => snooze(r)} title="דחה שעה">💤</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
        <div className="wo-tabs" style={{gap:4}}>
          {(['all','today','daily','weekly','monthly'] as const).map(f => (
            <button key={f} className={`wo-tab ${filter===f?'active':''}`} style={{fontSize:12,height:30,padding:'0 10px'}} onClick={() => setFilter(f)}>
              {f==='all'?'הכל':f==='today'?'היום':f==='daily'?'יומי':f==='weekly'?'שבועי':'חודשי'}
            </button>
          ))}
        </div>
        <select className="form-input" style={{height:30,width:'auto',fontSize:12,padding:'0 8px'}} value={catFilter} onChange={e=>setCatFilter(e.target.value)}>
          <option value="all">כל הקטגוריות</option>
          {Object.entries(CATEGORY_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="tasks-empty2">
          <div style={{fontSize:40,marginBottom:12}}>🔔</div>
          <p>אין תזכורות. לחץ "+ תזכורת" או "✨ הצעות" להתחיל.</p>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {filtered.map(r => {
            const catConf = CATEGORY_CONFIG[r.category] || CATEGORY_CONFIG.other
            const dueNow = r.active && isReminderDueToday(r)
            return (
              <div key={r.id} className={`rem-card card ${!r.active?'rem-inactive':''} ${dueNow?'rem-due':''}`}>
                <div className="rem-emoji">{r.emoji || '🔔'}</div>
                <div className="rem-body">
                  <div className="rem-title">{r.title}</div>
                  <div className="rem-meta">
                    <span className="cat-badge" style={{background:catConf.color+'22',color:catConf.color}}>{catConf.label}</span>
                    <span className="rem-freq">{FREQ_LABELS[r.frequency] || r.frequency}</span>
                    {r.frequency === 'weekly' && <span className="rem-detail">· יום {DAYS_HE[r.day_of_week]}</span>}
                    {r.frequency === 'monthly' && <span className="rem-detail">· יום {r.day_of_month} לחודש</span>}
                    <span className="rem-time">⏰ {r.time_of_day}</span>
                    <span className="rem-next" style={{color:'var(--text3)',fontSize:11}}>הבא: {nextOccurrence(r)}</span>
                  </div>
                  {r.description && <div className="rem-desc">{r.description}</div>}
                </div>
                <div className="rem-actions">
                  <label className="toggle-switch">
                    <input type="checkbox" checked={r.active} onChange={() => toggle(r)} />
                    <span className="toggle-track" />
                  </label>
                  <button className="task-btn-icon" onClick={() => snooze(r)} title="דחה שעה">💤</button>
                  <button className="task-btn-icon" onClick={() => openEdit(r)}>✏️</button>
                  <button className="task-btn-icon" style={{color:'var(--red)'}} onClick={() => remove(r.id)}>🗑</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Presets modal */}
      {showPresets && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowPresets(false)}>
          <div className="modal-card card fade-in" style={{maxWidth:560}}>
            <div className="modal-header"><h3>תזכורות מומלצות</h3><button className="modal-close" onClick={() => setShowPresets(false)}>✕</button></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,padding:'0 4px 4px'}}>
              {PRESETS.map((p,i) => {
                const already = reminders.some(r => r.title === p.title)
                return (
                  <button key={i} className={`preset-btn card ${already?'preset-done':''}`}
                    onClick={() => !already && openAdd(p)} disabled={already}>
                    <span className="preset-emoji">{p.emoji}</span>
                    <div className="preset-info">
                      <div className="preset-title">{p.title}</div>
                      <div className="preset-meta">{FREQ_LABELS[p.frequency]} · {p.time_of_day}</div>
                    </div>
                    {already && <span className="preset-check">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowAdd(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header">
              <h3>{editR ? 'עריכת תזכורת' : 'תזכורת חדשה'}</h3>
              <button className="modal-close" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <form className="modal-form" onSubmit={save}>
              <div className="mfield">
                <label>אמוג'י ושם</label>
                <div style={{display:'flex',gap:8}}>
                  <input className="form-input" style={{width:56}} value={fEmoji} onChange={e=>setFEmoji(e.target.value)} />
                  <input className="form-input" style={{flex:1}} value={fTitle} onChange={e=>setFTitle(e.target.value)} placeholder="שם התזכורת" autoFocus required />
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div className="mfield">
                  <label>שעה</label>
                  <input className="form-input" type="time" value={fTime} onChange={e=>setFTime(e.target.value)} />
                </div>
                <div className="mfield">
                  <label>תדירות</label>
                  <select className="form-input" value={fFreq} onChange={e=>setFFreq(e.target.value)}>
                    {Object.entries(FREQ_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              {fFreq === 'weekly' && (
                <div className="mfield">
                  <label>יום בשבוע</label>
                  <select className="form-input" value={fDow} onChange={e=>setFDow(Number(e.target.value))}>
                    {DAYS_HE.map((d,i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
              )}
              {fFreq === 'monthly' && (
                <div className="mfield">
                  <label>יום בחודש</label>
                  <input className="form-input" type="number" min={1} max={28} value={fDom} onChange={e=>setFDom(Number(e.target.value))} />
                </div>
              )}
              <div className="mfield">
                <label>קטגוריה</label>
                <select className="form-input" value={fCat} onChange={e=>setFCat(e.target.value)}>
                  {Object.entries(CATEGORY_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div className="mfield">
                <label>הערה (אופציונלי)</label>
                <textarea className="form-input" rows={2} style={{height:'auto',padding:'10px 14px'}} value={fDesc} onChange={e=>setFDesc(e.target.value)} placeholder="תיאור קצר..." />
              </div>
              <div className="modal-actions">
                {editR && <button type="button" className="btn-ghost" style={{color:'var(--red)'}} onClick={() => { remove(editR.id); setShowAdd(false) }}>מחק</button>}
                <button type="button" className="btn-ghost" onClick={() => setShowAdd(false)}>ביטול</button>
                <button type="submit" className="btn-gold" disabled={saving}>{saving?'שומר...':'שמור'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
