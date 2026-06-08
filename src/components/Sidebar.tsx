import './Sidebar.css'

interface Props {
  active: string
  onNavigate: (page: string) => void
  userName?: string
  mobileOpen?: boolean
}

const NAV = [
  { id: 'dashboard', icon: '⊞',  label: 'מבט על',    color: 'var(--gold)',       section: null },
  { id: 'finance',   icon: '₪',  label: 'פיננסים',   color: 'var(--m-finance)',  section: 'חיים' },
  { id: 'invest',    icon: '△',  label: 'השקעות',    color: 'var(--m-invest)',   section: null },
  { id: 'workout',   icon: '◈',  label: 'אימונים',   color: 'var(--m-workout)',  section: null },
  { id: 'nutrition', icon: '🥗', label: 'תזונה',     color: 'var(--m-food)',     section: null },
  { id: 'calendar',  icon: '▦',  label: 'לוח שנה',   color: 'var(--m-calendar)', section: 'ארגון' },
  { id: 'tasks',     icon: '☰',  label: 'משימות',    color: 'var(--m-tasks)',    section: null },
  { id: 'habits',    icon: '◎',  label: 'הרגלים',    color: 'var(--m-habits)',   section: null },
  { id: 'reminders', icon: '◷',  label: 'תזכורות',   color: 'var(--m-remind)',   section: null },
  { id: 'profile',   icon: '👤', label: 'הפרופיל שלי', color: 'var(--blue)',      section: 'חשבון' },
  { id: 'admin',     icon: '👑', label: 'ניהול',        color: 'var(--gold)',      section: null },
]

export default function Sidebar({ active, onNavigate, userName, mobileOpen }: Props) {
  return (
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      {/* Logo */}
      <div className="sidebar-logo" onClick={() => onNavigate('dashboard')}>
        <div className="sidebar-logo-icon">ש</div>
        <div>
          <div className="sidebar-logo-name">שמשון</div>
          <div className="sidebar-logo-sub">Life OS</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV.map(item => {
          const isActive = active === item.id
          return (
            <div key={item.id}>
              {item.section && (
                <div className="sidebar-section-label">{item.section}</div>
              )}
              <button
                className={`sidebar-item ${isActive ? 'active' : ''}`} data-page={item.id}
                style={isActive ? { '--item-color': item.color + '22' } as React.CSSProperties : {}}
                onClick={() => onNavigate(item.id)}
              >
                <span
                  className="sidebar-icon"
                  style={isActive ? { color: item.color } : {}}
                >
                  {item.icon}
                </span>
                <span className="sidebar-label">{item.label}</span>
                {isActive && (
                  <span className="sidebar-dot" style={{ background: item.color }} />
                )}
              </button>
            </div>
          )
        })}
      </nav>

      {/* Footer */}
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
