import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { format, subDays, eachDayOfInterval, startOfMonth, addDays, differenceInDays } from 'date-fns'
import { he } from 'date-fns/locale'
import './Workout.css'

interface Workout { id: string; date: string; type: string; notes: string; duration_min: number }
interface WSet { id: string; workout_id: string; exercise: string; sets: number; reps: number; weight_kg: number }
interface ExerciseData {
  name: string; category: string; primaryMuscles: string[]; secondaryMuscles: string[]
  level: string; equipment: string; instructions: string[]; images: string[]
}

const MUSCLE_GROUPS = [
  { id: 'chest',     label: 'חזה',     emoji: '💪', muscles: ['chest'] },
  { id: 'back',      label: 'גב',       emoji: '🔙', muscles: ['lats','middle back','lower back','traps'] },
  { id: 'shoulders', label: 'כתפיים',  emoji: '🏋', muscles: ['shoulders'] },
  { id: 'biceps',    label: 'ביצפס',   emoji: '💪', muscles: ['biceps'] },
  { id: 'triceps',   label: 'טריצפס',  emoji: '💪', muscles: ['triceps'] },
  { id: 'legs',      label: 'רגליים',  emoji: '🦵', muscles: ['quadriceps','hamstrings','glutes','calves'] },
  { id: 'abs',       label: 'בטן',      emoji: '🎯', muscles: ['abdominals'] },
  { id: 'cardio',    label: 'קרדיו',   emoji: '🏃', muscles: [] },
]

const PROGRAMS = [
  { name: 'Push Pull Legs', shortName: 'PPL', color: '#F43F5E', emoji: '⚡', freq: 3,
    days: [
      { label: 'Push', sub: 'חזה · כתפיים · טריצפס', muscles: ['chest','shoulders','triceps'], icon: '→' },
      { label: 'Pull', sub: 'גב · ביצפס', muscles: ['lats','middle back','biceps'], icon: '←' },
      { label: 'Legs', sub: 'רגליים · ישבן', muscles: ['quadriceps','hamstrings','glutes','calves'], icon: '↓' },
    ]},
  { name: 'Upper / Lower', shortName: 'U/L', color: '#3B82F6', emoji: '🔄', freq: 4,
    days: [
      { label: 'Upper', sub: 'חלק עליון כולו', muscles: ['chest','lats','shoulders','biceps','triceps'], icon: '↑' },
      { label: 'Lower', sub: 'חלק תחתון + קור', muscles: ['quadriceps','hamstrings','glutes','calves','abdominals'], icon: '↓' },
    ]},
  { name: 'Full Body', shortName: 'FB', color: '#10B981', emoji: '🏋', freq: 3,
    days: [
      { label: 'Full Body', sub: 'גוף שלם', muscles: ['chest','lats','quadriceps','shoulders','biceps','triceps'], icon: '◉' },
    ]},
  { name: 'Bro Split', shortName: 'BS', color: '#8B5CF6', emoji: '💪', freq: 5,
    days: [
      { label: 'חזה', sub: 'Chest day', muscles: ['chest'], icon: '💪' },
      { label: 'גב', sub: 'Back day', muscles: ['lats','middle back'], icon: '🔙' },
      { label: 'כתפיים', sub: 'Shoulders day', muscles: ['shoulders','traps'], icon: '🏋' },
      { label: 'ידיים', sub: 'Arms day', muscles: ['biceps','triceps'], icon: '💪' },
      { label: 'רגליים', sub: 'Leg day', muscles: ['quadriceps','hamstrings','glutes'], icon: '🦵' },
    ]},
]

const calc1RM = (weight: number, reps: number) => Math.round(weight * (1 + reps / 30))
const EXERCISE_DB_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'

