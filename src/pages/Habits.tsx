import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { format, subDays, eachDayOfInterval, startOfDay } from 'date-fns'
import { he } from 'date-fns/locale'
import './Habits.css'

interface Habit { id: string; user_id: string; name: string; emoji: string; color: string; active: boolean }
interface HabitLog { id: string; habit_id: string; date: string }

const EMOJIS = ['💪', '📚', '🧘', '🏃', '💧', '🥗', '☀️', '🙏', '📞', '💊', '🛌', '✍️', '🎯', '❤️']
const COLORS = ['#10B981','#3B82F6','#8B5CF6','#EF4444','#F59E0B','#14B8A6','#EC4899','#F5C842']

export default function Habits({ user }: { user: User }) {
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<HabitLog[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [hName, setHName] = useState('')
  const [hEmoji, setHEmoji] = useState('💪')
  const [hColor, setHColor] = useState('#10B981')
  const [saving, setSaving] = useState(false)

  const today = format(new Date(), 'yyyy-MM-dd')
  const last30 = eachDayOfInterval({ start: subDays(new Date(), 29), end: new Date() }).map(d => format(d, 'yyyy-MM-dd'))

  const load = useCallback(async () => {
    const { data: h } = await supabase.from('habits').select('*').eq('user_id', user.id).eq('active', true)
    const { data: l } = await supabase.from('habit_logs').select('*').eq('user_id', user.id).gte('date', format(subDays(new Date(), 30), 'yyyy-MM-dd'))
    setHabits(h || [])
    setLogs(l || [])
  }, [user.id])

  useEffect(() => { load() }, [load])

  const toggleHabit = async (habitId: string) => {
    const existing = logs.find(l => l.habit_id === habitId && l.date === today)
    if (existing) {
      await supabase.from('habit_logs').delete().eq('id', existing.id)
      setLogs(p => p.filter(l => l.id !== existing.id))
    } else {
      const { data, error } = await supabase.from('habit_logs').insert({ habit_id: habitId, user_id: user.id, date: today }).select().single()
      if (!error && data) setLogs(p => [...p, data])
    }
  }

  const addHabit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hName) return
    setSaving(true)
    const { data, error } = await supabase.from('habits').insert({ user_id: user.id, name: hName, emoji: hEmoji, color: hColor, active: true }).select().single()
    if (!error && data) setHabits(p => [...p, data])
    setSaving(false)
    setShowAdd(false)
    setHName('')
  }

  const isLogged = (habitId: string, date: string) => logs.some(l => l.habit_id === habitId && l.date === date)

  const getStreak = (habitId: string) => {
    let streak = 0
    for (let i = 0; i < 365; i++) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd')
      if (isLogged(habitId, d)) streak++
      else break
    }
    return streak
  }

  const todayDone = habits.filter(h => isLogged(h.id, today)).length
  const completionPct = habits.length > 0 ? Math.round((todayDone / habits.length) * 100) : 0

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{ color: 'var(--m-habits)' }}>◎</span> הרגלים</h1>
          <p className="module-sub">{todayDone}/{habits.length} הושלמו היום</p>
        </div>
        <button className="btn-gold" onClick={() => setShowAdd(true)}>+ הרגל</button>
      </div>

      {/* Today progress ring */}
      <div className="habits-today-card card">
        <div className="habits-ring">
          <svg viewBox="0 0 80 80" width="80" height="80">
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--surface3)" strokeWidth="6" />
            <circle cx="40" cy="40" r="34" fill="none" stroke="var(--m-habits)" strokeWidth="6"
              strokeDasharray={`${2 * Math.PI * 34 * completionPct / 100} ${2 * Math.PI * 34}`}
              strokeLinecap="round" transform="rotate(-90 40 40)"
              style={{ transition: 'stroke-dasharray 0.6s ease' }} />
            <text x="40" y="44" textAnchor="middle" fill="var(--text)" fontSize="16" fontWeight="800">{completionPct}%</text>
          </svg>
        </div>
        <div className="habits-today-info">
          <div className="habits-today-title">היום — {format(new Date(), 'EEEE d בMMMM', { locale: he })}</div>
          <div className="habits-today-sub">{todayDone} מתוך {habits.length} הרגלים הושלמו</div>
          {completionPct === 100 && <div className="habits-streak-badge">🔥 כל ההרגלים הושלמו!</div>}
        </div>
      </div>

      {/* Habit list */}
      <div className="habits-list">
        {habits.map(h => {
          const done = isLogged(h.id, today)
          const streak = getStreak(h.id)
          return (
            <div key={h.id} className={`habit-card card ${done ? 'habit-done' : ''}`}>
              <button className="habit-check" style={done ? { background: h.color + '22', borderColor: h.color } : {}} onClick={() => toggleHabit(h.id)}>
                {done && <span style={{ color: h.color }}>✓</span>}
              </button>
              <div className="habit-emoji" style={{ background: h.color + '18' }}>{h.emoji}</div>
              <div className="habit-info">
                <div className="habit-name" style={done ? { color: 'var(--text3)', textDecoration: 'line-through' } : {}}>{h.name}</div>
                {streak > 0 && <div className="habit-streak" style={{ color: h.color }}>🔥 {streak} ימים רצוף</div>}
              </div>

              {/* Mini calendar */}
              <div className="habit-mini-cal">
                {last30.slice(-14).map(d => (
                  <div key={d} className="habit-mini-dot"
                    style={{ background: isLogged(h.id, d) ? h.color : 'var(--surface3)' }}
                    title={d} />
                ))}
              </div>
            </div>
          )
        })}
        {habits.length === 0 && (
          <div className="tasks-empty">
            <div style={{ fontSize: 36, marginBottom: 12 }}>◎</div>
            <p className="text-hint">אין הרגלים עדיין. הוסף הרגל ראשון.</p>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header"><h3>הרגל חדש</h3><button className="modal-close" onClick={() => setShowAdd(false)}>✕</button></div>
            <form onSubmit={addHabit} className="modal-form">
              <div className="mfield"><label>שם ההרגל</label><input className="form-input" value={hName} onChange={e => setHName(e.target.value)} placeholder="למשל: להניח תפילין" required /></div>
              <div className="mfield">
                <label>אמוג׳י</label>
                <div className="habit-emoji-picker">{EMOJIS.map(e => <button key={e} type="button" className={`habit-emoji-btn ${hEmoji===e?'selected':''}`} onClick={() => setHEmoji(e)}>{e}</button>)}</div>
              </div>
              <div className="mfield">
                <label>צבע</label>
                <div className="habit-color-picker">{COLORS.map(c => <button key={c} type="button" className={`habit-color-btn ${hColor===c?'selected':''}`} style={{ background: c }} onClick={() => setHColor(c)} />)}</div>
              </div>
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
