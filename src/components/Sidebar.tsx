import './Sidebar.css'

interface Props {
  active: string
  onNavigate: (page: string) => void
  userName?: string
}

const NAV_ITEMS = [
  { id: 'dashboard', icon: '⬡', label: 'מבט על' },
  { id: 'finance',   icon: '₪',  label: 'פיננסים' },
  { id: 'workout',   icon: '◈',  label: 'אימונים' },
  { id: 'nutrition', icon: '◉',  label: 'תזונה' },
  { id: 'calendar',  icon: '▦',  label: 'לוח שנה' },
  { id: 'tasks',     icon: '☰',  label: 'משימות' },
  { id: 'habits',    icon: '◎',  label: 'הרגלים' },
  { id: 'invest',    icon: '△',  label: 'השקעות' },
  { id: 'reminders', icon: '◷',  label: 'תזכורות' },
]

export default function Sidebar({ active, onNavigate, userName }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo" onClick={() => onNavigate('dashboard')}>
        <div className="sidebar-logo-icon">ש</div>
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-name">שמשון</span>
          <span className="sidebar-logo-sub">Life OS</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`sidebar-item ${active === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
            {active === item.id && <span className="sidebar-active-dot" />}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">{userName?.[0] || 'א'}</div>
          <span className="sidebar-username">{userName || 'משתמש'}</span>
        </div>
      </div>
    </aside>
  )
}
