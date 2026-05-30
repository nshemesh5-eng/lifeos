import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import { LifeContext, getDailyBriefing } from '../lib/shimshon'
import './Dashboard.css'

interface Props {
  context: LifeContext
  onNavigate: (page: string) => void
}

const MODULE_CARDS = [
  { id: 'finance',   icon: '₪',  label: 'פיננסים',   color: 'var(--m-finance)',  desc: 'מאזן, הכנסות, הוצאות' },
  { id: 'workout',   icon: '◈',  label: 'אימונים',   color: 'var(--m-workout)',   desc: 'לוג אימון, התקדמות' },
  { id: 'nutrition', icon: '◉',  label: 'תזונה',     color: 'var(--m-food)',      desc: 'תפריט, קניות, קלוריות' },
  { id: 'calendar',  icon: '▦',  label: 'לוח שנה',   color: 'var(--m-calendar)', desc: 'אירועים, פגישות' },
  { id: 'tasks',     icon: '☰',  label: 'משימות',    color: 'var(--m-tasks)',     desc: 'עבודה, אישי, עדיפויות' },
  { id: 'habits',    icon: '◎',  label: 'הרגלים',    color: 'var(--m-habits)',    desc: 'מעקב יומי, streak' },
  { id: 'invest',    icon: '△',  label: 'השקעות',    color: 'var(--m-invest)',    desc: 'תיק, ביצועים' },
  { id: 'reminders', icon: '◷',  label: 'תזכורות',   color: 'var(--m-remind)',    desc: 'אישיות, חוזרות' },
]

