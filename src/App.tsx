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

function buildContext(tasks: any[], habits: any[], habitLogs: any[], reminders: any[], transactions: any[], foodLogs: any[] = [], workouts: any[] = [], moodLogs: any[] = [], shimshonMemory: any[] = []): LifeContext {
  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  const ms = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd')
  const monthTx = transactions.filter(t => t.date >= ms)
  const income = monthTx.filter(t => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0)
  const expenses = monthTx.filter(t => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0)
  const todayFood = foodLogs.filter(f => f.date === today)
  const todayCalories = todayFood.reduce((s: number, f: any) => s + (f.calories || 0), 0)
  const todayProtein = todayFood.reduce((s: number, f: any) => s + (f.protein || 0), 0)
  const todayWorkout = workouts.find(w => w.date === today)
  const monthWorkouts = workouts.filter(w => w.date >= ms)
  let streak = 0
  const sortedW = [...workouts].sort((a, b) => b.date.localeCompare(a.date))
  let checkDate = new Date()
  for (const w of sortedW) {
    if (w.date === format(checkDate, 'yyyy-MM-dd')) { streak++; checkDate = new Date(checkDate.getTime() - 86400000) } else break
  }
  const habitLogsToday = habitLogs.filter(l => l.date === today)
  const avgMood = moodLogs.length > 0 ? Math.round(moodLogs.reduce((s: number, m: any) => s + m.score, 0) / moodLogs.length * 10) / 10 : null
  const urgentTasks = tasks.filter(t => !t.done && t.priority === 'high').slice(0, 3)
  const memoryNotes = shimshonMemory.map(m => m.content).join('\n')
  return {
    date: format(now, 'd בMMMM yyyy', { locale: he }),
    dayOfWeek: format(now, 'EEEE', { locale: he }),
    hour: now.getHours(),
    todayTasks: tasks.filter(t => !t.done).slice(0, 8).map(t => ({ id: t.id, title: t.title, done: t.done, priority: t.priority })),
    urgentTasks: urgentTasks.map(t => ({ id: t.id, title: t.title })),
    todayHabits: habits.map(h => ({ id: h.id, name: h.name, done: habitLogsToday.some((l: any) => l.habit_id === h.id) })),
    finance: { income, expenses, balance: income - expenses, topCategory: '', monthBalance: income - expenses, monthExpenses: expenses, monthIncome: income },
    todayCalories, todayProtein, targetCal: 2000, targetProtein: 150,
    todayFood: todayFood.map(f => ({ meal: f.meal, food: f.food, calories: f.calories || 0 })),
    workout: { today: !!todayWorkout, todayType: todayWorkout?.name, streak, monthCount: monthWorkouts.length },
    workoutToday: !!todayWorkout,
    recentMoods: moodLogs.slice(0, 7).map(m => ({ score: m.score, date: m.date, note: m.note })),
    avgMood,
    remindersToday: reminders.filter(r => r.active).map(r => ({ text: r.title, time: r.time_of_day })),
    memoryNotes,
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
  const [foodLogs, setFoodLogs] = useState<any[]>([])
  const [workouts, setWorkouts] = useState<any[]>([])
  const [moodLogs, setMoodLogs] = useState<any[]>([])
  const [shimshonMemory, setShimshonMemory] = useState<any[]>([])

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

  const THEME_ICONS: Record<Theme, string> = { dark: 'ð', light: 'âï¸', midnight: 'â¦', warm: 'ð¯ï¸' }
  const THEME_LABELS: Record<Theme, string> = { dark: '×××', light: '××××¨', midnight: '××©××', warm: '××' }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null); setAuthToken(session?.access_token ?? null); setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => { setUser(session?.user ?? null); setAuthToken(session?.access_token ?? null) })
    return () => subscription.unsubscribe()
  }, [])

  const loadContext = useCallback(async (uid: string) => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const [t, h, hl, r, tx, fl, wo, ml, mem] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', uid),
      supabase.from('habits').select('*').eq('user_id', uid).eq('active', true),
      supabase.from('habit_logs').select('*').eq('user_id', uid).eq('date', today),
      supabase.from('reminders').select('*').eq('user_id', uid).eq('active', true),
      supabase.from('transactions').select('id,type,amount,date,description,category').eq('user_id', uid).gte('date', format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')),
      supabase.from('food_logs').select('*').eq('user_id', uid).eq('date', today),
      supabase.from('workouts').select('*').eq('user_id', uid).gte('date', format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd')),
      supabase.from('mood_logs').select('*').eq('user_id', uid).gte('date', format(new Date(Date.now() - 7*24*60*60*1000), 'yyyy-MM-dd')).order('date', { ascending: false }),
      supabase.from('shimshon_memory').select('*').eq('user_id', uid).order('updated_at', { ascending: false }).limit(20),
    ])
    setTasks(t.data || []); setHabits(h.data || [])
    setHabitLogs(hl.data || []); setReminders(r.data || [])
    setTransactions(tx.data || [])
    setFoodLogs(fl.data || []); setWorkouts(wo.data || [])
    setMoodLogs(ml.data || []); setShimshonMemory(mem.data || [])
  }, [])

  useEffect(() => { if (user) loadContext(user.id) }, [user, loadContext])

  const context = buildContext(tasks, habits, habitLogs, reminders, transactions, foodLogs, workouts, moodLogs, shimshonMemory)

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
        <div className="app-loading-icon">×©</div>
        <div className="app-loading-label">×©××©××</div>
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
  const timeGreet = hour < 5 ? '×××× ×××' : hour < 12 ? '×××§×¨ ×××' : hour < 17 ? '×©×××' : hour < 21 ? '×¢×¨× ×××' : '×××× ×××'

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
              â°
            </button>
            <div className="app-greeting">
              <span className="app-greet-text">{timeGreet}</span>
              <span className="app-greet-dot">Â·</span>
              <span className="app-greet-date">{format(now, "EEEE, d ×MMMM", { locale: he })}</span>
            </div>
          </div>
          <div className="app-topbar-left">
            {/* Theme toggle */}
            <button className="app-theme-btn" onClick={cycleTheme} title="××××£ ×¢×¨××ª ×¦××¢××">
              <span>{THEME_ICONS[theme]}</span>
              <span className="app-theme-label">{THEME_LABELS[theme]}</span>
            </button>
            {/* AI toggle */}
            <button className={`app-ai-toggle ${aiOpen ? 'active' : ''}`} onClick={() => setAiOpen(p => !p)} title="×©××©×× AI">
              <span className="app-ai-dot" />
              <span>×©××©××</span>
            </button>
            {/* Sign out */}
            <button className="btn-ghost app-signout" onClick={() => supabase.auth.signOut()} style={{ fontSize: 12 }}>
              ××¦×××
            </button>
          </div>
        </header>

        <div className="app-content fade-in">{renderPage()}</div>
      </main>

      {/* Shimshon AI â always visible panel */}
      <aside className={`ai-panel ${aiOpen ? 'open' : 'closed'}`}>
        <div className="ai-panel-header">
          <div className="ai-panel-title">
            <div className="ai-panel-avatar">×©</div>
            <div>
              <div className="ai-panel-name">×©××©××</div>
              <div className="ai-panel-status"><span className="ai-status-dot"/>×××× ××¢×××¨</div>
            </div>
          </div>
          <button className="btn-icon" onClick={() => setAiOpen(false)} style={{ fontSize: 12 }}>â</button>
        </div>
        <ShimshonChat key="shimshon-main" context={context} briefing={briefing} onNavigate={navigate} userId={user?.id ?? undefined} authToken={authToken ?? undefined} embedded />
      </aside>
      {/* Mobile bottom navigation */}
      <nav className="mobile-bottom-nav">
        {[
          { id: 'dashboard', icon: 'â', label: '×¨××©×' },
          { id: 'finance',   icon: 'âª',  label: '××¡×£' },
          { id: 'workout',   icon: 'â',  label: '×××©×¨' },
          { id: 'habits',    icon: 'â',  label: '××¨××××' },
          { id: 'tasks',     icon: 'â°',  label: '××©××××ª' },
        ].map(item => (
          <button key={item.id} className={`mobile-nav-btn ${page === item.id ? 'active' : ''}`}
            onClick={() => navigate(item.id)}>
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
        <button className={`mobile-nav-btn ${aiOpen ? 'active' : ''}`}
          onClick={() => setAiOpen(p => !p)}>
          <span>×©</span>
          <span>AI</span>
        </button>
      </nav>
    </div>
  )
}
