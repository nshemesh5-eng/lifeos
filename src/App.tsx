import { useState, useEffect, useCallback, useRef } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
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
    finance: { monthBalance: income - expenses, monthExpenses: expenses, monthIncome: income },
    workoutToday: false,
    remindersToday: reminders.filter(r => r.active && r.frequency === 'daily').map(r => ({ text: r.title, time: r.time_of_day })),
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState('dashboard')
  const navigate = (p: string) => { setPage(p); setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50) }
  const [briefing, setBriefing] = useState('')
  const [tasks, setTasks] = useState<any[]>([])
  const [habits, setHabits] = useState<any[]>([])
  const [habitLogs, setHabitLogs] = useState<any[]>([])
  const [reminders, setReminders] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null); setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user ?? null))
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

  // Fetch briefing ONCE, 4 seconds after login (let data load first, avoid rate limits)
  const briefingFetched = useRef(false)
  useEffect(() => {
    if (!user || briefingFetched.current) return
    briefingFetched.current = true
    // Delay to let Supabase data load and avoid competing API calls
    const timer = setTimeout(() => {
      getDailyBriefing(context).then(setBriefing)
    }, 4000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  if (loading) return <div className="app-loading"><div className="app-loading-icon">ש</div></div>
  if (!user) return <Auth />

  const renderPage = () => {
    switch (page) {
      case 'dashboard':  return <Dashboard context={context} onNavigate={navigate} user={user} />
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

  return (
    <div className="app-layout">
      <Sidebar active={page} onNavigate={navigate} userName={user.email?.split('@')[0]} />
      <main className="app-main">
        <div className="app-topbar">
          <div />
          <button className="btn-ghost app-signout" onClick={() => supabase.auth.signOut()}>יציאה</button>
        </div>
        <div className="app-content page-container">{renderPage()}</div>
      </main>
      <ShimshonChat context={context} briefing={briefing} onNavigate={navigate} />
    </div>
  )
}
