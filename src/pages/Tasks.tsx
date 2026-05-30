import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { format } from 'date-fns'
import './Tasks.css'

interface Task {
  id: string; title: string; description: string; category: string
  priority: string; done: boolean; due_date: string; created_at: string
}

const CATS = [
  { id: 'all',      label: 'הכל',     color: 'var(--text2)',   emoji: '◎' },
  { id: 'work',     label: 'עבודה',   color: 'var(--blue)',    emoji: '💼' },
  { id: 'personal', label: 'אישי',    color: 'var(--purple)',  emoji: '🏠' },
  { id: 'health',   label: 'בריאות',  color: 'var(--green)',   emoji: '💪' },
  { id: 'finance',  label: 'פיננסי',  color: 'var(--m-finance)', emoji: '₪' },
]

const PRIS = [
  { id: 'high',   label: 'דחוף',   color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
  { id: 'medium', label: 'בינוני', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' },
  { id: 'low',    label: 'נמוך',   color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
]

type View = 'list' | 'kanban' | 'calendar'

export default function Tasks({ user }: { user: User }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [filter, setFilter] = useState('all')
  const [view, setView] = useState<View>('list')
  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [cat, setCat] = useState('personal')
  const [pri, setPri] = useState('medium')
  const [due, setDue] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

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
    setSaving(false); setShowAdd(false); setTitle(''); setDesc(''); setDue('')
  }

  const toggle = async (id: string, done: boolean) => {
    await supabase.from('tasks').update({ done: !done }).eq('id', id)
    setTasks(p => p.map(t => t.id === id ? { ...t, done: !done } : t))
  }

  const remove = async (id: string) => {
    await supabase.from('tasks').delete().eq('id', id)
    setTasks(p => p.filter(t => t.id !== id))
  }

  const filtered = tasks
    .filter(t => filter === 'all' || t.category === filter)
    .filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()))

  const pending = filtered.filter(t => !t.done).sort((a, b) => {
    const po: Record<string, number> = { high: 0, medium: 1, low: 2 }
    return (po[a.priority] ?? 1) - (po[b.priority] ?? 1)
  })
  const done = filtered.filter(t => t.done)

  // Stats
  const totalPending = tasks.filter(t => !t.done).length
  const totalDone = tasks.filter(t => t.done).length
  const urgent = tasks.filter(t => !t.done && t.priority === 'high').length
  const todayDue = tasks.filter(t => !t.done && t.due_date === format(new Date(), 'yyyy-MM-dd')).length

  // Kanban columns
  const kanbanCols = [
    { id: 'todo',    label: '📋 לביצוע',  tasks: pending.filter(t => t.priority !== 'high') },
    { id: 'urgent',  label: '🔥 דחוף',    tasks: pending.filter(t => t.priority === 'high') },
    { id: 'done',    label: '✅ הושלם',   tasks: done.slice(0, 8) },
  ]

  const TaskCard = ({ t, compact = false }: { t: Task; compact?: boolean }) => {
    const catInfo = CATS.find(c => c.id === t.category) || CATS[0]
    const priInfo = PRIS.find(p => p.id === t.priority) || PRIS[1]
    const overdue = t.due_date && t.due_date < format(new Date(), 'yyyy-MM-dd') && !t.done
    return (
      <div className={`task-card2 card ${t.done ? 'task-done2' : ''} ${compact ? 'task-compact' : ''}`}>
        <button className={`task-check2 ${t.done ? 'checked' : ''}`}
          style={t.done ? { background: 'var(--green-dim)', borderColor: 'var(--green)' } : {}}
          onClick={() => toggle(t.id, t.done)}>
          {t.done && <span>✓</span>}
        </button>
        <div className="task-body2">
          <div className="task-title2" style={t.done ? { textDecoration: 'line-through', color: 'var(--text3)' } : {}}>{t.title}</div>
          {!compact && t.description && <div className="task-desc2">{t.description}</div>}
          <div className="task-meta2">
            <span className="task-tag" style={{ background: catInfo.color + '18', color: catInfo.color }}>{catInfo.emoji} {catInfo.label}</span>
            <span className="task-tag" style={{ background: priInfo.bg, color: priInfo.color }}>{priInfo.label}</span>
            {t.due_date && <span className="task-due2" style={{ color: overdue ? 'var(--red)' : 'var(--text3)' }}>
              {overdue ? '⚠️ ' : '⏰ '}{t.due_date}
            </span>}
          </div>
        </div>
        <button className="task-del2" onClick={() => remove(t.id)}>✕</button>
      </div>
    )
  }

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{ color: 'var(--m-tasks)' }}>☰</span> משימות</h1>
          <p className="module-sub">{totalPending} פתוחות · {totalDone} הושלמו</p>
        </div>
        <button className="btn-gold" onClick={() => setShowAdd(true)}>+ משימה</button>
      </div>

      {/* Stats row */}
      <div className="tasks-stats">
        <div className="tasks-stat card">
          <div className="tasks-stat-val" style={{ color: 'var(--m-tasks)' }}>{totalPending}</div>
          <div className="tasks-stat-label">פתוחות</div>
        </div>
        <div className="tasks-stat card">
          <div className="tasks-stat-val" style={{ color: 'var(--red)' }}>{urgent}</div>
          <div className="tasks-stat-label">דחופות</div>
        </div>
        <div className="tasks-stat card">
          <div className="tasks-stat-val" style={{ color: 'var(--amber)' }}>{todayDue}</div>
          <div className="tasks-stat-label">להיום</div>
        </div>
        <div className="tasks-stat card">
          <div className="tasks-stat-val" style={{ color: 'var(--green)' }}>{totalDone}</div>
          <div className="tasks-stat-label">הושלמו</div>
        </div>
      </div>

      {/* Controls */}
      <div className="tasks-controls">
        {/* Search */}
        <div className="tasks-search">
          <span>🔍</span>
          <input placeholder="חפש משימה..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        {/* Category filter */}
        <div className="tasks-filters2">
          {CATS.map(c => (
            <button key={c.id}
              className={`tasks-filter2 ${filter === c.id ? 'active' : ''}`}
              style={filter === c.id ? { borderColor: c.color, color: c.color, background: c.color + '12' } : {}}
              onClick={() => setFilter(c.id)}>
              {c.emoji} {c.label}
              <span className="tasks-filter-badge">
                {c.id === 'all' ? tasks.filter(t => !t.done).length : tasks.filter(t => t.category === c.id && !t.done).length}
              </span>
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="tasks-view-toggle">
          {(['list', 'kanban'] as View[]).map(v => (
            <button key={v} className={`tasks-view-btn ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
              {v === 'list' ? '≡ רשימה' : '⊞ Kanban'}
            </button>
          ))}
        </div>
      </div>

      {/* LIST VIEW */}
      {view === 'list' && (
        <div className="tasks-list2">
          {pending.length === 0 && done.length === 0 && (
            <div className="tasks-empty2">
              <div style={{ fontSize: 40, marginBottom: 12 }}>☰</div>
              <p>אין משימות{filter !== 'all' ? ' בקטגוריה זו' : ''}.</p>
              <button className="btn-ghost" style={{ marginTop: 12 }} onClick={() => setShowAdd(true)}>הוסף ראשונה +</button>
            </div>
          )}
          {pending.map(t => <TaskCard key={t.id} t={t} />)}
          {done.length > 0 && (
            <div className="tasks-done-section2">
              <div className="tasks-done-label">✅ הושלמו ({done.length})</div>
              {done.slice(0, 5).map(t => <TaskCard key={t.id} t={t} />)}
            </div>
          )}
        </div>
      )}

      {/* KANBAN VIEW */}
      {view === 'kanban' && (
        <div className="tasks-kanban">
          {kanbanCols.map(col => (
            <div key={col.id} className="kanban-col">
              <div className="kanban-col-header">
                <span>{col.label}</span>
                <span className="kanban-count">{col.tasks.length}</span>
              </div>
              <div className="kanban-cards">
                {col.tasks.map(t => <TaskCard key={t.id} t={t} compact />)}
                {col.tasks.length === 0 && (
                  <div className="kanban-empty">ריק</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal-card card fade-in" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>משימה חדשה</h3>
              <button className="modal-close" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <form onSubmit={addTask} className="modal-form">
              <div className="mfield"><label>כותרת</label><input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="מה צריך לעשות?" required /></div>
              <div className="mfield"><label>פירוט</label><input className="form-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="פרטים נוספים..." /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="mfield"><label>קטגוריה</label>
                  <select className="form-input" value={cat} onChange={e => setCat(e.target.value)}>
                    {CATS.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                  </select>
                </div>
                <div className="mfield"><label>עדיפות</label>
                  <select className="form-input" value={pri} onChange={e => setPri(e.target.value)}>
                    {PRIS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="mfield"><label>תאריך יעד</label><input className="form-input" type="date" value={due} onChange={e => setDue(e.target.value)} /></div>
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowAdd(false)}>ביטול</button>
                <button type="submit" className="btn-gold" disabled={saving}>{saving ? '...' : 'הוסף משימה'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
