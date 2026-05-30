import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { format, subDays, eachDayOfInterval, startOfMonth } from 'date-fns'
import { he } from 'date-fns/locale'
import './Workout.css'

interface Workout { id: string; date: string; type: string; notes: string; duration_min: number }
interface WSet { id: string; workout_id: string; exercise: string; sets: number; reps: number; weight_kg: number }

const WORKOUT_PLANS = [
  { name: 'חזה + כתפיים', color: '#EF4444', emoji: '💪', exercises: ['לחיצת חזה', 'לחיצת כתפיים', 'פשיטות חזה', 'עליות צד', 'טריצפס'] },
  { name: 'גב + ביצפס', color: '#3B82F6', emoji: '🏋', exercises: ['משיכה רחבה', 'חתירה', 'כפיפות ביצפס', 'פרפרים', 'שכיבות שורה'] },
  { name: 'רגליים', color: '#8B5CF6', emoji: '🦵', exercises: ['סקוואט', 'לגפרסס', 'ריחוף', 'כפיפות רגל', 'עגל'] },
  { name: 'כל הגוף', color: '#F59E0B', emoji: '⚡', exercises: ['דדליפט', 'סקוואט', 'לחיצת חזה', 'משיכה', 'כפיפות בטן'] },
  { name: 'קרדיו', color: '#10B981', emoji: '🏃', exercises: ['ריצה', 'אופניים', 'חבל', 'בורפי', 'ספרינט'] },
]

