import { useState, useEffect, useCallback } from 'react'
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
import ComingSoon from './pages/ComingSoon'
import Sidebar from './components/Sidebar'
import ShimshonChat from './components/ShimshonChat'
import './App.css'

function buildContext(tasks: any[], habits: any[], habitLogs: any[], reminders: any[]): LifeContext {
  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  return {
    date: format(now, 'd בMMMM yyyy', { locale: he }),
    dayOfWeek: format(now, 'EEEE', { locale: he }),
    todayTasks: tasks.filter(t => !t.done).slice(0, 8).map(t => ({ title: t.title, done: t.done, priority: t.priority })),
    todayHabits: habits.map(h => ({ name: h.name, done: habitLogs.some((l: any) => l.habit_id === h.id && l.date === today) })),
    finance: { monthBalance: 0, monthExpenses: 0, monthIncome: 0 },
    workoutToday: false,
    remindersToday: reminders.filter(r => r.active && r.frequency === 'daily').map(r => ({ text: r.title, time: r.time_of_day })),
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState('dashboard')
  const [briefing, setBriefing] = useState('')
  const [tasks, setTasks] = useState<any[]>([])
  const [habits, setHabits] = useState<any[]>([])
  const [habitLogs, setHabitLogs] = useState<any[]>([])
  const [reminders, setReminders] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null); setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user ?? null))
    return () => subscription.unsubscribe()
  }, [])

  const loadContext = useCallback(async (uid: string) => {
    const today = format(new Date(), 'yyyy-MM-dd')
    const [t, h, hl, r] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', uid),
      supabase.from('habits').select('*').eq('user_id', uid).eq('active', true),
      supabase.from('habit_logs').select('*').eq('user_id', uid).eq('date', today),
      supabase.from('reminders').select('*').eq('user_id', uid).eq('active', true),
    ])
    setTasks(t.data || []); setHabits(h.data || [])
    setHabitLogs(hl.data || []); setReminders(r.data || [])
  }, [])

  useEffect(() => { if (user) loadContext(user.id) }, [user, loadContext])

  const context = buildContext(tasks, habits, habitLogs, reminders)

  useEffect(() => {
    if (user) getDailyBriefing(context).then(setBriefing)
  }, [user, tasks.length, habits.length])

  if (loading) return (
    <div className="app-loading"><div className="app-loading-icon">ש</div></div>
  )
  if (!user) return <Auth />

  const renderPage = () => {
    switch (page) {
      case 'dashboard':  return <Dashboard context={context} onNavigate={setPage} user={user} />
      case 'finance':    return <Finance user={user} />
      case 'workout':    return <Workout user={user} />
      case 'tasks':      return <Tasks user={user} />
      case 'habits':     return <Habits user={user} />
      case 'reminders':  return <Reminders user={user} />
      case 'invest':     return <Invest user={user} />
      case 'nutrition':  return <ComingSoon moduleId="nutrition" onNavigate={setPage} />
      case 'calendar':   return <ComingSoon moduleId="calendar" onNavigate={setPage} />
      default:           return <Dashboard context={context} onNavigate={setPage} user={user} />
    }
  }

  return (
    <div className="app-layout">
      <Sidebar active={page} onNavigate={setPage} userName={user.email?.split('@')[0]} />
      <main className="app-main">
        <div className="app-topbar">
          <div />
          <button className="btn-ghost app-signout" onClick={() => supabase.auth.signOut()}>יציאה</button>
        </div>
        <div className="app-content page-container">{renderPage()}</div>
      </main>
      <ShimshonChat context={context} briefing={briefing} onNavigate={setPage} />
    </div>
  )
}
