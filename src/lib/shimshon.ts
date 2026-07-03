import { supabase } from './supabase'

// ââ Types ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
export interface ShimshonMessage {
  role: 'user' | 'assistant' | 'shimshon'
  content: string
  timestamp?: Date
}

export interface LifeContext {
  userName?: string
  date?: string
  dayOfWeek?: string
  hour?: number
  // Nutrition
  todayCalories?: number
  todayProtein?: number
  targetCal?: number
  targetProtein?: number
  todayFood?: Array<{meal: string; food: string; calories: number}>
  // Finance
  finance?: { income?: number; expenses?: number; balance?: number; topCategory?: string; monthBalance?: number; monthExpenses?: number; monthIncome?: number }
  // Workout
  workout?: { today?: boolean; todayType?: string; streak?: number; monthCount?: number }
  workoutToday?: boolean
  // Tasks
  todayTasks?: Array<{id?: string; title: string; done: boolean; priority: string}>
  urgentTasks?: Array<{id?: string; title: string}>
  // Habits
  todayHabits?: Array<{id?: string; name: string; done: boolean}>
  // Mood & Memory
  recentMoods?: Array<{score: number; date: string; note?: string}>
  avgMood?: number | null
  memoryNotes?: string
  // Calendar
  todayEvents?: Array<{time: string; title: string}>
  // Goals
  goals?: Array<{title: string}>
  // Reminders
  todayReminders?: Array<{time: string; text: string}>
  remindersToday?: Array<{time?: string; text?: string}>
  [key: string]: any
}

// ââ Load full life context from Supabase âââââââââââââââââââââââââ
export async function loadLifeContext(userId: string): Promise<LifeContext> {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const days = ['×¨××©××','×©× ×','×©×××©×','×¨×××¢×','××××©×','×©××©×','×©××ª']
  const months = ['×× ×××¨','×¤××¨×××¨','××¨×¥','××¤×¨××','×××','××× ×','××××','×××××¡×','×¡×¤××××¨','×××§××××¨','× ×××××¨','××¦×××¨']

  // Parallel fetch everything
  const [
    profileRes, foodRes, transRes, workoutsRes,
    tasksRes, habitsRes, habitLogsRes, goalsRes, remindersRes
  ] = await Promise.allSettled([
    supabase.from('profiles').select('full_name,display_name,cal_target,protein_target').eq('id', userId).single(),
    supabase.from('food_logs').select('meal,food,calories,protein').eq('user_id', userId).eq('date', today),
    supabase.from('transactions').select('amount,type,category').eq('user_id', userId).gte('date', today.substring(0,7)+'-01'),
    supabase.from('workouts').select('date,name,duration').eq('user_id', userId).gte('date', today.substring(0,7)+'-01').order('date', {ascending:false}),
    supabase.from('tasks').select('title,done,priority').eq('user_id', userId).eq('done', false).limit(10),
    supabase.from('habits').select('id,name').eq('user_id', userId),
    supabase.from('habit_logs').select('habit_id,done').eq('user_id', userId).eq('date', today),
    supabase.from('goals').select('title,status').eq('user_id', userId).eq('status', 'active').limit(5),
    supabase.from('reminders').select('time,title').eq('user_id', userId).gte('date', today).lte('date', today).limit(5),
  ])

  const profile = profileRes.status === 'fulfilled' ? profileRes.value.data : null
  const food = foodRes.status === 'fulfilled' ? (foodRes.value.data || []) : []
  const transactions = transRes.status === 'fulfilled' ? (transRes.value.data || []) : []
  const workouts = workoutsRes.status === 'fulfilled' ? (workoutsRes.value.data || []) : []
  const tasks = tasksRes.status === 'fulfilled' ? (tasksRes.value.data || []) : []
  const habits = habitsRes.status === 'fulfilled' ? (habitsRes.value.data || []) : []
  const habitLogs = habitLogsRes.status === 'fulfilled' ? (habitLogsRes.value.data || []) : []
  const goals = goalsRes.status === 'fulfilled' ? (goalsRes.value.data || []) : []
  const reminders = remindersRes.status === 'fulfilled' ? (remindersRes.value.data || []) : []

  // Process nutrition
  const todayCalories = food.reduce((s: number, f: any) => s + (f.calories || 0), 0)
  const todayProtein = food.reduce((s: number, f: any) => s + (f.protein || 0), 0)

  // Process finance
  const income = transactions.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Math.abs(t.amount), 0)
  const expenses = transactions.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Math.abs(t.amount), 0)
  const catCounts: Record<string,number> = {}
  transactions.filter((t: any) => t.type === 'expense').forEach((t: any) => {
    catCounts[t.category] = (catCounts[t.category] || 0) + Math.abs(t.amount)
  })
  const topCategory = Object.entries(catCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || ''

  // Process workouts
  const todayWorkout = workouts.find((w: any) => w.date === today)
  const streak = (() => {
    let s = 0; const d = new Date()
    for (let i = 0; i < 30; i++) {
      const ds = d.toISOString().split('T')[0]
      if (workouts.find((w: any) => w.date === ds)) s++
      else if (i > 0) break
      d.setDate(d.getDate()-1)
    }
    return s
  })()

  // Process habits
  const doneHabitIds = new Set(habitLogs.filter((l: any) => l.done).map((l: any) => l.habit_id))
  const todayHabits = habits.map((h: any) => ({ name: h.name, done: doneHabitIds.has(h.id) }))

  return {
    userName: profile?.display_name || profile?.full_name || '',
    date: `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`,
    dayOfWeek: days[now.getDay()],
    hour: now.getHours(),
    todayCalories,
    todayProtein,
    targetCal: profile?.cal_target || 2000,
    targetProtein: profile?.protein_target || 150,
    todayFood: food.map((f: any) => ({ meal: f.meal, food: f.food, calories: f.calories })),
    finance: { income, expenses, balance: income - expenses, topCategory },
    workout: {
      today: !!todayWorkout,
      todayType: todayWorkout?.name || '',
      streak,
      monthCount: workouts.length,
    },
    todayTasks: tasks.map((t: any) => ({ title: t.title, done: t.done, priority: t.priority || 'normal' })),
    urgentTasks: tasks.filter((t: any) => t.priority === 'high').map((t: any) => ({ title: t.title })),
    todayHabits,
    todayEvents: [],
    goals: goals.map((g: any) => ({ title: g.title })),
    todayReminders: reminders.map((r: any) => ({ time: r.time || '', text: r.title || '' })),
  }
}