export default function Dashboard({ context, onNavigate }: Props) {
  const [briefing, setBriefing] = useState<string>('')
  const [loadingBrief, setLoadingBrief] = useState(true)

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב'
  const dateStr = format(now, "EEEE, d בMMMM yyyy", { locale: he })

  useEffect(() => {
    getDailyBriefing(context).then(b => {
      setBriefing(b)
      setLoadingBrief(false)
    })
  }, [])

  const pendingTasks = context.todayTasks.filter(t => !t.done).length
  const doneTasks = context.todayTasks.filter(t => t.done).length
  const totalTasks = context.todayTasks.length
  const tasksPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  const doneHabits = context.todayHabits.filter(h => h.done).length
  const totalHabits = context.todayHabits.length
  const habitsPct = totalHabits > 0 ? Math.round((doneHabits / totalHabits) * 100) : 0

  const { monthIncome, monthExpenses, monthBalance } = context.finance
  const savingsRate = monthIncome > 0 ? Math.round(((monthIncome - monthExpenses) / monthIncome) * 100) : 0
  const fmt = (n: number) => '₪' + Math.abs(Math.round(n)).toLocaleString('he-IL')

  return (
    <div className="dashboard fade-in">
      {/* Header */}
      <div className="dash-top">
        <div>
          <h1 className="dash-greeting">{greeting}</h1>
          <p className="dash-date">{dateStr}</p>
        </div>
        <div className="dash-header-right">
          {context.remindersToday.length > 0 && (
            <div className="dash-reminder-badge" onClick={() => onNavigate('reminders')}>
              <span className="dash-reminder-icon">◷</span>
              {context.remindersToday.length} תזכורת{context.remindersToday.length > 1 ? 'ות' : ''} היום
            </div>
          )}
        </div>
      </div>

      {/* Shimshon briefing */}
      <div className="dash-briefing card">
        <div className="dash-briefing-avatar">ש</div>
        <div className="dash-briefing-content">
          <div className="dash-briefing-label">שמשון — ברייפינג יומי</div>
          {loadingBrief ? (
            <div className="skeleton" style={{ height: 18, width: '60%', marginTop: 4 }} />
          ) : briefing ? (
            <p className="dash-briefing-text">{briefing}</p>
          ) : (
            <p className="dash-briefing-text text-hint">הגדר Gemini API key לקבלת ברייפינג.</p>
          )}
        </div>
      </div>

      {/* Key metrics row */}
      <div className="dash-metrics">

        {/* Finance */}
        <div className="dash-metric card card-hover" onClick={() => onNavigate('finance')}>
          <div className="dash-metric-top">
            <span className="dash-metric-icon" style={{ color: 'var(--m-finance)' }}>₪</span>
            <span className="dash-metric-label">מאזן חודשי</span>
          </div>
          <div className={`dash-metric-value ${monthBalance >= 0 ? 'text-green' : 'text-red'}`}>
            {monthBalance >= 0 ? '+' : ''}{fmt(monthBalance)}
          </div>
          <div className="dash-metric-sub text-hint">
            חיסכון {savingsRate}% · הוצ׳ {fmt(monthExpenses)}
          </div>
          <div className="dash-progress-bar">
            <div className="dash-progress-fill"
              style={{ width: `${Math.min(100, (monthExpenses/Math.max(monthIncome,1))*100)}%`, background: monthBalance >= 0 ? 'var(--m-finance)' : 'var(--red)' }} />
          </div>
        </div>

        {/* Tasks */}
        <div className="dash-metric card card-hover" onClick={() => onNavigate('tasks')}>
          <div className="dash-metric-top">
            <span className="dash-metric-icon" style={{ color: 'var(--m-tasks)' }}>☰</span>
            <span className="dash-metric-label">משימות היום</span>
          </div>
          <div className="dash-metric-value" style={{ color: 'var(--m-tasks)' }}>
            {doneTasks}/{totalTasks}
          </div>
          <div className="dash-metric-sub text-hint">
            {pendingTasks > 0 ? `${pendingTasks} ממתינות` : totalTasks > 0 ? 'הכל הושלם ✓' : 'אין משימות'}
          </div>
          <div className="dash-progress-bar">
            <div className="dash-progress-fill" style={{ width: `${tasksPct}%`, background: 'var(--m-tasks)' }} />
          </div>
        </div>

        {/* Habits */}
        <div className="dash-metric card card-hover" onClick={() => onNavigate('habits')}>
          <div className="dash-metric-top">
            <span className="dash-metric-icon" style={{ color: 'var(--m-habits)' }}>◎</span>
            <span className="dash-metric-label">הרגלים</span>
          </div>
          <div className="dash-metric-value" style={{ color: 'var(--m-habits)' }}>
            {habitsPct}%
          </div>
          <div className="dash-metric-sub text-hint">
            {doneHabits}/{totalHabits} הושלמו
          </div>
          <div className="dash-progress-bar">
            <div className="dash-progress-fill" style={{ width: `${habitsPct}%`, background: 'var(--m-habits)' }} />
          </div>
        </div>

        {/* Workout */}
        <div className="dash-metric card card-hover" onClick={() => onNavigate('workout')}>
          <div className="dash-metric-top">
            <span className="dash-metric-icon" style={{ color: 'var(--m-workout)' }}>◈</span>
            <span className="dash-metric-label">אימון היום</span>
          </div>
          <div className={`dash-metric-value ${context.workoutToday ? 'text-green' : ''}`}
            style={!context.workoutToday ? { color: 'var(--text3)' } : {}}>
            {context.workoutToday ? 'הושלם ✓' : 'טרם בוצע'}
          </div>
          <div className="dash-metric-sub text-hint">לחץ להתחיל</div>
          <div className="dash-progress-bar">
            <div className="dash-progress-fill"
              style={{ width: context.workoutToday ? '100%' : '0%', background: 'var(--m-workout)' }} />
          </div>
        </div>
      </div>

      {/* Today's reminders */}
      {context.remindersToday.length > 0 && (
        <div className="dash-section">
          <div className="dash-section-title">תזכורות היום</div>
          <div className="dash-reminders">
            {context.remindersToday.map((r, i) => (
              <div key={i} className="dash-reminder-item card">
                <span className="dash-reminder-time">{r.time}</span>
                <span className="dash-reminder-text">{r.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Module grid */}
      <div className="dash-section">
        <div className="dash-section-title">מודולים</div>
        <div className="dash-modules">
          {MODULE_CARDS.map(m => (
            <button key={m.id} className="dash-module card card-hover" onClick={() => onNavigate(m.id)}>
              <div className="dash-module-icon" style={{ color: m.color, background: m.color + '18' }}>
                {m.icon}
              </div>
              <div className="dash-module-label">{m.label}</div>
              <div className="dash-module-desc text-hint">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Pending tasks list */}
      {context.todayTasks.length > 0 && (
        <div className="dash-section">
          <div className="dash-section-title">
            משימות פתוחות
            <button className="btn-ghost" style={{ fontSize: 12, height: 28, marginRight: 12 }} onClick={() => onNavigate('tasks')}>
              הכל →
            </button>
          </div>
          <div className="dash-tasks">
            {context.todayTasks.filter(t => !t.done).slice(0, 5).map((t, i) => (
              <div key={i} className="dash-task-item card">
                <div className="dash-task-check" />
                <span className="dash-task-title">{t.title}</span>
                <span className={`badge dash-task-priority priority-${t.priority}`}>{
                  t.priority === 'high' ? 'דחוף' : t.priority === 'medium' ? 'בינוני' : 'נמוך'
                }</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
