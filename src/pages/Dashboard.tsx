import { useState, useEffect, useCallback } from 'react'
import { format, subDays, eachDayOfInterval, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns'
import { he } from 'date-fns/locale'
import { LifeContext, getDailyBriefing } from '../lib/shimshon'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import './Dashboard.css'

interface Props {
  context: LifeContext
  onNavigate: (page: string) => void
  user: User
}

export default function Dashboard({ context, onNavigate, user }: Props) {
  const [briefing, setBriefing] = useState('')
  const [loadingBrief, setLoadingBrief] = useState(true)
  const [transactions, setTransactions] = useState<any[]>([])
  const [habits, setHabits] = useState<any[]>([])
  const [habitLogs, setHabitLogs] = useState<any[]>([])
  const [workouts, setWorkouts] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [reminders, setReminders] = useState<any[]>([])

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 5 ? 'לילה טוב' : hour < 12 ? 'בוקר טוב' : hour < 17 ? 'שלום' : hour < 21 ? 'ערב טוב' : 'לילה טוב'
  const today = format(now, 'yyyy-MM-dd')

  const load = useCallback(async () => {
    const ms = startOfMonth(now), me = endOfMonth(now)
    const last30 = format(subDays(now, 30), 'yyyy-MM-dd')

    const [tx, h, hl, w, t, r] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', user.id).gte('date', format(ms, 'yyyy-MM-dd')),
      supabase.from('habits').select('*').eq('user_id', user.id).eq('active', true),
      supabase.from('habit_logs').select('*').eq('user_id', user.id).gte('date', last30),
      supabase.from('workouts').select('*').eq('user_id', user.id).gte('date', last30),
      supabase.from('tasks').select('*').eq('user_id', user.id),
      supabase.from('reminders').select('*').eq('user_id', user.id).eq('active', true),
    ])
    setTransactions(tx.data || [])
    setHabits(h.data || [])
    setHabitLogs(hl.data || [])
    setWorkouts(w.data || [])
    setTasks(t.data || [])
    setReminders(r.data || [])
  }, [user.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    getDailyBriefing(context).then(b => { setBriefing(b); setLoadingBrief(false) })
  }, [])

  const fmt = (n: number) => '₪' + Math.abs(Math.round(n)).toLocaleString('he-IL')

  // Finance
  const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const balance = income - expenses
  const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0

  // Habits
  const todayHabits = habits.filter(h => habitLogs.some(l => l.habit_id === h.id && l.date === today))
  const habitPct = habits.length > 0 ? Math.round((todayHabits.length / habits.length) * 100) : 0

  // Workouts this month
  const workoutsThisMonth = workouts.filter(w => w.date >= format(startOfMonth(now), 'yyyy-MM-dd'))

  // Tasks
  const pendingTasks = tasks.filter(t => !t.done)
  const urgentTasks = pendingTasks.filter(t => t.priority === 'high')
  const taskDonePct = tasks.length > 0 ? Math.round((tasks.filter(t => t.done).length / tasks.length) * 100) : 0

  // Habit heatmap — last 35 days
  const heatmapDays = eachDayOfInterval({ start: subDays(now, 34), end: now })

  // Workout streak
  let workoutStreak = 0
  for (let i = 0; i < 30; i++) {
    const d = format(subDays(now, i), 'yyyy-MM-dd')
    if (workouts.some(w => w.date === d)) workoutStreak++
    else if (i > 0) break
  }

  // Today reminders
  const todayReminders = reminders.filter(r => r.frequency === 'daily')
  const weekday = now.getDay()
  const weeklyToday = reminders.filter(r => r.frequency === 'weekly' && r.day_of_week === weekday)
  const allTodayReminders = [...todayReminders, ...weeklyToday]

  // Expense breakdown pie (simplified bar chart)
  const expByCat: Record<string, number> = {}
  transactions.filter(t => t.type === 'expense').forEach(t => {
    expByCat[t.category] = (expByCat[t.category] || 0) + t.amount
  })
  const topCats = Object.entries(expByCat).sort((a, b) => b[1] - a[1]).slice(0, 4)

  const CAT_COLORS: Record<string, string> = {
    food: '#F59E0B', transport: '#3B82F6', housing: '#8B5CF6',
    entertainment: '#EF4444', health: '#10B981', subscriptions: '#9F7AFF',
    salary: '#10B981', other: '#6B7280'
  }
  const CAT_LABELS: Record<string, string> = {
    food:'אוכל', transport:'תחבורה', housing:'דיור', entertainment:'בידור',
    health:'בריאות', subscriptions:'מנויים', salary:'משכורת', other:'אחר'
  }

  return (
    <div className="dash2 fade-in">
      {/* Top greeting + date */}
      <div className="dash2-top">
        <div className="dash2-greeting">
          <span className="dash2-hey">{greeting},</span>
          <span className="dash2-name">{user.email?.split('@')[0]}</span>
        </div>
        <div className="dash2-date-row">
          <span className="dash2-date">{format(now, "EEEE, d בMMMM", { locale: he })}</span>
          {allTodayReminders.length > 0 && (
            <div className="dash2-remind-chip" onClick={() => onNavigate('reminders')}>
              <span>⏰</span> {allTodayReminders.length} תזכורות
            </div>
          )}
        </div>
      </div>

      {/* Shimshon briefing */}
      <div className="dash2-briefing">
        <div className="dash2-briefing-avatar">ש</div>
        <div className="dash2-briefing-body">
          <div className="dash2-briefing-label">שמשון · ברייפינג יומי</div>
          {loadingBrief
            ? <div className="skeleton" style={{ height: 16, width: '55%', marginTop: 4 }} />
            : <p>{briefing || 'הוסף נתונים כדי לקבל ברייפינג אישי.'}</p>}
        </div>
      </div>

      {/* KPI row */}
      <div className="dash2-kpis">
        {/* Finance */}
        <div className="dash2-kpi card card-hover" onClick={() => onNavigate('finance')}>
          <div className="dash2-kpi-icon" style={{ color: 'var(--m-finance)', background: 'var(--green-dim)' }}>₪</div>
          <div className="dash2-kpi-body">
            <div className="dash2-kpi-label">מאזן חודשי</div>
            <div className={`dash2-kpi-val ${balance >= 0 ? 'text-green' : 'text-red'}`}>
              {balance >= 0 ? '+' : ''}{fmt(balance)}
            </div>
            <div className="dash2-kpi-sub">חיסכון {savingsRate}%</div>
          </div>
          {/* Mini sparkline */}
          <svg className="dash2-spark" viewBox="0 0 60 30">
            <polyline fill="none" stroke={balance >= 0 ? 'var(--green)' : 'var(--red)'}
              strokeWidth="2" strokeLinecap="round"
              points={`0,${30 - Math.min(30, (income/Math.max(income+expenses,1))*30)} 20,${30 - Math.min(30,(income/Math.max(income+expenses,1))*28)} 40,${30 - Math.min(30,(income/Math.max(income+expenses,1))*25)} 60,${30 - Math.min(30,(balance >= 0 ? 20 : 10))}`} />
          </svg>
        </div>

        {/* Tasks */}
        <div className="dash2-kpi card card-hover" onClick={() => onNavigate('tasks')}>
          <div className="dash2-kpi-icon" style={{ color: 'var(--m-tasks)', background: 'var(--purple-dim)' }}>☰</div>
          <div className="dash2-kpi-body">
            <div className="dash2-kpi-label">משימות</div>
            <div className="dash2-kpi-val" style={{ color: 'var(--m-tasks)' }}>{pendingTasks.length}</div>
            <div className="dash2-kpi-sub">{urgentTasks.length > 0 ? `${urgentTasks.length} דחופות` : 'אין דחופות'}</div>
          </div>
          {/* Task progress ring */}
          <svg className="dash2-ring-sm" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="16" fill="none" stroke="var(--surface3)" strokeWidth="4" />
            <circle cx="20" cy="20" r="16" fill="none" stroke="var(--m-tasks)" strokeWidth="4"
              strokeDasharray={`${2*Math.PI*16*taskDonePct/100} ${2*Math.PI*16}`}
              strokeLinecap="round" transform="rotate(-90 20 20)" />
            <text x="20" y="24" textAnchor="middle" fontSize="9" fontWeight="800" fill="var(--text)">{taskDonePct}%</text>
          </svg>
        </div>

        {/* Habits */}
        <div className="dash2-kpi card card-hover" onClick={() => onNavigate('habits')}>
          <div className="dash2-kpi-icon" style={{ color: 'var(--m-habits)', background: 'var(--teal-dim)' }}>◎</div>
          <div className="dash2-kpi-body">
            <div className="dash2-kpi-label">הרגלים היום</div>
            <div className="dash2-kpi-val" style={{ color: 'var(--m-habits)' }}>{todayHabits.length}/{habits.length}</div>
            <div className="dash2-kpi-sub">{habitPct === 100 ? '🔥 הכל הושלם!' : `${habitPct}% הושלם`}</div>
          </div>
          <svg className="dash2-ring-sm" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="16" fill="none" stroke="var(--surface3)" strokeWidth="4" />
            <circle cx="20" cy="20" r="16" fill="none" stroke="var(--m-habits)" strokeWidth="4"
              strokeDasharray={`${2*Math.PI*16*habitPct/100} ${2*Math.PI*16}`}
              strokeLinecap="round" transform="rotate(-90 20 20)" />
            <text x="20" y="24" textAnchor="middle" fontSize="9" fontWeight="800" fill="var(--text)">{habitPct}%</text>
          </svg>
        </div>

        {/* Workouts */}
        <div className="dash2-kpi card card-hover" onClick={() => onNavigate('workout')}>
          <div className="dash2-kpi-icon" style={{ color: 'var(--m-workout)', background: 'var(--red-dim)' }}>◈</div>
          <div className="dash2-kpi-body">
            <div className="dash2-kpi-label">אימונים החודש</div>
            <div className="dash2-kpi-val" style={{ color: 'var(--m-workout)' }}>{workoutsThisMonth.length}</div>
            <div className="dash2-kpi-sub">{workoutStreak > 0 ? `🔥 ${workoutStreak} ימים` : 'אין streak'}</div>
          </div>
          {/* Mini bar chart */}
          <div className="dash2-mini-bars">
            {Array.from({ length: 7 }, (_, i) => {
              const d = format(subDays(now, 6 - i), 'yyyy-MM-dd')
              const has = workouts.some(w => w.date === d)
              return <div key={i} className={`dash2-mini-bar ${has ? 'active' : ''}`} style={has ? { background: 'var(--m-workout)' } : {}} />
            })}
          </div>
        </div>
      </div>

      {/* Main content grid */}
      <div className="dash2-grid">
        {/* Finance breakdown */}
        {transactions.length > 0 && (
          <div className="dash2-card card dash2-finance-card">
            <div className="dash2-card-title" onClick={() => onNavigate('finance')} style={{ cursor: 'pointer' }}>
              💰 פיננסים החודש <span className="dash2-card-arrow">→</span>
            </div>
            <div className="dash2-finance-row">
              <div className="dash2-fin-block">
                <div className="dash2-fin-label">הכנסות</div>
                <div className="dash2-fin-val text-green">{fmt(income)}</div>
              </div>
              <div className="dash2-fin-block">
                <div className="dash2-fin-label">הוצאות</div>
                <div className="dash2-fin-val text-red">{fmt(expenses)}</div>
              </div>
            </div>
            {/* Flow bar */}
            <div className="dash2-flow-bar">
              <div className="dash2-flow-fill" style={{
                width: `${income > 0 ? Math.min(100, (expenses/income)*100) : 0}%`,
                background: balance >= 0 ? 'var(--green)' : 'var(--red)'
              }} />
            </div>
            {/* Category breakdown */}
            <div className="dash2-cats">
              {topCats.map(([cat, amt]) => (
                <div key={cat} className="dash2-cat-row">
                  <div className="dash2-cat-name">{CAT_LABELS[cat] || cat}</div>
                  <div className="dash2-cat-bar-wrap">
                    <div className="dash2-cat-bar" style={{
                      width: `${expenses > 0 ? (amt/expenses)*100 : 0}%`,
                      background: CAT_COLORS[cat] || '#6B7280'
                    }} />
                  </div>
                  <div className="dash2-cat-amt">{fmt(amt)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Habit heatmap */}
        {habits.length > 0 && (
          <div className="dash2-card card dash2-habits-card">
            <div className="dash2-card-title" onClick={() => onNavigate('habits')} style={{ cursor: 'pointer' }}>
              ◎ הרגלים — 35 ימים <span className="dash2-card-arrow">→</span>
            </div>
            <div className="dash2-heatmap">
              {heatmapDays.map(d => {
                const ds = format(d, 'yyyy-MM-dd')
                const doneCount = habits.filter(h => habitLogs.some(l => l.habit_id === h.id && l.date === ds)).length
                const pct = habits.length > 0 ? doneCount / habits.length : 0
                const opacity = pct === 0 ? 0.08 : 0.2 + pct * 0.8
                return (
                  <div key={ds} className="dash2-heat-cell"
                    style={{ background: `rgba(20,184,166,${opacity})` }}
                    title={`${ds}: ${doneCount}/${habits.length}`} />
                )
              })}
            </div>
            <div className="dash2-habits-today">
              {habits.map(h => {
                const done = todayHabits.some(th => th.id === h.id)
                return (
                  <div key={h.id} className="dash2-habit-chip" style={{
                    background: done ? h.color + '22' : 'var(--surface3)',
                    borderColor: done ? h.color : 'transparent',
                    color: done ? h.color : 'var(--text3)'
                  }}>
                    {done && '✓ '}{h.emoji} {h.name}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tasks board */}
        {tasks.length > 0 && (
          <div className="dash2-card card">
            <div className="dash2-card-title" onClick={() => onNavigate('tasks')} style={{ cursor: 'pointer' }}>
              ☰ משימות פתוחות <span className="dash2-card-arrow">→</span>
            </div>
            <div className="dash2-tasks-list">
              {pendingTasks.slice(0, 6).map(t => (
                <div key={t.id} className="dash2-task-row">
                  <div className={`dash2-task-dot priority-${t.priority}`} />
                  <span className="dash2-task-title">{t.title}</span>
                  <span className="dash2-task-cat">{t.category === 'work' ? 'עבודה' : t.category === 'personal' ? 'אישי' : t.category === 'health' ? 'בריאות' : 'פיננסי'}</span>
                </div>
              ))}
              {pendingTasks.length > 6 && <div className="dash2-task-more">+ עוד {pendingTasks.length - 6}</div>}
            </div>
          </div>
        )}

        {/* Workouts recent */}
        {workouts.length > 0 && (
          <div className="dash2-card card">
            <div className="dash2-card-title" onClick={() => onNavigate('workout')} style={{ cursor: 'pointer' }}>
              ◈ אימונים אחרונים <span className="dash2-card-arrow">→</span>
            </div>
            <div className="dash2-workouts-list">
              {workouts.slice(0, 4).map(w => (
                <div key={w.id} className="dash2-workout-row">
                  <div className="dash2-workout-icon">◈</div>
                  <div>
                    <div className="dash2-workout-type">{w.type}</div>
                    <div className="dash2-workout-date">{format(new Date(w.date), 'd בMMMM', { locale: he })}{w.duration_min > 0 ? ` · ${w.duration_min} דק'` : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reminders today */}
        {allTodayReminders.length > 0 && (
          <div className="dash2-card card">
            <div className="dash2-card-title" onClick={() => onNavigate('reminders')} style={{ cursor: 'pointer' }}>
              ◷ היום <span className="dash2-card-arrow">→</span>
            </div>
            {allTodayReminders.map(r => (
              <div key={r.id} className="dash2-remind-row">
                <span className="dash2-remind-time">{r.time_of_day}</span>
                <span className="dash2-remind-text">{r.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {transactions.length === 0 && tasks.length === 0 && habits.length === 0 && (
          <div className="dash2-empty">
            <div className="dash2-empty-title">ברוך הבא לשמשון</div>
            <p>התחל על ידי הוספת נתונים למודולים</p>
            <div className="dash2-quick-starts">
              {[
                { id: 'tasks', emoji: '☰', label: 'הוסף משימה' },
                { id: 'habits', emoji: '◎', label: 'הגדר הרגל' },
                { id: 'finance', emoji: '₪', label: 'הוסף עסקה' },
                { id: 'reminders', emoji: '◷', label: 'הוסף תזכורת' },
              ].map(q => (
                <button key={q.id} className="dash2-quick-btn card card-hover" onClick={() => onNavigate(q.id)}>
                  <span>{q.emoji}</span>
                  <span>{q.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
