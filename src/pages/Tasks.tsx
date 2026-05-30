import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import './Tasks.css'

interface Task { id: string; user_id: string; title: string; description: string; category: string; priority: string; done: boolean; due_date: string; created_at: string }

const CATS = [
  { id: 'all', label: 'הכל', color: 'var(--text2)' },
  { id: 'work', label: 'עבודה', color: 'var(--blue)' },
  { id: 'personal', label: 'אישי', color: 'var(--purple)' },
  { id: 'health', label: 'בריאות', color: 'var(--green)' },
  { id: 'finance', label: 'פיננסי', color: 'var(--m-finance)' },
]

const PRIORITIES = [
  { id: 'high', label: 'דחוף', color: 'var(--red)' },
  { id: 'medium', label: 'בינוני', color: 'var(--amber)' },
  { id: 'low', label: 'נמוך', color: 'var(--text3)' },
]

export default function Tasks({ user }: { user: User }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [cat, setCat] = useState('personal')
  const [pri, setPri] = useState('medium')
  const [due, setDue] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setTasks(data || [])
  }, [user.id])

  useEffect(() => { load() }, [load])

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title) return
    setSaving(true)
    const { data, error } = await supabase.from('tasks').insert({
      user_id: user.id, title, description: desc, category: cat, priority: pri, done: false, due_date: due || null
    }).select().single()
    if (!error && data) setTasks(p => [data, ...p])
    setSaving(false)
    setShowAdd(false)
    setTitle(''); setDesc(''); setDue('')
  }

  const toggle = async (id: string, done: boolean) => {
    await supabase.from('tasks').update({ done: !done }).eq('id', id)
    setTasks(p => p.map(t => t.id === id ? { ...t, done: !done } : t))
  }

  const remove = async (id: string) => {
    await supabase.from('tasks').delete().eq('id', id)
    setTasks(p => p.filter(t => t.id !== id))
  }

  const filtered = tasks.filter(t => filter === 'all' || t.category === filter)
  const pending = filtered.filter(t => !t.done)
  const done = filtered.filter(t => t.done)

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{ color: 'var(--m-tasks)' }}>☰</span> משימות</h1>
          <p className="module-sub">{pending.length} פתוחות · {done.length} הושלמו</p>
        </div>
        <button className="btn-gold" onClick={() => setShowAdd(true)}>+ משימה</button>
      </div>

      {/* Category filter */}
      <div className="tasks-filters">
        {CATS.map(c => (
          <button key={c.id} className={`tasks-filter-btn ${filter === c.id ? 'active' : ''}`}
            style={filter === c.id ? { borderColor: c.color, color: c.color, background: c.color + '15' } : {}}
            onClick={() => setFilter(c.id)}>
            {c.label}
            <span className="tasks-filter-count">
              {c.id === 'all' ? tasks.filter(t=>!t.done).length : tasks.filter(t=>t.category===c.id&&!t.done).length}
            </span>
          </button>
        ))}
      </div>

      {/* Pending tasks */}
      <div className="tasks-section">
        {pending.sort((a, b) => {
          const po = { high: 0, medium: 1, low: 2 }
          return (po[a.priority as keyof typeof po] || 1) - (po[b.priority as keyof typeof po] || 1)
        }).map(t => {
          const catInfo = CATS.find(c => c.id === t.category) || CATS[0]
          const priInfo = PRIORITIES.find(p => p.id === t.priority) || PRIORITIES[1]
          return (
            <div key={t.id} className="task-card card">
              <button className="task-check" onClick={() => toggle(t.id, t.done)} />
              <div className="task-body">
                <div className="task-title">{t.title}</div>
                {t.description && <div className="task-desc">{t.description}</div>}
                <div className="task-meta">
                  <span className="badge" style={{ background: catInfo.color + '15', color: catInfo.color }}>{catInfo.label}</span>
                  <span className="badge" style={{ background: priInfo.color + '15', color: priInfo.color }}>{priInfo.label}</span>
                  {t.due_date && <span className="task-due">⏰ {t.due_date}</span>}
                </div>
              </div>
              <button className="task-del" onClick={() => remove(t.id)}>✕</button>
            </div>
          )
        })}
        {pending.length === 0 && (
          <div className="tasks-empty">
            <div className="tasks-empty-icon" style={{ color: 'var(--m-tasks)' }}>☰</div>
            <p>אין משימות פתוחות{filter !== 'all' ? ' בקטגוריה זו' : ''}.</p>
          </div>
        )}
      </div>

      {/* Done tasks */}
      {done.length > 0 && (
        <div className="tasks-done-section">
          <div className="tasks-done-title">הושלמו ({done.length})</div>
          {done.slice(0, 5).map(t => (
            <div key={t.id} className="task-card task-done card">
              <button className="task-check task-check-done" onClick={() => toggle(t.id, t.done)}>✓</button>
              <div className="task-body"><div className="task-title">{t.title}</div></div>
              <button className="task-del" onClick={() => remove(t.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header"><h3>משימה חדשה</h3><button className="modal-close" onClick={() => setShowAdd(false)}>✕</button></div>
            <form onSubmit={addTask} className="modal-form">
              <div className="mfield"><label>כותרת</label><input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="מה צריך לעשות?" required /></div>
              <div className="mfield"><label>פירוט (אופציונלי)</label><input className="form-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="פרטים נוספים..." /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="mfield"><label>קטגוריה</label>
                  <select className="form-input" value={cat} onChange={e => setCat(e.target.value)}>
                    {CATS.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div className="mfield"><label>עדיפות</label>
                  <select className="form-input" value={pri} onChange={e => setPri(e.target.value)}>
                    {PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="mfield"><label>תאריך יעד</label><input className="form-input" type="date" value={due} onChange={e => setDue(e.target.value)} /></div>
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowAdd(false)}>ביטול</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? '...' : 'הוסף'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
