import { useState, useEffect, useCallback, useRef } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import ProfilePage from './pages/Profile'
import AdminPage from './pages/Admin'
import { autoRefreshToken } from './lib/googleCalendar'
import { LifeContext, getDailyBriefing } from './lib/shimshon'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Finance from './pages/Finance'
import Workout from './pages/Workout'
import Tasks from './pages/Tasks'
import Habits from './pages/Habits'
import Reminders from './pages/Reminders'
import Invest from './pages/Invest'
import Nutrition from './pages/Nutrition'
import Calendar from './pages/Calendar'
import Sidebar from './components/Sidebar'
import ShimshonChat from './components/ShimshonChat'
import './App.css'

const THEMES = ['dark','light','midnight','warm'] as const
type Theme = typeof THEMES[number]

function buildContext(tasks: any[], habits: any[], habitLogs: any[], reminders: any[], transactions: any[]): LifeContext {
  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  const ms = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd')
  const monthTx = transactions.filter(t => t.date >= ms)
  const income = monthTx.filter(t => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0)
  const expenses = monthTx.filter(t => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0)
  return {
    date: format(now, 'd בMMMM yyyy', { locale: he }),
    dayOfWeek: format(now, 'EEEE', { locale: he }),
    todayTasks: tasks.filter(t => !t.done).slice(0, 8).map(t => ({ title: t.title, done: t.done, priority: t.priority })),
    todayHabits: habits.map(h => ({ name: h.name, done: habitLogs.some((l: any) => l.habit_id === h.id && l.date === today) })),
    finance: { income, expenses, balance: income - expenses, topCategory: '', monthBalance: income - expenses, monthExpenses: expenses, monthIncome: income },
    workoutToday: false,
    remindersToday: reminders.filter(r => r.active && r.frequency === 'daily').map(r => ({ text: r.title, time: r.time_of_day })),
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authToken, setAuthToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState('dashboard')
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('shimshon-theme') as Theme) || 'dark')
  const [aiOpen, setAiOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [briefing, setBriefing] = useState('')
  const [tasks, setTasks] = useState<any[]>([])
  const [habits, setHabits] = useState<any[]>([])
  const [habitLogs, setHabitLogs] = useState<any[]>([])
  const [reminders, setReminders] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])

  const navigate = (p: string) => {
    setPage(p)
    setSidebarOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Theme
  // Auto-refresh Google Calendar
  useEffect(() => { autoRefreshToken() }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('shimshon-theme', theme)
  }, [theme])

  const cycleTheme = () => {
    const idx = THEMES.indexOf(theme)
    setTheme(THEMES[(idx + 1) % THEMES.length])
  }

  const THEME_ICONS: Record<Theme, string> = { dark: '🌙', light: '☀️', midnight: '✦', warm: '🕯️' }
  const THEME_LABELS: Record<Theme, string> = { dark: 'כהה', light: 'בהיר', midnight: 'חשכה', warm: 'חם' }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null); setAuthToken(session?.access_token ?? null); setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => { setUser(session?.user ?? null); setAuthToken(session?.access_token ?? null) })
    return () => subscription.unsubscribe()
  }, [])

  const loadContext = useCallback(async (uid: string) => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const [t, h, hl, r, tx] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', uid),
      supabase.from('habits').select('*').eq('user_id', uid).eq('active', true),
      supabase.from('habit_logs').select('*').eq('user_id', uid).eq('date', today),
      supabase.from('reminders').select('*').eq('user_id', uid).eq('active', true),
      supabase.from('transactions').select('id,type,amount,date').eq('user_id', uid).gte('date', format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')),
    ])
    setTasks(t.data || []); setHabits(h.data || [])
    setHabitLogs(hl.data || []); setReminders(r.data || [])
    setTransactions(tx.data || [])
  }, [])

  useEffect(() => { if (user) loadContext(user.id) }, [user, loadContext])

  const context = buildContext(tasks, habits, habitLogs, reminders, transactions)

  const briefingFetched = useRef(false)
  useEffect(() => {
    if (!user || briefingFetched.current) return
    briefingFetched.current = true
    const timer = setTimeout(() => {
      getDailyBriefing(context).then(setBriefing)
    }, 4000)
    return () => clearTimeout(timer)
  }, [user])

  if (loading) return (
    <div className="app-loading">
      <div className="app-loading-inner">
        <div className="app-loading-icon">ש</div>
        <div className="app-loading-label">שמשון</div>
      </div>
    </div>
  )
  if (!user) return <Auth />

  const renderPage = () => {
    switch (page) {
      case 'profile':   return <ProfilePage user={user} />
      case 'admin':     return <AdminPage user={user} />
      case 'dashboard': return <Dashboard context={context} onNavigate={navigate} user={user} />
      case 'finance':    return <Finance user={user} />
      case 'workout':    return <Workout user={user} />
      case 'tasks':      return <Tasks user={user} />
      case 'habits':     return <Habits user={user} />
      case 'reminders':  return <Reminders user={user} />
      case 'invest':     return <Invest user={user} />
      case 'nutrition':  return <Nutrition user={user} />
      case 'calendar':   return <Calendar user={user} />
      default:           return <Dashboard context={context} onNavigate={navigate} user={user} />
    }
  }

  const now = new Date()
  const hour = now.getHours()
  const timeGreet = hour < 5 ? 'לילה טוב' : hour < 12 ? 'בוקר טוב' : hour < 17 ? 'שלום' : hour < 21 ? 'ערב טוב' : 'לילה טוב'

  return (
    <div className={`app-layout ${aiOpen ? 'ai-open' : ''}`}>
      {/* Sidebar overlay for mobile */}
      <div className={`sidebar-overlay ${sidebarOpen ? 'visible' : ''}`} onClick={() => setSidebarOpen(false)} />
      <Sidebar active={page} onNavigate={navigate} userName={user.email?.split('@')[0]} mobileOpen={sidebarOpen} />
      
      <main className="app-main">
        {/* Top Bar */}
        <header className="app-topbar">
          <div className="app-topbar-right">
            <button className="app-hamburger" onClick={() => setSidebarOpen(p => !p)}>
              ☰
            </button>
            <div className="app-greeting">
              <span className="app-greet-text">{timeGreet}</span>
              <span className="app-greet-dot">·</span>
              <span className="app-greet-date">{format(now, "EEEE, d בMMMM", { locale: he })}</span>
            </div>
          </div>
          <div className="app-topbar-left">
            {/* Theme toggle */}
            <button className="app-theme-btn" onClick={cycleTheme} title="החלף ערכת צבעים">
              <span>{THEME_ICONS[theme]}</span>
              <span className="app-theme-label">{THEME_LABELS[theme]}</span>
            </button>
            {/* AI toggle */}
            <button className={`app-ai-toggle ${aiOpen ? 'active' : ''}`} onClick={() => setAiOpen(p => !p)} title="שמשון AI">
              <span className="app-ai-dot" />
              <span>שמשון</span>
            </button>
            {/* Sign out */}
            <button className="btn-ghost app-signout" onClick={() => supabase.auth.signOut()} style={{ fontSize: 12 }}>
              יציאה
            </button>
          </div>
        </header>

        <div className="app-content fade-in">{renderPage()}</div>
      </main>

      {/* Shimshon AI — always visible panel */}
      <aside className={`ai-panel ${aiOpen ? 'open' : 'closed'}`}>
        <div className="ai-panel-header">
          <div className="ai-panel-title">
            <div className="ai-panel-avatar">ש</div>
            <div>
              <div className="ai-panel-name">שמשון</div>
              <div className="ai-panel-status"><span className="ai-status-dot"/>מוכן לעזור</div>
            </div>
          </div>
          <button className="btn-icon" onClick={() => setAiOpen(false)} style={{ fontSize: 12 }}>✕</button>
        </div>
        <ShimshonChat context={context} briefing={briefing} onNavigate={navigate} onRefresh={() => user && loadContext(user.id)} userId={user?.id ?? undefined} authToken={authToken ?? undefined} embedded />
      </aside>
      {/* Mobile bottom navigation */}
      <nav className="mobile-bottom-nav">
        {[
          { id: 'dashboard', icon: '⊞', label: 'ראשי' },
          { id: 'finance',   icon: '₪',  label: 'כסף' },
          { id: 'workout',   icon: '◈',  label: 'כושר' },
          { id: 'habits',    icon: '◎',  label: 'הרגלים' },
          { id: 'tasks',     icon: '☰',  label: 'משימות' },
        ].map(item => (
          <button key={item.id} className={`mobile-nav-btn ${page === item.id ? 'active' : ''}`}
            onClick={() => navigate(item.id)}>
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
        <button className={`mobile-nav-btn ${aiOpen ? 'active' : ''}`}
          onClick={() => setAiOpen(p => !p)}>
          <span>ש</span>
          <span>AI</span>
        </button>
      </nav>
    </div>
  )
}
