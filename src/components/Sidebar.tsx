import './Sidebar.css'

interface Props {
  active: string
  onNavigate: (page: string) => void
  userName?: string
}

const NAV = [
  { id: 'dashboard', icon: '⬡', label: 'מבט על',    color: 'var(--gold)' },
  { id: 'finance',   icon: '₪',  label: 'פיננסים',  color: 'var(--m-finance)' },
  { id: 'workout',   icon: '◈',  label: 'אימונים',  color: 'var(--m-workout)' },
  { id: 'nutrition', icon: '🥗', label: 'תזונה',    color: 'var(--m-food)' },
  { id: 'calendar',  icon: '▦',  label: 'לוח שנה',  color: 'var(--m-calendar)' },
  { id: 'tasks',     icon: '☰',  label: 'משימות',   color: 'var(--m-tasks)' },
  { id: 'habits',    icon: '◎',  label: 'הרגלים',   color: 'var(--m-habits)' },
  { id: 'invest',    icon: '△',  label: 'השקעות',   color: 'var(--m-invest)' },
  { id: 'reminders', icon: '◷',  label: 'תזכורות',  color: 'var(--m-remind)' },
]

export default function Sidebar({ active, onNavigate, userName }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo" onClick={() => onNavigate('dashboard')}>
        <div className="sidebar-logo-icon">ש</div>
        <div>
          <div className="sidebar-logo-name">שמשון</div>
          <div className="sidebar-logo-sub">Life OS</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(item => (
          <button
            key={item.id}
            className={`sidebar-item ${active === item.id ? 'active' : ''}`}
            style={active === item.id ? { '--item-color': item.color } as React.CSSProperties : {}}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar-icon"
              style={active === item.id ? { color: item.color } : {}}>
              {item.icon}
            </span>
            <span className="sidebar-label">{item.label}</span>
            {active === item.id && <span className="sidebar-dot" style={{ background: item.color }} />}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{userName?.[0]?.toUpperCase() || 'א'}</div>
          <div>
            <div className="sidebar-username">{userName || 'משתמש'}</div>
            <div className="sidebar-user-sub">Life OS</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