// ── Muscle SVG Map (simplified human body) ──────────────
function MuscleMap({ trained }: { trained: string[] }) {
  const hasAny = trained.length > 0
  const isActive = (muscle: string) =>
    trained.some(t => t.toLowerCase().includes(muscle.toLowerCase()) ||
      muscle.toLowerCase().includes(t.toLowerCase()))
  // When no selection, show all at low opacity to indicate it's a body map
  const getOpacity = (active: boolean, baseHigh: number, baseLow: number) =>
    active ? baseHigh : (hasAny ? baseLow * 0.4 : baseLow)
  return (
    <svg viewBox="0 0 120 200" className="muscle-map-svg" aria-label="מפת שרירים">
      {/* Body outline */}
      <ellipse cx="60" cy="28" rx="18" ry="20" fill="none" stroke="var(--border2)" strokeWidth="1.5"/>
      {/* Chest */}
      <path d="M44 52 Q52 48 60 50 Q68 48 76 52 L74 64 Q66 62 60 64 Q54 62 46 64 Z"
        fill={isActive('chest') ? '#F43F5E' : 'var(--surface3)'}
        opacity={getOpacity(isActive('chest'), 0.8, 0.4)} className="muscle-part" data-muscle="chest"/>
      {/* Shoulders */}
      <ellipse cx="36" cy="52" rx="9" ry="8"
        fill={isActive('shoulders') ? '#3B82F6' : 'var(--surface3)'}
        opacity={getOpacity(isActive('shoulders'), 0.8, 0.4)}/>
      <ellipse cx="84" cy="52" rx="9" ry="8"
        fill={isActive('shoulders') ? '#3B82F6' : 'var(--surface3)'}
        opacity={getOpacity(isActive('shoulders'), 0.8, 0.4)}/>
      {/* Biceps */}
      <rect x="26" y="60" width="12" height="24" rx="6"
        fill={isActive('biceps') ? '#10B981' : 'var(--surface3)'}
        opacity={getOpacity(isActive('biceps'), 0.8, 0.4)}/>
      <rect x="82" y="60" width="12" height="24" rx="6"
        fill={isActive('biceps') ? '#10B981' : 'var(--surface3)'}
        opacity={getOpacity(isActive('biceps'), 0.8, 0.4)}/>
      {/* Triceps */}
      <rect x="24" y="62" width="10" height="20" rx="5"
        fill={isActive('triceps') ? '#8B5CF6' : 'var(--surface3)'}
        opacity={getOpacity(isActive('triceps'), 0.7, 0.3)}/>
      <rect x="86" y="62" width="10" height="20" rx="5"
        fill={isActive('triceps') ? '#8B5CF6' : 'var(--surface3)'}
        opacity={getOpacity(isActive('triceps'), 0.7, 0.3)}/>
      {/* Abs */}
      <rect x="52" y="66" width="16" height="28" rx="4"
        fill={isActive('abdominals') ? '#F59E0B' : 'var(--surface3)'}
        opacity={getOpacity(isActive('abdominals'), 0.8, 0.4)}/>
      {/* Lats */}
      <path d="M44 54 L40 76 Q52 80 60 78 Q68 80 80 76 L76 54 Q68 58 60 60 Q52 58 44 54Z"
        fill={isActive('lats') || isActive('back') ? '#14B8A6' : 'var(--surface3)'}
        opacity={getOpacity(isActive('lats') || isActive('back'), 0.5, 0.2)}/>
      {/* Quads */}
      <rect x="44" y="100" width="14" height="38" rx="7"
        fill={isActive('quadriceps') || isActive('legs') ? '#F59E0B' : 'var(--surface3)'}
        opacity={getOpacity(isActive('quadriceps') || isActive('legs'), 0.8, 0.4)}/>
      <rect x="62" y="100" width="14" height="38" rx="7"
        fill={isActive('quadriceps') || isActive('legs') ? '#F59E0B' : 'var(--surface3)'}
        opacity={getOpacity(isActive('quadriceps') || isActive('legs'), 0.8, 0.4)}/>
      {/* Calves */}
      <rect x="44" y="142" width="12" height="28" rx="6"
        fill={isActive('calves') || isActive('legs') ? '#10B981' : 'var(--surface3)'}
        opacity={getOpacity(isActive('calves') || isActive('legs'), 0.8, 0.4)}/>
      <rect x="64" y="142" width="12" height="28" rx="6"
        fill={isActive('calves') || isActive('legs') ? '#10B981' : 'var(--surface3)'}
        opacity={getOpacity(isActive('calves') || isActive('legs'), 0.8, 0.4)}/>
      {/* Glutes */}
      <ellipse cx="51" cy="98" rx="9" ry="8"
        fill={isActive('glutes') ? '#EC4899' : 'var(--surface3)'}
        opacity={getOpacity(isActive('glutes'), 0.7, 0.3)}/>
      <ellipse cx="69" cy="98" rx="9" ry="8"
        fill={isActive('glutes') ? '#EC4899' : 'var(--surface3)'}
        opacity={getOpacity(isActive('glutes'), 0.7, 0.3)}/>
    </svg>
  )
}

// ── Volume Ring ──────────────────────────────────────────
function VolumeRing({ value, max, color, label, sub }: { value: number; max: number; color: string; label: string; sub: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  const r = 32, circ = 2 * Math.PI * r
  return (
    <div className="vol-ring-wrap">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface3)" strokeWidth="6"/>
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${circ * pct} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 40 40)"
          style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)' }}/>
        <text x="40" y="38" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--text)"
          fontFamily="DM Sans, Heebo, sans-serif">{label}</text>
        <text x="40" y="52" textAnchor="middle" fontSize="9" fill="var(--text3)"
          fontFamily="DM Sans, Heebo, sans-serif">{sub}</text>
      </svg>
    </div>
  )
}