export default function Workout({ user }: { user: User }) {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [sets, setSets] = useState<Record<string, WSet[]>>({})
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null)
  const [activeSets, setActiveSets] = useState<WSet[]>([])
  const [selectedPlan, setSelectedPlan] = useState<typeof WORKOUT_PLANS[0] | null>(null)
  const [showPlans, setShowPlans] = useState(false)
  const [timer, setTimer] = useState(0)
  const [restTimer, setRestTimer] = useState(0)
  const [restActive, setRestActive] = useState(false)
  const [exercise, setExercise] = useState('')
  const [numSets, setNumSets] = useState('4')
  const [reps, setReps] = useState('10')
  const [weight, setWeight] = useState('')
  const [tab, setTab] = useState<'today'|'history'|'stats'>('today')

  const now = new Date()

  const load = useCallback(async () => {
    const { data: w } = await supabase.from('workouts').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(50)
    setWorkouts(w || [])
    // Load sets for recent workouts
    if (w && w.length > 0) {
      const { data: s } = await supabase.from('workout_sets').select('*').in('workout_id', w.slice(0,10).map((x:any) => x.id))
      const grouped: Record<string, WSet[]> = {}
      ;(s || []).forEach((st: WSet) => { grouped[st.workout_id] = [...(grouped[st.workout_id]||[]), st] })
      setSets(grouped)
    }
  }, [user.id])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!activeWorkout) return
    const i = setInterval(() => setTimer(t => t + 1), 1000)
    return () => clearInterval(i)
  }, [!!activeWorkout])

  useEffect(() => {
    if (!restActive) return
    if (restTimer <= 0) { setRestActive(false); return }
    const i = setInterval(() => setRestTimer(t => { if (t <= 1) { setRestActive(false); return 0 } return t - 1 }), 1000)
    return () => clearInterval(i)
  }, [restActive, restTimer])

  const startWorkout = async (plan: typeof WORKOUT_PLANS[0]) => {
    const { data, error } = await supabase.from('workouts').insert({
      user_id: user.id, date: format(now, 'yyyy-MM-dd'), type: plan.name, notes: '', duration_min: 0
    }).select().single()
    if (!error && data) {
      setActiveWorkout(data)
      setActiveSets([])
      setSelectedPlan(plan)
      setShowPlans(false)
      setTimer(0)
      setExercise(plan.exercises[0])
    }
  }

  const addSet = async () => {
    if (!activeWorkout || !exercise) return
    const { data, error } = await supabase.from('workout_sets').insert({
      workout_id: activeWorkout.id, user_id: user.id,
      exercise, sets: parseInt(numSets)||1, reps: parseInt(reps)||1, weight_kg: parseFloat(weight)||0
    }).select().single()
    if (!error && data) {
      setActiveSets(p => [...p, data])
      setRestTimer(90)
      setRestActive(true)
    }
  }

  const finish = async () => {
    if (!activeWorkout) return
    const dur = Math.round(timer/60)
    await supabase.from('workouts').update({ duration_min: dur }).eq('id', activeWorkout.id)
    setActiveWorkout(null)
    setActiveSets([])
    setSelectedPlan(null)
    setTimer(0)
    load()
  }

  const fmt = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  const thisMonth = workouts.filter(w => w.date >= format(startOfMonth(now), 'yyyy-MM-dd'))
  const totalVolume = Object.values(sets).flat().reduce((s, st) => s + st.sets * st.reps * st.weight_kg, 0)

  // PR tracking per exercise
  const prMap: Record<string, number> = {}
  Object.values(sets).flat().forEach(st => {
    if (!prMap[st.exercise] || st.weight_kg > prMap[st.exercise]) prMap[st.exercise] = st.weight_kg
  })

  // Frequency last 30 days
  const last30 = eachDayOfInterval({ start: subDays(now, 29), end: now })

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{ color: 'var(--m-workout)' }}>◈</span> אימונים</h1>
          <p className="module-sub">{thisMonth.length} אימונים החודש</p>
        </div>
        {!activeWorkout && <button className="btn-gold" onClick={() => setShowPlans(true)}>▶ התחל אימון</button>}
      </div>

      {/* Stats bar */}
      <div className="wo-stats">
        <div className="wo-stat card">
          <div className="wo-stat-val" style={{ color: 'var(--red)' }}>{workouts.length}</div>
          <div className="wo-stat-label">סה"כ אימונים</div>
        </div>
        <div className="wo-stat card">
          <div className="wo-stat-val" style={{ color: 'var(--amber)' }}>{Math.round(totalVolume).toLocaleString()}</div>
          <div className="wo-stat-label">נפח כולל ק"ג</div>
        </div>
        <div className="wo-stat card">
          <div className="wo-stat-val" style={{ color: 'var(--blue)' }}>{Object.keys(prMap).length}</div>
          <div className="wo-stat-label">תרגילים</div>
        </div>
        <div className="wo-stat card">
          <div className="wo-stat-val" style={{ color: 'var(--green)' }}>
            {workouts[0] ? Math.round(workouts.reduce((s,w) => s+w.duration_min, 0)/workouts.length) : 0}
          </div>
          <div className="wo-stat-label">דקות ממוצע</div>
        </div>
      </div>

      {/* Frequency heatmap */}
      <div className="card wo-heatmap-card">
        <div className="wo-section-title">תדירות — 30 ימים</div>
        <div className="wo-heatmap">
          {last30.map(d => {
            const ds = format(d, 'yyyy-MM-dd')
            const w = workouts.find(w => w.date === ds)
            return (
              <div key={ds} className="wo-heat-cell"
                style={{ background: w ? 'var(--m-workout)' : 'var(--surface3)', opacity: w ? 1 : 0.3 }}
                title={w ? w.type : ds} />
            )
          })}
        </div>
      </div>

      {/* Active workout */}
      {activeWorkout && selectedPlan && (
        <div className="wo-active card fade-in">
          <div className="wo-active-header">
            <div className="wo-active-info">
              <div className="wo-active-plan">{selectedPlan.emoji} {selectedPlan.name}</div>
              <div className="wo-active-timer" style={{ color: 'var(--red)' }}>{fmt(timer)}</div>
            </div>
            {restActive && (
              <div className="wo-rest-timer">
                <div className="wo-rest-label">מנוחה</div>
                <div className="wo-rest-count">{restTimer}s</div>
              </div>
            )}
            <button className="btn-gold" onClick={finish}>סיים ✓</button>
          </div>

          {/* Active sets */}
          <div className="wo-active-sets">
            {activeSets.map((s, i) => (
              <div key={s.id} className="wo-set-row">
                <span className="wo-set-num">{i+1}</span>
                <span className="wo-set-ex">{s.exercise}</span>
                <span className="wo-set-detail">{s.sets}×{s.reps}</span>
                <span className="wo-set-wt">{s.weight_kg > 0 ? `${s.weight_kg}kg` : 'BW'}</span>
                <span className="wo-set-vol">{Math.round(s.sets * s.reps * s.weight_kg)}kg</span>
              </div>
            ))}
          </div>

          {/* Quick exercise buttons from plan */}
          <div className="wo-quick-ex">
            {selectedPlan.exercises.map(ex => (
              <button key={ex} className={`wo-ex-chip ${exercise === ex ? 'active' : ''}`}
                style={exercise === ex ? { background: selectedPlan.color + '22', color: selectedPlan.color, borderColor: selectedPlan.color } : {}}
                onClick={() => setExercise(ex)}>{ex}</button>
            ))}
          </div>

          {/* Add set form */}
          <div className="wo-add-form">
            <input className="form-input" value={exercise} onChange={e => setExercise(e.target.value)} placeholder="תרגיל" />
            <div className="wo-form-row">
              <div className="mfield"><label>סטים</label><input className="form-input" type="number" value={numSets} onChange={e => setNumSets(e.target.value)} /></div>
              <div className="mfield"><label>חזרות</label><input className="form-input" type="number" value={reps} onChange={e => setReps(e.target.value)} /></div>
              <div className="mfield"><label>ק"ג</label><input className="form-input" type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="0" /></div>
              <button className="btn-primary" onClick={addSet} style={{ alignSelf: 'flex-end', height: 40 }}>+ הוסף</button>
            </div>
          </div>
        </div>
      )}

      {/* Plan selector */}
      {showPlans && !activeWorkout && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPlans(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header"><h3>בחר תוכנית אימון</h3><button className="modal-close" onClick={() => setShowPlans(false)}>✕</button></div>
            <div className="wo-plans-grid">
              {WORKOUT_PLANS.map(p => (
                <button key={p.name} className="wo-plan-card card card-hover" onClick={() => startWorkout(p)}>
                  <div className="wo-plan-emoji" style={{ background: p.color + '18' }}>{p.emoji}</div>
                  <div className="wo-plan-name">{p.name}</div>
                  <div className="wo-plan-exs">{p.exercises.slice(0,3).join(' · ')}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="wo-tabs">
        {(['today','history','stats'] as const).map(t => (
          <button key={t} className={`wo-tab ${tab===t?'active':''}`} onClick={() => setTab(t)}>
            {t === 'today' ? 'אחרונים' : t === 'history' ? 'היסטוריה' : 'PR & סטטס'}
          </button>
        ))}
      </div>

      {tab === 'history' && (
        <div className="wo-history">
          {workouts.map(w => (
            <div key={w.id} className="wo-hist-card card">
              <div className="wo-hist-left">
                <div className="wo-hist-icon" style={{ background: (WORKOUT_PLANS.find(p=>p.name===w.type)?.color||'#EF4444') + '18', color: WORKOUT_PLANS.find(p=>p.name===w.type)?.color||'#EF4444' }}>
                  {WORKOUT_PLANS.find(p=>p.name===w.type)?.emoji || '◈'}
                </div>
                <div>
                  <div className="wo-hist-type">{w.type}</div>
                  <div className="wo-hist-date">{format(new Date(w.date), 'd בMMMM', { locale: he })}{w.duration_min > 0 ? ` · ${w.duration_min} דק'` : ''}</div>
                </div>
              </div>
              <div className="wo-hist-right">
                {sets[w.id] && <div className="wo-hist-sets">{sets[w.id].length} תרגילים</div>}
                {sets[w.id] && <div className="wo-hist-vol">{Math.round(sets[w.id].reduce((s,st)=>s+st.sets*st.reps*st.weight_kg,0)).toLocaleString()}kg</div>}
              </div>
            </div>
          ))}
          {workouts.length === 0 && <p className="text-hint" style={{ textAlign:'center', padding:'40px 0', fontSize:14 }}>אין אימונים עדיין.</p>}
        </div>
      )}

      {tab === 'today' && (
        <div className="wo-history">
          {workouts.slice(0,5).map(w => (
            <div key={w.id} className="wo-hist-card card">
              <div className="wo-hist-left">
                <div className="wo-hist-icon" style={{ background: (WORKOUT_PLANS.find(p=>p.name===w.type)?.color||'#EF4444') + '18', color: WORKOUT_PLANS.find(p=>p.name===w.type)?.color||'#EF4444' }}>
                  {WORKOUT_PLANS.find(p=>p.name===w.type)?.emoji || '◈'}
                </div>
                <div>
                  <div className="wo-hist-type">{w.type}</div>
                  <div className="wo-hist-date">{format(new Date(w.date), 'd בMMMM', { locale: he })}{w.duration_min > 0 ? ` · ${w.duration_min} דק'` : ''}</div>
                </div>
              </div>
              <div className="wo-hist-right">
                {sets[w.id] && <><div className="wo-hist-sets">{sets[w.id].length} תרגילים</div><div className="wo-hist-vol">{Math.round(sets[w.id].reduce((s,st)=>s+st.sets*st.reps*st.weight_kg,0)).toLocaleString()}kg נפח</div></>}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'stats' && (
        <div className="wo-pr-grid">
          <div className="card wo-pr-card">
            <div className="wo-section-title">שיאים אישיים (PR)</div>
            {Object.entries(prMap).sort((a,b)=>b[1]-a[1]).map(([ex, kg]) => (
              <div key={ex} className="wo-pr-row">
                <span className="wo-pr-ex">🏆 {ex}</span>
                <span className="wo-pr-kg">{kg} ק"ג</span>
              </div>
            ))}
            {Object.keys(prMap).length === 0 && <p className="text-hint" style={{ fontSize:13 }}>עדיין אין PRs</p>}
          </div>
          <div className="card wo-types-card">
            <div className="wo-section-title">אימונים לפי סוג</div>
            {WORKOUT_PLANS.map(p => {
              const count = workouts.filter(w => w.type === p.name).length
              return count > 0 ? (
                <div key={p.name} className="wo-type-row">
                  <span>{p.emoji} {p.name}</span>
                  <div className="wo-type-bar-wrap">
                    <div className="wo-type-bar" style={{ width: `${(count/workouts.length)*100}%`, background: p.color }} />
                  </div>
                  <span style={{ color: p.color, fontWeight: 700 }}>{count}</span>
                </div>
              ) : null
            })}
          </div>
        </div>
      )}
    </div>
  )
}
