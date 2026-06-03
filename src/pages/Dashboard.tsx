import { useState, useEffect, useCallback } from 'react'
import { format, subDays, eachDayOfInterval, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns'
import { he } from 'date-fns/locale'
import { LifeContext } from '../lib/shimshon'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import './Dashboard.css'

interface Props { context: LifeContext; onNavigate: (page: string) => void; user: User }

const CAT_COLORS: Record<string,string> = {
  food:'#F59E0B', transport:'#3B82F6', housing:'#8B5CF6', entertainment:'#EF4444',
  health:'#10B981', subscriptions:'#9F7AFF', groceries:'#84CC16', dining:'#F43F5E',
  salary:'#10B981', other:'#6B7280', insurance:'#64748B', utilities:'#0891B2'
}
const CAT_LABELS: Record<string,string> = {
  food:'אוכל', transport:'תחבורה', housing:'דיור', entertainment:'בידור',
  health:'בריאות', subscriptions:'מנויים', salary:'משכורת', other:'אחר',
  groceries:'סופר', dining:'מסעדות', insurance:'ביטוח', utilities:'חשבונות'
}

function StatCard({ icon, label, value, sub, color, onClick }: any) {
  return (
    <div className="dash-stat-card card card-hover" onClick={onClick}>
      <div className="dash-stat-icon" style={{color, background: color + '15'}}>{icon}</div>
      <div className="dash-stat-body">
        <div className="dash-stat-label">{label}</div>
        <div className="dash-stat-value" style={{color}}>{value}</div>
        {sub && <div className="dash-stat-sub">{sub}</div>}
      </div>
    </div>
  )
}

export default function Dashboard({ context, onNavigate, user }: Props) {
  const [transactions, setTransactions] = useState<any[]>([])
  const [habits, setHabits] = useState<any[]>([])
  const [habitLogs, setHabitLogs] = useState<any[]>([])
  const [workouts, setWorkouts] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [reminders, setReminders] = useState<any[]>([])
  const [investments, setInvestments] = useState<any[]>([])
  const [calEvents, setCalEvents] = useState<any[]>([])

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 5 ? 'לילה טוב' : hour < 12 ? 'בוקר טוב' : hour < 17 ? 'שלום' : hour < 21 ? 'ערב טוב' : 'לילה טוב'
  const today = format(now, 'yyyy-MM-dd')

  const load = useCallback(async () => {
    const ms = startOfMonth(now), me = endOfMonth(now)
    const last30 = format(subDays(now, 30), 'yyyy-MM-dd')
    const [tx, h, hl, w, t, r, inv, cal] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', user.id).gte('date', format(ms,'yyyy-MM-dd')),
      supabase.from('habits').select('*').eq('user_id', user.id).eq('active', true),
      supabase.from('habit_logs').select('*').eq('user_id', user.id).gte('date', last30),
      supabase.from('workouts').select('*').eq('user_id', user.id).gte('date', last30),
      supabase.from('tasks').select('*').eq('user_id', user.id),
      supabase.from('reminders').select('*').eq('user_id', user.id).eq('active', true),
      supabase.from('investments').select('*').eq('user_id', user.id),
      supabase.from('cal_events').select('*').eq('user_id', user.id).gte('date', today).lte('date', format(subDays(now, -7), 'yyyy-MM-dd')),
    ])
    setTransactions(tx.data||[]); setHabits(h.data||[]); setHabitLogs(hl.data||[])
    setWorkouts(w.data||[]); setTasks(t.data||[]); setReminders(r.data||[])
    setInvestments(inv.data||[]); setCalEvents(cal.data||[])
  }, [user.id])

  useEffect(() => { load() }, [load])

  // Finance
  const income = transactions.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0)
  const expenses = transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0)
  const balance = income - expenses
  const savingsRate = income > 0 ? Math.round(((income-expenses)/income)*100) : 0
  const expByCat: Record<string,number> = {}
  transactions.filter(t=>t.type==='expense').forEach(t=>{ expByCat[t.category]=(expByCat[t.category]||0)+t.amount })
  const topCats = Object.entries(expByCat).sort((a,b)=>b[1]-a[1]).slice(0,4)

  // Habits
  const todayHabits = habits.filter(h=>habitLogs.some(l=>l.habit_id===h.id&&l.date===today))
  const habitPct = habits.length > 0 ? Math.round((todayHabits.length/habits.length)*100) : 0
  const heatDays = eachDayOfInterval({ start: subDays(now, 34), end: now })

  // Tasks
  const pending = tasks.filter(t=>!t.done)
  const urgent = pending.filter(t=>t.priority==='high')
  const donePct = tasks.length > 0 ? Math.round((tasks.filter(t=>t.done).length/tasks.length)*100) : 0

  // Workouts
  const workoutsMonth = workouts.filter(w=>w.date >= format(startOfMonth(now),'yyyy-MM-dd'))
  let workoutStreak = 0
  for (let i=0; i<30; i++) {
    const d = format(subDays(now,i),'yyyy-MM-dd')
    if (workouts.some(w=>w.date===d)) workoutStreak++
    else if (i>0) break
  }

  // Investments
  const totalPortfolio = investments.reduce((s,i)=>s+i.current_value,0)
  const totalInvested = investments.reduce((s,i)=>s+i.amount_invested,0)
  const portfolioGain = totalPortfolio - totalInvested
  const gainPct = totalInvested > 0 ? ((portfolioGain/totalInvested)*100).toFixed(1) : '0'

  // Reminders today
  const weekday = now.getDay()
  const todayReminders = reminders.filter(r =>
    r.frequency==='daily' ||
    (r.frequency==='workdays' && weekday>=0 && weekday<=4) ||
    (r.frequency==='weekly' && r.day_of_week===weekday)
  )

  // Calendar — next 7 days events
  const upcomingEvents = calEvents.sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5)

  const fmt = (n: number) => '₪' + Math.abs(Math.round(n)).toLocaleString('he-IL')

  return (
    <div className="dash fade-in">
      {/* Greeting */}
      <div className="dash-greeting-row">
        <div>
          <h1 className="dash-greeting">{greeting}, <span className="dash-name">{user.email?.split('@')[0]}</span></h1>
          <p className="dash-date">{format(now,'EEEE, d בMMMM yyyy',{locale:he})}</p>
        </div>
        {todayReminders.length > 0 && (
          <button className="dash-remind-pill" onClick={()=>onNavigate('reminders')}>
            ⏰ {todayReminders.length} תזכורות היום
          </button>
        )}
      </div>

      {/* Shimshon briefing */}
      {context.finance && (
        <div className="dash-brief card">
          <div className="dash-brief-avatar">ש</div>
          <div className="dash-brief-body">
            <div className="dash-brief-label">שמשון · ברייפינג</div>
            <p className="dash-brief-text">
              {balance >= 0
                ? `החודש נשאר לך ${fmt(balance)} לאחר הוצאות (חיסכון ${savingsRate}%). `
                : `הוצאת ${fmt(Math.abs(balance))} יותר ממה שהכנסת החודש. `}
              {habitPct === 100 ? 'כל ההרגלים הושלמו היום 🔥 ' : habitPct > 0 ? `${habitPct}% מהרגלים הושלמו. ` : ''}
              {urgent.length > 0 ? `${urgent.length} משימות דחופות ממתינות. ` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Main stats grid */}
      <div className="dash-stats-grid">
        <StatCard icon="₪" label="מאזן חודשי" value={balance >= 0 ? `+${fmt(balance)}` : fmt(balance)}
          sub={`חיסכון ${savingsRate}%`} color={balance >= 0 ? 'var(--green)' : 'var(--red)'}
          onClick={()=>onNavigate('finance')} />
        <StatCard icon="△" label="תיק השקעות" value={fmt(totalPortfolio)}
          sub={`${gainPct}% ${portfolioGain >= 0 ? '↑' : '↓'}`} color="var(--gold)"
          onClick={()=>onNavigate('invest')} />
        <StatCard icon="◈" label="אימונים" value={workoutsMonth.length}
          sub={workoutStreak > 0 ? `🔥 ${workoutStreak} ימים` : 'אין streak'}
          color="var(--m-workout)" onClick={()=>onNavigate('workout')} />
        <StatCard icon="◎" label="הרגלים היום" value={`${todayHabits.length}/${habits.length}`}
          sub={habitPct === 100 ? '🔥 הכל!' : `${habitPct}%`}
          color="var(--m-habits)" onClick={()=>onNavigate('habits')} />
        <StatCard icon="☰" label="משימות" value={pending.length}
          sub={urgent.length > 0 ? `${urgent.length} דחופות` : `${donePct}% הושלם`}
          color="var(--m-tasks)" onClick={()=>onNavigate('tasks')} />
        <StatCard icon="▦" label="אירועים קרובים" value={upcomingEvents.length}
          sub={upcomingEvents[0] ? upcomingEvents[0].title : 'ריק'}
          color="var(--m-calendar)" onClick={()=>onNavigate('calendar')} />
      </div>

      {/* Main content grid */}
      <div className="dash-grid">

        {/* Finance card */}
        <div className="card dash-card">
          <div className="dash-card-header" onClick={()=>onNavigate('finance')}>
            <span className="dash-card-title">💰 פיננסים החודש</span>
            <span className="dash-card-arrow">→</span>
          </div>
          <div className="dash-fin-row">
            <div className="dash-fin-block">
              <div className="dash-fin-label">הכנסות</div>
              <div className="dash-fin-val" style={{color:'var(--green)'}}>{fmt(income)}</div>
            </div>
            <div className="dash-fin-sep" />
            <div className="dash-fin-block">
              <div className="dash-fin-label">הוצאות</div>
              <div className="dash-fin-val" style={{color:'var(--red)'}}>{fmt(expenses)}</div>
            </div>
            <div className="dash-fin-sep" />
            <div className="dash-fin-block">
              <div className="dash-fin-label">מאזן</div>
              <div className="dash-fin-val" style={{color:balance>=0?'var(--green)':'var(--red)'}}>
                {balance>=0?'+':''}{fmt(balance)}
              </div>
            </div>
          </div>
          {/* Flow bar */}
          <div className="dash-flow-bar">
            <div style={{width:`${income>0?Math.min(100,(expenses/income)*100):0}%`, height:'100%', background: balance>=0?'var(--green)':'var(--red)', borderRadius:4, transition:'width .6s'}}/>
          </div>
          {/* Category breakdown */}
          {topCats.map(([cat,amt])=>(
            <div key={cat} className="dash-cat-row">
              <span className="dash-cat-name">{CAT_LABELS[cat]||cat}</span>
              <div className="dash-cat-bar-wrap">
                <div style={{height:'100%', width:`${expenses>0?(amt/expenses)*100:0}%`, background:CAT_COLORS[cat]||'#6B7280', borderRadius:2}}/>
              </div>
              <span className="dash-cat-amt">{fmt(amt)}</span>
            </div>
          ))}
        </div>

        {/* Habits heatmap */}
        <div className="card dash-card">
          <div className="dash-card-header" onClick={()=>onNavigate('habits')}>
            <span className="dash-card-title">◎ הרגלים · 35 ימים</span>
            <span className="dash-card-arrow">→</span>
          </div>
          {/* Ring */}
          <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:14}}>
            <svg width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="none" stroke="var(--surface3)" strokeWidth="5"/>
              <circle cx="32" cy="32" r="26" fill="none" stroke="var(--m-habits)" strokeWidth="5"
                strokeDasharray={`${2*Math.PI*26*habitPct/100} ${2*Math.PI*26}`}
                strokeLinecap="round" transform="rotate(-90 32 32)"
                style={{transition:'stroke-dasharray .8s cubic-bezier(0.4,0,0.2,1)'}}/>
              <text x="32" y="36" textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--text)"
                fontFamily="DM Sans,Heebo,sans-serif">{habitPct}%</text>
            </svg>
            <div>
              <div style={{fontSize:14,fontWeight:700}}>{todayHabits.length}/{habits.length} היום</div>
              {habitPct===100 && <div style={{fontSize:12,color:'var(--m-habits)'}}>🔥 הכל הושלם!</div>}
            </div>
          </div>
          {/* Heatmap */}
          <div className="dash-heatmap">
            {heatDays.map(d=>{
              const ds=format(d,'yyyy-MM-dd')
              const cnt=habits.filter(h=>habitLogs.some(l=>l.habit_id===h.id&&l.date===ds)).length
              const pct=habits.length>0?cnt/habits.length:0
              return <div key={ds} className="dash-heat-cell"
                style={{background:`rgba(20,184,166,${pct===0?0.08:0.15+pct*0.85})`}} title={ds}/>
            })}
          </div>
          {/* Habit chips */}
          <div className="dash-habit-chips">
            {habits.slice(0,6).map(h=>{
              const done=todayHabits.some(th=>th.id===h.id)
              return <div key={h.id} className={`dash-habit-chip ${done?'done':''}`}
                style={done?{background:h.color+'18',borderColor:h.color,color:h.color}:{}}>
                {done&&'✓ '}{h.emoji} {h.name}
              </div>
            })}
          </div>
        </div>

        {/* Tasks */}
        <div className="card dash-card">
          <div className="dash-card-header" onClick={()=>onNavigate('tasks')}>
            <span className="dash-card-title">☰ משימות פתוחות</span>
            <span className="dash-card-arrow">→</span>
          </div>
          {/* Progress bar */}
          <div style={{marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'var(--text3)',marginBottom:5}}>
              <span>{tasks.filter(t=>t.done).length} הושלמו</span>
              <span>{donePct}%</span>
            </div>
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{width:`${donePct}%`,background:'var(--m-tasks)'}}/>
            </div>
          </div>
          {pending.slice(0,6).map(t=>{
            const colors:Record<string,string>={high:'var(--red)',medium:'var(--amber)',low:'var(--text3)'}
            return <div key={t.id} className="dash-task-row">
              <div style={{width:6,height:6,borderRadius:'50%',background:colors[t.priority]||'var(--text3)',flexShrink:0}}/>
              <span className="dash-task-title">{t.title}</span>
              {t.due_date && <span className="dash-task-due">{t.due_date.slice(5)}</span>}
            </div>
          })}
          {pending.length === 0 && <div className="empty-state" style={{padding:'16px 0'}}><p>אין משימות פתוחות 🎉</p></div>}
          {pending.length > 6 && <div style={{fontSize:12,color:'var(--text3)',marginTop:8}}>+ עוד {pending.length-6}</div>}
        </div>

        {/* Investments */}
        {investments.length > 0 && (
          <div className="card dash-card">
            <div className="dash-card-header" onClick={()=>onNavigate('invest')}>
              <span className="dash-card-title">△ השקעות</span>
              <span className="dash-card-arrow">→</span>
            </div>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:24,fontWeight:800,letterSpacing:'-0.03em',color:'var(--gold)'}}>{fmt(totalPortfolio)}</div>
              <div style={{fontSize:12,color:portfolioGain>=0?'var(--green)':'var(--red)',fontWeight:600}}>
                {portfolioGain>=0?'↑':'↓'} {fmt(Math.abs(portfolioGain))} ({gainPct}%)
              </div>
            </div>
            {investments.slice(0,4).map(inv=>{
              const g=inv.current_value-inv.amount_invested
              const pct=inv.amount_invested>0?((g/inv.amount_invested)*100).toFixed(1):'0'
              return <div key={inv.id} className="dash-inv-row">
                <span className="dash-inv-name">{inv.name}</span>
                <span style={{color:g>=0?'var(--green)':'var(--red)',fontSize:12,fontWeight:600}}>{g>=0?'+':''}{pct}%</span>
                <span style={{color:'var(--text2)',fontWeight:700,fontSize:13}}>{fmt(inv.current_value)}</span>
              </div>
            })}
          </div>
        )}

        {/* Calendar */}
        <div className="card dash-card">
          <div className="dash-card-header" onClick={()=>onNavigate('calendar')}>
            <span className="dash-card-title">▦ אירועים קרובים</span>
            <span className="dash-card-arrow">→</span>
          </div>
          {upcomingEvents.length > 0 ? upcomingEvents.map(ev=>(
            <div key={ev.id} className="dash-event-row">
              <div className="dash-event-dot" style={{background:ev.color||'var(--blue)'}}/>
              <div className="dash-event-info">
                <div style={{fontSize:13,fontWeight:600}}>{ev.title}</div>
                <div style={{fontSize:11,color:'var(--text3)'}}>
                  {format(new Date(ev.date),'d MMM',{locale:he})}
                  {ev.start_time && ` · ${ev.start_time}`}
                  {ev.location && ` · 📍${ev.location}`}
                </div>
              </div>
            </div>
          )) : (
            <div className="empty-state" style={{padding:'16px 0'}}>
              <p>אין אירועים קרובים</p>
              <button className="btn-ghost" style={{marginTop:8,fontSize:12}} onClick={()=>onNavigate('calendar')}>+ הוסף אירוע</button>
            </div>
          )}
        </div>

        {/* Workout mini */}
        <div className="card dash-card">
          <div className="dash-card-header" onClick={()=>onNavigate('workout')}>
            <span className="dash-card-title">◈ אימונים</span>
            <span className="dash-card-arrow">→</span>
          </div>
          <div style={{display:'flex',gap:16,marginBottom:12}}>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:24,fontWeight:800,color:'var(--m-workout)'}}>{workoutsMonth.length}</div>
              <div style={{fontSize:11,color:'var(--text3)'}}>החודש</div>
            </div>
            {workoutStreak > 0 && (
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:24,fontWeight:800,color:'var(--amber)'}}>🔥{workoutStreak}</div>
                <div style={{fontSize:11,color:'var(--text3)'}}>streak</div>
              </div>
            )}
          </div>
          {/* mini heatmap */}
          <div style={{display:'flex',gap:3}}>
            {Array.from({length:14},(_,i)=>{
              const d=format(subDays(now,13-i),'yyyy-MM-dd')
              const has=workouts.some(w=>w.date===d)
              return <div key={i} style={{flex:1,height:20,borderRadius:3,background:has?'var(--m-workout)':'var(--surface3)',opacity:has?1:0.25}}/>
            })}
          </div>
          {workouts[0] && (
            <div style={{fontSize:12,color:'var(--text3)',marginTop:10}}>
              אחרון: {format(new Date(workouts[0].date),'d בMMM',{locale:he})} · {workouts[0].type.split('—')[0].trim()}
            </div>
          )}
        </div>

      </div>

      {/* Quick actions */}
      <div className="dash-quick">
        {[
          { id:'finance',   emoji:'₪', label:'הוסף עסקה' },
          { id:'tasks',     emoji:'☰', label:'משימה חדשה' },
          { id:'workout',   emoji:'◈', label:'התחל אימון' },
          { id:'habits',    emoji:'◎', label:'הרגל היום' },
          { id:'calendar',  emoji:'▦', label:'אירוע חדש' },
          { id:'reminders', emoji:'◷', label:'תזכורת' },
        ].map(q=>(
          <button key={q.id} className="dash-quick-btn card card-hover" onClick={()=>onNavigate(q.id)}>
            <span className="dash-quick-emoji">{q.emoji}</span>
            <span className="dash-quick-label">{q.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