export default function Workout({ user }: { user: User }) {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [sets, setSets] = useState<Record<string, WSet[]>>({})
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null)
  const [activeSets, setActiveSets] = useState<WSet[]>([])

  const [exerciseDB, setExerciseDB] = useState<ExerciseData[]>([])
  const [dbLoaded, setDbLoaded] = useState(false)
  const [dbLoading, setDbLoading] = useState(false)
  const [exSearch, setExSearch] = useState('')
  const [selectedMuscle, setSelectedMuscle] = useState('chest')
  const [selectedExercise, setSelectedExercise] = useState<ExerciseData | null>(null)
  const [showExercisePicker, setShowExercisePicker] = useState(false)
  const [showProgramPicker, setShowProgramPicker] = useState(false)
  const [selectedProgram, setSelectedProgram] = useState<typeof PROGRAMS[0] | null>(null)
  const [selectedProgramDay, setSelectedProgramDay] = useState(0)

  const [timer, setTimer] = useState(0)
  const [restTimer, setRestTimer] = useState(0)
  const [restActive, setRestActive] = useState(false)
  const [exercise, setExercise] = useState('')
  const [numSets, setNumSets] = useState('3')
  const [reps, setReps] = useState('10')
  const [weight, setWeight] = useState('')
  const [tab, setTab] = useState<'hero'|'log'|'stats'|'exercises'>('hero')

  const timerRef = useRef<any>()
  const now = new Date()

  const loadExerciseDB = useCallback(async () => {
    if (dbLoaded) return
    setDbLoading(true)
    try {
      const res = await fetch(EXERCISE_DB_URL)
      setExerciseDB(await res.json())
      setDbLoaded(true)
    } catch {}
    setDbLoading(false)
  }, [dbLoaded])

  const loadWorkouts = useCallback(async () => {
    const { data: w } = await supabase.from('workouts').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(60)
    setWorkouts(w || [])
    if (w?.length) {
      const { data: s } = await supabase.from('workout_sets').select('*').in('workout_id', w.slice(0,20).map((x:any)=>x.id))
      const grouped: Record<string, WSet[]> = {}
      ;(s||[]).forEach((st:WSet) => { grouped[st.workout_id]=[...(grouped[st.workout_id]||[]),st] })
      setSets(grouped)
    }
  }, [user.id])

  useEffect(() => { loadWorkouts() }, [loadWorkouts])

  useEffect(() => {
    if (!activeWorkout) { clearInterval(timerRef.current); return }
    timerRef.current = setInterval(() => setTimer(t=>t+1), 1000)
    return () => clearInterval(timerRef.current)
  }, [!!activeWorkout])

  useEffect(() => {
    if (!restActive) return
    if (restTimer <= 0) { setRestActive(false); return }
    const i = setInterval(() => setRestTimer(t => { if(t<=1){setRestActive(false);return 0} return t-1 }), 1000)
    return () => clearInterval(i)
  }, [restActive, restTimer])

  const startWorkout = async (type: string) => {
    const { data, error } = await supabase.from('workouts').insert({
      user_id: user.id, date: format(now,'yyyy-MM-dd'), type, notes:'', duration_min:0
    }).select().single()
    if (!error && data) {
      setActiveWorkout(data); setActiveSets([]); setTimer(0)
      setShowProgramPicker(false); setTab('log')
    }
  }

  const addSet = async () => {
    if (!activeWorkout || !exercise) return
    const { data, error } = await supabase.from('workout_sets').insert({
      workout_id: activeWorkout.id, user_id: user.id,
      exercise, sets: parseInt(numSets)||1, reps: parseInt(reps)||1, weight_kg: parseFloat(weight)||0
    }).select().single()
    if (!error && data) { setActiveSets(p=>[...p,data]); setRestTimer(90); setRestActive(true) }
  }

  const finish = async () => {
    if (!activeWorkout) return
    await supabase.from('workouts').update({ duration_min: Math.round(timer/60) }).eq('id', activeWorkout.id)
    setActiveWorkout(null); setActiveSets([]); setTimer(0); setRestActive(false)
    loadWorkouts(); setTab('hero')
  }

  const fmt = (s:number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  // ── Computed stats ──────────────────────────────────────
  const thisMonth = workouts.filter(w => w.date >= format(startOfMonth(now),'yyyy-MM-dd'))
  const allSets = Object.values(sets).flat()
  const totalVolume = allSets.reduce((s,st)=>s+st.sets*st.reps*st.weight_kg, 0)
  const avgDuration = workouts.length > 0
    ? Math.round(workouts.filter(w=>w.duration_min>0).reduce((s,w)=>s+w.duration_min,0) / Math.max(workouts.filter(w=>w.duration_min>0).length,1))
    : 0

  // Streak
  let streak = 0
  for (let i=0; i<60; i++) {
    const d = format(subDays(now,i),'yyyy-MM-dd')
    if (workouts.some(w=>w.date===d)) streak++
    else if (i>0) break
  }

  // PRs
  const prMap: Record<string,{weight:number;oneRM:number}> = {}
  allSets.forEach(st => {
    const orm = calc1RM(st.weight_kg, st.reps)
    if (!prMap[st.exercise] || st.weight_kg > prMap[st.exercise].weight)
      prMap[st.exercise] = { weight: st.weight_kg, oneRM: orm }
  })

  // Next workout prediction based on program + history
  const lastWorkout = workouts[0]
  const daysSinceLast = lastWorkout ? differenceInDays(now, new Date(lastWorkout.date)) : 999
  const nextWorkoutDate = daysSinceLast === 0 ? 'מחר' : daysSinceLast === 1 ? 'היום' : 'היום'

  // What program day is next
  const getNextProgramDay = () => {
    if (!selectedProgram) return null
    const recentTypes = workouts.slice(0,6).map(w=>w.type)
    for (let i=0; i<selectedProgram.days.length; i++) {
      const day = selectedProgram.days[i]
      const lastUsed = recentTypes.findIndex(t=>t.includes(day.label))
      if (lastUsed === -1) return { day, idx: i }
    }
    const lastDayIdx = recentTypes.reduce((best, t, i) => {
      const dayIdx = selectedProgram.days.findIndex(d=>t.includes(d.label))
      return dayIdx !== -1 && i < (workouts.length) ? dayIdx : best
    }, -1)
    return { day: selectedProgram.days[(lastDayIdx+1) % selectedProgram.days.length], idx: (lastDayIdx+1) % selectedProgram.days.length }
  }

  const nextDay = getNextProgramDay()

  // Calendar days last 5 weeks
  const calDays = eachDayOfInterval({ start: subDays(now, 34), end: now })

  // Filtered exercises
  const muscleGroup = MUSCLE_GROUPS.find(m=>m.id===selectedMuscle)
  const filteredEx = exerciseDB.filter(e => {
    const matchM = !muscleGroup || muscleGroup.muscles.length===0 ||
      muscleGroup.muscles.some(m=>e.primaryMuscles?.includes(m)||e.secondaryMuscles?.includes(m))
    return matchM && (!exSearch || e.name.toLowerCase().includes(exSearch.toLowerCase()))
  }).slice(0, 40)

  const TABS = [
    { id:'hero',      label:'הבא',     emoji:'⚡' },
    { id:'log',       label:'אימון',   emoji:'▶' },
    { id:'stats',     label:'סטטס',    emoji:'📊' },
    { id:'exercises', label:'תרגילים', emoji:'📚' },
  ]

  return (
    <div className="module-page fade-in">
      {/* Header */}
      <div className="module-header">
        <div>
          <h1 className="module-title">
            <span style={{color:'var(--m-workout)'}}>◈</span> אימונים
          </h1>
          <p className="module-sub">
            {thisMonth.length} החודש · {streak > 0 ? `🔥 ${streak} ימי streak` : 'אין streak פעיל'}
          </p>
        </div>
        <div style={{display:'flex',gap:8}}>
          {!activeWorkout ? (
            <>
              <button className="btn-ghost" onClick={()=>setShowProgramPicker(true)}>📋 תוכנית</button>
              <button className="btn-gold" onClick={()=>startWorkout('אימון חופשי')}>▶ התחל</button>
            </>
          ) : (
            <button className="btn-gold" style={{background:'var(--green)',color:'#fff'}} onClick={finish}>
              ✓ סיים · {fmt(timer)}
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="wo-kpi-row">
        <VolumeRing value={thisMonth.length} max={12} color="var(--m-workout)" label={String(thisMonth.length)} sub="אימונים" />
        <VolumeRing value={totalVolume} max={50000} color="var(--amber)" label={`${Math.round(totalVolume/1000)}K`} sub="נפח" />
        <VolumeRing value={Object.keys(prMap).length} max={20} color="var(--gold)" label={String(Object.keys(prMap).length)} sub="PRs" />
        <VolumeRing value={avgDuration} max={90} color="var(--teal)" label={`${avgDuration}'`} sub="ממוצע" />
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn ${tab===t.id?'active':''}`}
            onClick={() => { setTab(t.id as any); if(t.id==='exercises') loadExerciseDB() }}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* ── HERO TAB — Next Workout ──────────────────────── */}
      {tab === 'hero' && (
        <div className="wo-hero-layout">
          {/* Next workout card */}
          <div className="wo-next-card card">
            <div className="wo-next-header">
              <div>
                <div className="wo-next-badge">
                  <span className="wo-next-dot"/>האימון הבא
                </div>
                <h2 className="wo-next-title">
                  {nextDay ? nextDay.day.label : 'אימון חופשי'}
                </h2>
                <p className="wo-next-sub">
                  {nextDay ? nextDay.day.sub : 'בחר תוכנית לקבל המלצה חכמה'}
                </p>
              </div>
              {selectedProgram && (
                <div className="wo-next-prog-badge" style={{borderColor: selectedProgram.color, color: selectedProgram.color}}>
                  {selectedProgram.emoji} {selectedProgram.shortName}
                </div>
              )}
            </div>

            {/* Timing recommendation */}
            <div className="wo-timing-row">
              <div className="wo-timing-chip" style={{borderColor:'var(--green)', background:'var(--green-dim)'}}>
                <span style={{color:'var(--green)'}}>📅</span>
                <div>
                  <div className="wo-timing-label">מתי לאמן</div>
                  <div className="wo-timing-val" style={{color:'var(--green)'}}>
                    {daysSinceLast === 0 ? 'מחר בבוקר' : daysSinceLast >= 2 ? 'היום — זמן!' : 'מחר'}
                  </div>
                </div>
              </div>
              <div className="wo-timing-chip" style={{borderColor:'var(--amber)', background:'var(--amber-dim)'}}>
                <span style={{color:'var(--amber)'}}>⏱</span>
                <div>
                  <div className="wo-timing-label">זמן מומלץ</div>
                  <div className="wo-timing-val" style={{color:'var(--amber)'}}>
                    {avgDuration > 0 ? `~${avgDuration} דקות` : '~60 דקות'}
                  </div>
                </div>
              </div>
              <div className="wo-timing-chip" style={{borderColor:'var(--blue)', background:'var(--blue-dim)'}}>
                <span style={{color:'var(--blue)'}}>💤</span>
                <div>
                  <div className="wo-timing-label">מנוחה אחרונה</div>
                  <div className="wo-timing-val" style={{color:'var(--blue)'}}>
                    {daysSinceLast === 0 ? 'היום' : daysSinceLast === 1 ? 'אתמול' : `לפני ${daysSinceLast} ימים`}
                  </div>
                </div>
              </div>
            </div>

            {/* Streak counter */}
            {streak > 0 && (
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0'}}>
                <div className="wo-streak-hero">🔥 {streak}</div>
                <div style={{fontSize:12,color:'var(--text3)'}}>ימי streak רצופים</div>
              </div>
            )}

            {/* Muscle map + program progress */}
            <div className="wo-next-body">
              <div className="wo-muscle-map-wrap">
                <MuscleMap trained={nextDay ? nextDay.day.muscles : []} />
                <div className="wo-map-labels">
                  {nextDay?.day.muscles.slice(0,4).map(m => (
                    <span key={m} className="wo-map-label">{m}</span>
                  ))}
                </div>
              </div>

              {selectedProgram && (
                <div className="wo-prog-progress">
                  <div className="wo-prog-title">{selectedProgram.emoji} {selectedProgram.name}</div>
                  <div className="wo-prog-freq">
                    <span>תדירות מומלצת:</span>
                    <span style={{color:'var(--gold)',fontWeight:700}}> {selectedProgram.freq}x שבוע</span>
                  </div>
                  <div className="wo-prog-days-list">
                    {selectedProgram.days.map((d, i) => {
                      const isNext = nextDay?.idx === i
                      const lastUsed = workouts.findIndex(w=>w.type.includes(d.label))
                      const done = lastUsed !== -1 && lastUsed < 3
                      return (
                        <div key={i} className={`wo-prog-day-item ${isNext?'next':''} ${done?'done':''}`}>
                          <span className="wo-prog-day-icon">{d.icon}</span>
                          <div>
                            <div className="wo-prog-day-name">{d.label}</div>
                            <div className="wo-prog-day-sub">{d.sub}</div>
                          </div>
                          {isNext && <span className="wo-prog-next-tag">הבא ›</span>}
                          {done && !isNext && <span className="wo-prog-done-tag">✓</span>}
                        </div>
                      )
                    })}
                  </div>
                  {/* Remaining this week */}
                  <div className="wo-week-remaining">
                    <div className="wo-week-label">השבוע</div>
                    <div className="wo-week-dots">
                      {Array.from({length: selectedProgram.freq}, (_,i) => {
                        const d = format(subDays(now, now.getDay()-1+i), 'yyyy-MM-dd')
                        const done = workouts.some(w => w.date === d)
                        return <div key={i} className={`wo-week-dot ${done?'done':''}`} style={done?{background:'var(--green)'}:{}} />
                      })}
                    </div>
                    <div className="wo-week-text" style={{color:'var(--text3)',fontSize:12}}>
                      {workouts.filter(w => {
                        const start = format(subDays(now, now.getDay()-1), 'yyyy-MM-dd')
                        return w.date >= start
                      }).length} / {selectedProgram.freq} אימונים
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* CTA */}
            <div className="wo-character">💪</div>
            <button className="btn-gold wo-start-btn"
              onClick={() => nextDay ? startWorkout(`${selectedProgram?.shortName} — ${nextDay.day.label}`) : startWorkout('אימון חופשי')}>
              ▶ התחל {nextDay ? nextDay.day.label : 'אימון'}
            </button>
          </div>

          {/* Right column — heatmap + recent */}
          <div className="wo-hero-side">
            {/* Activity heatmap */}
            <div className="card wo-heatmap-card">
              <div className="wo-section-title">פעילות — 5 שבועות</div>
              <div className="wo-heatmap-grid">
                {['א','ב','ג','ד','ה','ו','ש'].map(d => (
                  <div key={d} className="wo-hm-day-label">{d}</div>
                ))}
                {calDays.map(d => {
                  const ds = format(d,'yyyy-MM-dd')
                  const w = workouts.find(w=>w.date===ds)
                  const isToday = ds === format(now,'yyyy-MM-dd')
                  return (
                    <div key={ds} className={`wo-hm-cell ${w?'active':''} ${isToday?'today':''}`}
                      style={w?{background:'var(--m-workout)'}:{}}
                      title={w ? w.type : ds}/>
                  )
                })}
              </div>
            </div>

            {/* Recent workouts */}
            <div className="card wo-recent-card">
              <div className="wo-section-title">אחרונים</div>
              {workouts.slice(0,5).map(w => {
                const wSets = sets[w.id] || []
                const vol = wSets.reduce((s,st)=>s+st.sets*st.reps*st.weight_kg,0)
                return (
                  <div key={w.id} className="wo-recent-row">
                    <div className="wo-recent-icon" style={{color:'var(--m-workout)'}}>◈</div>
                    <div className="wo-recent-info">
                      <div className="wo-recent-type">{w.type}</div>
                      <div className="wo-recent-meta">
                        {format(new Date(w.date),'d בMMM',{locale:he})}
                        {w.duration_min > 0 && ` · ${w.duration_min}'`}
                        {vol > 0 && ` · ${Math.round(vol)}kg`}
                      </div>
                    </div>
                    <div className="wo-recent-sets">{wSets.length > 0 && `${wSets.length} תרגילים`}</div>
                  </div>
                )
              })}
              {workouts.length === 0 && (
                <div className="empty-state" style={{padding:'20px 0'}}>
                  <div className="empty-state-icon">💪</div>
                  <p>התחל את האימון הראשון!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ACTIVE WORKOUT ───────────────────────────────── */}
      {tab === 'log' && (
        <div>
          {activeWorkout ? (
            <div className="wo-active card fade-in">
              <div className="wo-active-header">
                <div>
                  <div className="wo-active-type">{activeWorkout.type}</div>
                  <div className="wo-active-timer">{fmt(timer)}</div>
                </div>
                {restActive && (
                  <div className="wo-rest-box">
                    <div className="wo-rest-label">מנוחה</div>
                    <div className="wo-rest-count">{fmt(restTimer)}</div>
                    <button className="wo-rest-skip" onClick={()=>setRestActive(false)}>דלג</button>
                  </div>
                )}
              </div>

              {activeSets.length > 0 && (
                <div className="wo-sets-log">
                  {activeSets.map((s,i) => (
                    <div key={s.id} className="wo-set-row">
                      <span className="wo-set-num">{i+1}</span>
                      <span className="wo-set-ex">{s.exercise}</span>
                      <span className="wo-set-info">{s.sets}×{s.reps}</span>
                      <span className="wo-set-wt">{s.weight_kg > 0 ? `${s.weight_kg}kg` : 'BW'}</span>
                      {s.weight_kg > 0 && <span className="wo-set-1rm">1RM≈{calc1RM(s.weight_kg,s.reps)}kg</span>}
                    </div>
                  ))}
                </div>
              )}

              <div className="wo-add-form">
                <div style={{display:'flex',gap:8}}>
                  <input className="form-input" style={{flex:1}} value={exercise}
                    onChange={e=>setExercise(e.target.value)} placeholder="שם תרגיל..." />
                  <button className="btn-ghost" onClick={()=>{loadExerciseDB();setShowExercisePicker(true)}}>🔍</button>
                </div>
                <div className="wo-form-row">
                  <div className="mfield"><label>סטים</label>
                    <input className="form-input" type="number" value={numSets} onChange={e=>setNumSets(e.target.value)} min="1"/></div>
                  <div className="mfield"><label>חזרות</label>
                    <input className="form-input" type="number" value={reps} onChange={e=>setReps(e.target.value)} min="1"/></div>
                  <div className="mfield"><label>ק"ג</label>
                    <input className="form-input" type="number" value={weight} onChange={e=>setWeight(e.target.value)} placeholder="0" step="0.5"/></div>
                  {weight && reps && (
                    <div className="mfield"><label>1RM</label>
                      <div className="form-input" style={{display:'flex',alignItems:'center',color:'var(--amber)',fontWeight:700,cursor:'default'}}>
                        {calc1RM(parseFloat(weight)||0, parseInt(reps)||1)}kg
                      </div>
                    </div>
                  )}
                  <button className="btn-gold" onClick={addSet} disabled={!exercise} style={{alignSelf:'flex-end',height:40}}>+ הוסף</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">◈</div>
              <p>אין אימון פעיל. עבור ל"הבא" כדי להתחיל.</p>
              <button className="btn-gold" style={{marginTop:12}} onClick={()=>setTab('hero')}>← הבא</button>
            </div>
          )}
        </div>
      )}

      {/* ── STATS TAB ────────────────────────────────────── */}
      {tab === 'stats' && (
        <div className="wo-stats-grid">
          {/* PRs */}
          <div className="card wo-pr-card">
            <div className="wo-section-title">🏆 שיאים אישיים</div>
            {Object.entries(prMap).sort((a,b)=>b[1].weight-a[1].weight).slice(0,10).map(([ex,pr]) => (
              <div key={ex} className="wo-pr-row">
                <span className="wo-pr-ex">{ex}</span>
                <div style={{flex:1, height:4, background:'var(--surface3)', borderRadius:2, margin:'0 8px'}}>
                  <div style={{height:'100%', width:`${(pr.weight/200)*100}%`, background:'var(--gold)', borderRadius:2, maxWidth:'100%'}}/>
                </div>
                <span className="wo-pr-kg" style={{color:'var(--gold)'}}>{pr.weight}kg</span>
                <span className="wo-pr-orm" style={{color:'var(--text3)'}}>1RM≈{pr.oneRM}</span>
              </div>
            ))}
            {Object.keys(prMap).length === 0 && <p style={{color:'var(--text3)',fontSize:13,marginTop:8}}>אין PRs עדיין</p>}
          </div>

          {/* Volume by type */}
          <div className="card wo-types-card">
            <div className="wo-section-title">📊 לפי תוכנית</div>
            {PROGRAMS.map(p => {
              const count = workouts.filter(w=>w.type.startsWith(p.shortName)).length
              const total = workouts.length
              return count > 0 ? (
                <div key={p.name} className="wo-type-row">
                  <span>{p.emoji} {p.shortName}</span>
                  <div className="wo-type-bar-wrap">
                    <div style={{height:'100%',width:`${(count/Math.max(total,1))*100}%`,background:p.color,borderRadius:2}}/>
                  </div>
                  <span style={{color:p.color,fontWeight:700,minWidth:24}}>{count}</span>
                </div>
              ) : null
            })}
          </div>
        </div>
      )}

      {/* ── EXERCISES TAB ────────────────────────────────── */}
      {tab === 'exercises' && (
        <div>
          {!dbLoaded && !dbLoading && (
            <div className="empty-state">
              <div className="empty-state-icon">📚</div>
              <p style={{marginBottom:16}}>873 תרגילים עם הוראות מפורטות</p>
              <button className="btn-gold" onClick={loadExerciseDB}>טען מסד תרגילים</button>
            </div>
          )}
          {dbLoading && <div className="empty-state"><p>טוען תרגילים...</p></div>}
          {dbLoaded && (
            <>
              <input className="form-input" style={{marginBottom:12}} value={exSearch}
                onChange={e=>setExSearch(e.target.value)} placeholder="חפש תרגיל..." />
              <div className="ex-muscle-tabs" style={{marginBottom:14}}>
                {MUSCLE_GROUPS.map(m=>(
                  <button key={m.id} className={`ex-muscle-tab ${selectedMuscle===m.id?'active':''}`}
                    onClick={()=>setSelectedMuscle(m.id)}>{m.emoji} {m.label}</button>
                ))}
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {filteredEx.map(ex=>(
                  <div key={ex.name} className="ex-row card card-hover" onClick={()=>setSelectedExercise(ex)}>
                    <div className="ex-row-info">
                      <div className="ex-row-name">{ex.name}</div>
                      <div className="ex-row-meta">
                        <span className="badge badge-blue">{ex.level}</span>
                        <span className="ex-tag">{ex.equipment}</span>
                        <span className="ex-tag" style={{color:'var(--red)'}}>{ex.primaryMuscles?.[0]}</span>
                      </div>
                    </div>
                    <span style={{color:'var(--text3)',fontSize:12}}>›</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Program picker modal */}
      {showProgramPicker && !activeWorkout && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowProgramPicker(false)}>
          <div className="modal-card card fade-in" style={{maxWidth:580}}>
            <div className="modal-header">
              <h3>בחר תוכנית אימון</h3>
              <button className="modal-close" onClick={()=>setShowProgramPicker(false)}>✕</button>
            </div>
            <div style={{padding:'16px 24px 24px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {PROGRAMS.map(p=>(
                <div key={p.name} className="card" style={{padding:14,border:`1px solid ${p.color}22`}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                    <span style={{fontSize:20}}>{p.emoji}</span>
                    <div>
                      <div style={{fontWeight:700,fontSize:14,color:p.color}}>{p.name}</div>
                      <div style={{fontSize:11,color:'var(--text3)'}}>{p.freq}x שבוע</div>
                    </div>
                  </div>
                  {p.days.map((day,di)=>(
                    <button key={di} className="btn-surface" style={{width:'100%',marginBottom:4,fontSize:12,justifyContent:'flex-start'}}
                      onClick={()=>{
                        setSelectedProgram(p); setSelectedProgramDay(di)
                        startWorkout(`${p.shortName} — ${day.label}`)
                        setShowProgramPicker(false)
                      }}>
                      {day.icon} {day.label}
                    </button>
                  ))}
                  <button className="btn-ghost" style={{width:'100%',fontSize:11,marginTop:4}}
                    onClick={()=>{setSelectedProgram(p);setShowProgramPicker(false)}}>
                    הגדר כתוכנית הפעילה
                  </button>
                </div>
              ))}
            </div>
            <div style={{textAlign:'center',paddingBottom:16}}>
              <button className="btn-ghost" onClick={()=>{startWorkout('אימון חופשי');setShowProgramPicker(false)}}>
                אימון חופשי ללא תוכנית →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exercise picker modal */}
      {showExercisePicker && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowExercisePicker(false)}>
          <div className="modal-card card fade-in" style={{maxWidth:640,maxHeight:'85vh',display:'flex',flexDirection:'column'}}>
            <div className="modal-header">
              <h3>בחר תרגיל {dbLoading?'(טוען...)':dbLoaded?`(${exerciseDB.length})`:'- לחץ לטעינה'}</h3>
              <button className="modal-close" onClick={()=>{setShowExercisePicker(false);setSelectedExercise(null)}}>✕</button>
            </div>
            {selectedExercise ? (
              <div style={{overflow:'auto',flex:1,padding:'0 24px 24px'}}>
                <button className="btn-ghost" style={{marginBottom:12}} onClick={()=>setSelectedExercise(null)}>← חזור</button>
                <h3 style={{fontSize:18,fontWeight:800,marginBottom:8}}>{selectedExercise.name}</h3>
                <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
                  <span className="badge badge-blue">{selectedExercise.level}</span>
                  <span className="badge" style={{background:'var(--surface3)',color:'var(--text2)'}}>{selectedExercise.equipment}</span>
                  <span className="badge badge-red">{selectedExercise.primaryMuscles?.join(', ')}</span>
                </div>
                {selectedExercise.images?.[0] && (
                  <img src={`${IMG_BASE}${selectedExercise.images[0]}`} alt={selectedExercise.name}
                    style={{width:'100%',borderRadius:12,marginBottom:14}} onError={e=>(e.currentTarget.style.display='none')}/>
                )}
                <div className="ex-instructions">
                  {selectedExercise.instructions?.map((inst,i)=>(
                    <div key={i} className="ex-step"><span className="ex-step-num">{i+1}</span><span>{inst}</span></div>
                  ))}
                </div>
                <button className="btn-gold" style={{width:'100%',marginTop:16}} onClick={()=>{
                  setExercise(selectedExercise.name); setShowExercisePicker(false); setSelectedExercise(null)
                }}>בחר תרגיל זה</button>
              </div>
            ) : (
              <>
                <div style={{padding:'0 24px 12px',display:'flex',flexDirection:'column',gap:10}}>
                  <input className="form-input" value={exSearch} onChange={e=>setExSearch(e.target.value)} placeholder="חפש..." autoFocus/>
                  <div className="ex-muscle-tabs">
                    {MUSCLE_GROUPS.map(m=>(
                      <button key={m.id} className={`ex-muscle-tab ${selectedMuscle===m.id?'active':''}`}
                        onClick={()=>setSelectedMuscle(m.id)}>{m.emoji} {m.label}</button>
                    ))}
                  </div>
                </div>
                <div style={{flex:1,overflow:'auto',padding:'0 24px 24px',display:'flex',flexDirection:'column',gap:6}}>
                  {filteredEx.map(ex=>(
                    <div key={ex.name} className="ex-row card card-hover" onClick={()=>setSelectedExercise(ex)}>
                      <div className="ex-row-info">
                        <div className="ex-row-name">{ex.name}</div>
                        <div className="ex-row-meta">
                          <span className="badge badge-blue">{ex.level}</span>
                          <span className="ex-tag" style={{color:'var(--red)'}}>{ex.primaryMuscles?.[0]}</span>
                        </div>
                      </div>
                      <button className="btn-ghost" style={{fontSize:11,height:28}} onClick={e=>{
                        e.stopPropagation(); setExercise(ex.name); setShowExercisePicker(false)
                      }}>בחר</button>
                    </div>
                  ))}
                  {filteredEx.length===0 && !dbLoading && (
                    <div className="empty-state" style={{padding:'20px 0'}}>
                      {dbLoaded ? 'לא נמצאו תרגילים' : (
                        <button className="btn-gold" onClick={loadExerciseDB}>טען תרגילים</button>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Exercise detail from exercises tab */}
      {selectedExercise && tab==='exercises' && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setSelectedExercise(null)}>
          <div className="modal-card card fade-in" style={{maxWidth:520,maxHeight:'85vh',overflowY:'auto'}}>
            <div className="modal-header">
              <h3>{selectedExercise.name}</h3>
              <button className="modal-close" onClick={()=>setSelectedExercise(null)}>✕</button>
            </div>
            <div style={{padding:'0 24px 24px'}}>
              {selectedExercise.images?.[0] && (
                <img src={`${IMG_BASE}${selectedExercise.images[0]}`} alt={selectedExercise.name}
                  style={{width:'100%',borderRadius:12,marginBottom:14,marginTop:14}}
                  onError={e=>(e.currentTarget.style.display='none')}/>
              )}
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
                <span className="badge badge-blue">{selectedExercise.level}</span>
                <span className="badge" style={{background:'var(--surface3)',color:'var(--text2)'}}>{selectedExercise.equipment}</span>
                <span className="badge badge-red">{selectedExercise.primaryMuscles?.join(', ')}</span>
              </div>
              <div className="ex-instructions">
                {selectedExercise.instructions?.map((inst,i)=>(
                  <div key={i} className="ex-step"><span className="ex-step-num">{i+1}</span><span>{inst}</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