// ââ Ask Shimshon ââââââââââââââââââââââââââââââââââââââââââââââââââ
export async function askShimshon(
  messages: ShimshonMessage[],
  context: LifeContext,
  userId?: string | null,
  authToken?: string | null
): Promise<string> {
  try {
    const res = await fetch('/api/shimshon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        })),
        context,
        userId: userId || null,
        authToken: authToken || null,
      })
    })
    if (!res.ok) return '×©×××× ××ª×§×©××¨×ª ×¢× ×©××©××'
    const data = await res.json()
    const text = data.text || '...'
    // Prefix with __REFRESH__ so ShimshonChat knows to reload context
    if (data.needsRefresh && data.actionResult?.success) {
      return '__REFRESH__:' + text
    }
    return text
  } catch {
    return '×©××××ª ×ª×§×©××¨×ª'
  }
}

// ââ Daily briefing ââââââââââââââââââââââââââââââââââââââââââââââââ
export async function getDailyBriefing(context: LifeContext): Promise<string> {
  const f = context.finance || {}
  const w = context.workout || {}
  const h = context.todayHabits || []
  const u = context.urgentTasks || []
  const bal = f.balance ?? f.monthBalance ?? 0

  const prompt = `×ª× ×× ×ª××¨×× ×××§×¨ ×§×¦×¨ â 3-4 ××©×¤×××. ××××:
1. ×¤×× × ×¡××: ${bal >= 0 ? '+' : ''}âª${Number(bal).toLocaleString()}
2. ×××××: ${w.today ? '××' : '××'}, streak: ${w.streak || 0}
3. ××¨××××: ${h.filter((x:any)=>x.done).length}/${h.length}
4. ××××£: ${u.length > 0 ? u.map((x:any)=>x.title).join(', ') : '×××'}
××× ×¡×¤×¦××¤× ××¢× ××¡×¤×¨××.`

  return askShimshon([{ role: 'user', content: prompt }], context)
}

// ââ Navigation intent detection ââââââââââââââââââââââââââââââââââ
export function detectNavIntent(msg: string): string | null {
  const m = msg.toLowerCase()
  if (m.includes('×ª××× ×') || m.includes('××××') || m.includes('××¨×××')) return 'nutrition'
  if (m.includes('×¤×× × ×¡××') || m.includes('××¡×£') || m.includes('×××¦×××ª')) return 'finance'
  if (m.includes('×××××') || m.includes('×××©×¨') || m.includes('×¡×¤××¨×')) return 'workout'
  if (m.includes('××¨××××') || m.includes('××¨××')) return 'habits'
  if (m.includes('××©××××ª') || m.includes('××©×××')) return 'tasks'
  if (m.includes('××× ×©× ×') || m.includes('×××¨××¢') || m.includes('×¤×××©×')) return 'calendar'
  if (m.includes('××©×§×¢××ª') || m.includes('×× ×××ª')) return 'invest'
  if (m.includes('×ª××××¨××ª')) return 'reminders'
  return null
}
