import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { format, subDays, eachDayOfInterval } from 'date-fns'
import { he } from 'date-fns/locale'
import './Habits.css'

interface Habit { id: string; name: string; emoji: string; color: string; active: boolean }
interface HabitLog { id: string; habit_id: string; date: string }

const EMOJIS = ['💪','📚','🧘','🏃','💧','🥗','☀️','🙏','📞','💊','🛌','✍️','🎯','❤️','🎵','🌿']
const COLORS = ['#10B981','#3B82F6','#8B5CF6','#EF4444','#F59E0B','#14B8A6','#EC4899','#F5C842','#FF8C5A','#6366F1']

export default function Habits({ user }: { user: User }) {
  const [habits, setHabits] = useState<Habit[]>([])
  const [logs, setLogs] = useState<HabitLog[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [hName, setHName] = useState('')
  const [hEmoji, setHEmoji] = useState('💪')
  const [hColor, setHColor] = useState('#10B981')
  const [tab, setTab] = useState<'today' | 'stats'>('today')
  const [saving, setSaving] = useState(false)

  const today = format(new Date(), 'yyyy-MM-dd')
  const last60 = eachDayOfInterval({ start: subDays(new Date(), 59), end: new Date() }).map(d => format(d, 'yyyy-MM-dd'))
  const last7 = last60.slice(-7)

  const load = useCallback(async () => {
    const { data: h } = await supabase.from('habits').select('*').eq('user_id', user.id).eq('active', true).order('created_at')
    const { data: l } = await supabase.from('habit_logs').select('*').eq('user_id', user.id).gte('date', format(subDays(new Date(), 60), 'yyyy-MM-dd'))
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
    setSaving(false); setShowAdd(false); setHName('')
  }

  const removeHabit = async (id: string) => {
    await supabase.from('habits').update({ active: false }).eq('id', id)
    setHabits(p => p.filter(h => h.id !== id))
  }

  const isLogged = (habitId: string, date: string) => logs.some(l => l.habit_id === habitId && l.date === date)

  const getStreak = (habitId: string) => {
    let streak = 0
    for (let i = 0; i < 60; i++) {
      if (isLogged(habitId, format(subDays(new Date(), i), 'yyyy-MM-dd'))) streak++
      else break
    }
    return streak
  }

  const getCompletionRate = (habitId: string, days = 30) => {
    const period = last60.slice(-days)
    const done = period.filter(d => isLogged(habitId, d)).length
    return Math.round((done / days) * 100)
  }

  const todayDone = habits.filter(h => isLogged(h.id, today)).length
  const pct = habits.length > 0 ? Math.round((todayDone / habits.length) * 100) : 0

  // Best streak ever per habit
  const getBestStreak = (habitId: string) => {
    let best = 0, cur = 0
    last60.forEach(d => {
      if (isLogged(habitId, d)) { cur++; if (cur > best) best = cur }
      else cur = 0
    })
    return best
  }

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{ color: 'var(--m-habits)' }}>◎</span> הרגלים</h1>
          <p className="module-sub">{todayDone}/{habits.length} היום · {pct}%</p>
        </div>
        <button className="btn-gold" onClick={() => setShowAdd(true)}>+ הרגל</button>
      </div>

      {/* Today ring + summary */}
      <div className="habits-hero card">
        <div className="habits-ring-wrap">
          <svg viewBox="0 0 100 100" width="100" height="100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--surface3)" strokeWidth="8" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--m-habits)" strokeWidth="8"
              strokeDasharray={`${2*Math.PI*42*pct/100} ${2*Math.PI*42}`}
              strokeLinecap="round" transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }} />
            <text x="50" y="46" textAnchor="middle" fontSize="18" fontWeight="900" fill="var(--text)">{pct}%</text>
            <text x="50" y="62" textAnchor="middle" fontSize="11" fill="var(--text3)">{todayDone}/{habits.length}</text>
          </svg>
        </div>
        <div className="habits-hero-info">
          <div className="habits-hero-date">{format(new Date(), 'EEEE, d בMMMM', { locale: he })}</div>
          {pct === 100 && <div className="habits-congrats">🔥 כל ההרגלים הושלמו היום!</div>}
          {pct === 0 && habits.length > 0 && <div className="habits-start">התחל את היום עם הרגלים 💪</div>}
          {/* Week overview */}
          <div className="habits-week">
            {last7.map(d => {
              const dayDone = habits.filter(h => isLogged(h.id, d)).length
              const dayPct = habits.length > 0 ? dayDone / habits.length : 0
              return (
                <div key={d} className="habits-week-day">
                  <div className="habits-week-bar-wrap">
                    <div className="habits-week-bar" style={{
                      height: `${dayPct * 40}px`,
                      background: dayPct === 1 ? 'var(--m-habits)' : dayPct > 0.5 ? '#14B8A680' : 'var(--surface3)'
                    }} />
                  </div>
                  <div className="habits-week-label">{format(new Date(d), 'EE', { locale: he }).slice(0, 1)}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="wo-tabs">
        <button className={`wo-tab ${tab==='today'?'active':''}`} onClick={() => setTab('today')}>היום</button>
        <button className={`wo-tab ${tab==='stats'?'active':''}`} onClick={() => setTab('stats')}>סטטס</button>
      </div>

      {/* Today tab */}
      {tab === 'today' && (
        <div className="habits-list2">
          {habits.map(h => {
            const done = isLogged(h.id, today)
            const streak = getStreak(h.id)
            const rate30 = getCompletionRate(h.id, 30)
            return (
              <div key={h.id} className={`habit-card2 card ${done ? 'habit-done2' : ''}`} onClick={() => toggleHabit(h.id)}>
                <div className="habit-check2" style={{ borderColor: done ? h.color : undefined, background: done ? h.color + '22' : undefined }}>
                  {done && <span style={{ color: h.color, fontSize: 16, fontWeight: 800 }}>✓</span>}
                </div>
                <div className="habit-emoji2" style={{ background: h.color + '18' }}>{h.emoji}</div>
                <div className="habit-info2">
                  <div className="habit-name2" style={done ? { color: 'var(--text3)', textDecoration: 'line-through' } : {}}>{h.name}</div>
                  <div className="habit-meta2">
                    {streak > 0 && <span style={{ color: h.color, fontWeight: 700, fontSize: 12 }}>🔥 {streak} ימים</span>}
                    <span style={{ color: 'var(--text3)', fontSize: 12 }}>{rate30}% החודש</span>
                  </div>
                </div>
                {/* Mini heatmap */}
                <div className="habit-mini-heat">
                  {last60.slice(-21).map(d => (
                    <div key={d} className="habit-heat-dot"
                      style={{ background: isLogged(h.id, d) ? h.color : 'var(--surface3)', opacity: isLogged(h.id, d) ? 1 : 0.3 }} />
                  ))}
                </div>
                <button className="task-del2" onClick={e => { e.stopPropagation(); removeHabit(h.id) }}>✕</button>
              </div>
            )
          })}
          {habits.length === 0 && (
            <div className="tasks-empty2">
              <div style={{ fontSize: 40, marginBottom: 12 }}>◎</div>
              <p>הוסף הרגלים שתרצה לעקוב אחריהם.</p>
              <button className="btn-ghost" style={{ marginTop: 12 }} onClick={() => setShowAdd(true)}>הוסף הרגל ראשון</button>
            </div>
          )}
        </div>
      )}

      {/* Stats tab — 60-day heatmap */}
      {tab === 'stats' && (
        <div className="habits-stats-grid">
          {habits.map(h => (
            <div key={h.id} className="habit-stat-card card">
              <div className="habit-stat-header">
                <div className="habit-emoji2" style={{ background: h.color + '18' }}>{h.emoji}</div>
                <div className="habit-stat-info">
                  <div className="habit-name2">{h.name}</div>
                  <div className="habit-meta2">
                    <span style={{ color: h.color, fontWeight: 700 }}>🔥 {getStreak(h.id)} streak</span>
                    <span style={{ color: 'var(--text3)' }}>שיא: {getBestStreak(h.id)}</span>
                  </div>
                </div>
                <div className="habit-stat-pct" style={{ color: h.color }}>{getCompletionRate(h.id, 30)}%</div>
              </div>
              {/* 60-day heatmap */}
              <div className="habit-heatmap-60">
                {last60.map(d => (
                  <div key={d} className="habit-heat-60"
                    style={{ background: isLogged(h.id, d) ? h.color : 'var(--surface3)', opacity: isLogged(h.id, d) ? 1 : 0.15 }}
                    title={d} />
                ))}
              </div>
              {/* Rate bars */}
              <div className="habit-rates">
                {[7, 30].map(days => (
                  <div key={days} className="habit-rate-row">
                    <span className="habit-rate-label">{days} ימים</span>
                    <div className="habit-rate-bar-wrap">
                      <div className="habit-rate-bar" style={{ width: `${getCompletionRate(h.id, Math.min(days, last60.length))}%`, background: h.color }} />
                    </div>
                    <span className="habit-rate-pct" style={{ color: h.color }}>{getCompletionRate(h.id, Math.min(days, last60.length))}%</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header"><h3>הרגל חדש</h3><button className="modal-close" onClick={() => setShowAdd(false)}>✕</button></div>
            <form onSubmit={addHabit} className="modal-form">
              <div className="mfield"><label>שם ההרגל</label><input className="form-input" value={hName} onChange={e => setHName(e.target.value)} placeholder="למשל: להניח תפילין" required /></div>
              <div className="mfield">
                <label>אמוג'י</label>
                <div className="habit-emoji-picker2">{EMOJIS.map(e => <button key={e} type="button" className={`habit-emoji-btn2 ${hEmoji===e?'selected':''}`} onClick={() => setHEmoji(e)}>{e}</button>)}</div>
              </div>
              <div className="mfield">
                <label>צבע</label>
                <div className="habit-color-picker2">{COLORS.map(c => <button key={c} type="button" className={`habit-color-btn2 ${hColor===c?'selected':''}`} style={{ background: c }} onClick={() => setHColor(c)} />)}</div>
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
