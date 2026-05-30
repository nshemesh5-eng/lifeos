import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { format, subDays, eachDayOfInterval, startOfMonth } from 'date-fns'
import { he } from 'date-fns/locale'
import './Workout.css'

interface Workout { id: string; date: string; type: string; notes: string; duration_min: number }
interface WSet { id: string; workout_id: string; exercise: string; sets: number; reps: number; weight_kg: number }
interface ExerciseData {
  name: string; category: string; primaryMuscles: string[]; secondaryMuscles: string[]
  level: string; equipment: string; instructions: string[]; images: string[]
}

// ---- Muscle group to exercise filter map ----
const MUSCLE_GROUPS = [
  { id: 'chest',       label: 'חזה',        emoji: '💪', muscles: ['chest'] },
  { id: 'back',        label: 'גב',          emoji: '🔙', muscles: ['lats','middle back','lower back','traps'] },
  { id: 'shoulders',   label: 'כתפיים',     emoji: '🏋', muscles: ['shoulders'] },
  { id: 'biceps',      label: 'ביצפס',      emoji: '💪', muscles: ['biceps'] },
  { id: 'triceps',     label: 'טריצפס',     emoji: '💪', muscles: ['triceps'] },
  { id: 'legs',        label: 'רגליים',     emoji: '🦵', muscles: ['quadriceps','hamstrings','glutes','calves','adductors','abductors'] },
  { id: 'abs',         label: 'בטן',         emoji: '🎯', muscles: ['abdominals'] },
  { id: 'cardio',      label: 'קרדיו',      emoji: '🏃', muscles: [] },
]

// Built-in workout programs
const PROGRAMS = [
  {
    name: 'Push Pull Legs', shortName: 'PPL', color: '#EF4444', emoji: '⚡',
    days: [
      { label: 'Push — חזה + כתפיים + טריצפס', muscles: ['chest','shoulders','triceps'] },
      { label: 'Pull — גב + ביצפס', muscles: ['lats','middle back','biceps'] },
      { label: 'Legs — רגליים', muscles: ['quadriceps','hamstrings','glutes','calves'] },
    ]
  },
  {
    name: 'Upper / Lower', shortName: 'U/L', color: '#3B82F6', emoji: '🔄',
    days: [
      { label: 'Upper — גב חלקי עליון', muscles: ['chest','lats','shoulders','biceps','triceps'] },
      { label: 'Lower — גב חלקי תחתון', muscles: ['quadriceps','hamstrings','glutes','calves','abdominals'] },
    ]
  },
  {
    name: 'Full Body', shortName: 'FB', color: '#10B981', emoji: '🏋',
    days: [
      { label: 'Full Body', muscles: ['chest','lats','quadriceps','shoulders','biceps','triceps'] },
    ]
  },
  {
    name: 'Bro Split', shortName: 'BS', color: '#8B5CF6', emoji: '💪',
    days: [
      { label: 'חזה', muscles: ['chest'] },
      { label: 'גב', muscles: ['lats','middle back','lower back'] },
      { label: 'כתפיים', muscles: ['shoulders','traps'] },
      { label: 'ביצפס + טריצפס', muscles: ['biceps','triceps','forearms'] },
      { label: 'רגליים', muscles: ['quadriceps','hamstrings','glutes','calves'] },
    ]
  },
]

// 1RM Epley formula
const calc1RM = (weight: number, reps: number) => Math.round(weight * (1 + reps / 30))

const EXERCISE_DB_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'

export default function Workout({ user }: { user: User }) {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [sets, setSets] = useState<Record<string, WSet[]>>({})
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null)
  const [activeSets, setActiveSets] = useState<WSet[]>([])

  // Exercise DB
  const [exerciseDB, setExerciseDB] = useState<ExerciseData[]>([])
  const [dbLoading, setDbLoading] = useState(false)
  const [dbLoaded, setDbLoaded] = useState(false)
  const [exSearch, setExSearch] = useState('')
  const [selectedMuscle, setSelectedMuscle] = useState<string>('chest')
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
  const [tab, setTab] = useState<'log'|'history'|'stats'|'exercises'>('log')

  const [bodyWeight, setBodyWeight] = useState('')
  const [bodyWeightLog, setBodyWeightLog] = useState<{ date: string; weight: number }[]>([])

  const timerRef = useRef<any>()

  const now = new Date()

  // Load exercise DB
  const loadExerciseDB = useCallback(async () => {
    if (dbLoaded) return
    setDbLoading(true)
    try {
      const res = await fetch(EXERCISE_DB_URL)
      const data: ExerciseData[] = await res.json()
      setExerciseDB(data)
      setDbLoaded(true)
    } catch (e) {
      console.error('Failed to load exercise DB', e)
    }
    setDbLoading(false)
  }, [dbLoaded])

  const loadWorkouts = useCallback(async () => {
    const { data: w } = await supabase.from('workouts').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(50)
    setWorkouts(w || [])
    if (w && w.length > 0) {
      const { data: s } = await supabase.from('workout_sets').select('*').in('workout_id', w.slice(0,15).map((x:any) => x.id))
      const grouped: Record<string, WSet[]> = {}
      ;(s || []).forEach((st: WSet) => { grouped[st.workout_id] = [...(grouped[st.workout_id]||[]), st] })
      setSets(grouped)
    }
  }, [user.id])

  useEffect(() => { loadWorkouts() }, [loadWorkouts])

  // Timer
  useEffect(() => {
    if (!activeWorkout) { clearInterval(timerRef.current); return }
    timerRef.current = setInterval(() => setTimer(t => t + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [!!activeWorkout])

  useEffect(() => {
    if (!restActive) return
    if (restTimer <= 0) { setRestActive(false); return }
    const i = setInterval(() => setRestTimer(t => { if (t <= 1) { setRestActive(false); return 0 } return t - 1 }), 1000)
    return () => clearInterval(i)
  }, [restActive, restTimer])

  const startWorkout = async (type: string) => {
    const { data, error } = await supabase.from('workouts').insert({
      user_id: user.id, date: format(now, 'yyyy-MM-dd'), type, notes: '', duration_min: 0
    }).select().single()
    if (!error && data) {
      setActiveWorkout(data); setActiveSets([]); setTimer(0)
      setShowProgramPicker(false); setShowExercisePicker(false)
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
      setRestTimer(90); setRestActive(true)
    }
  }

  const finish = async () => {
    if (!activeWorkout) return
    await supabase.from('workouts').update({ duration_min: Math.round(timer/60) }).eq('id', activeWorkout.id)
    setActiveWorkout(null); setActiveSets([]); setTimer(0); setRestActive(false)
    loadWorkouts()
  }

  const fmt = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  const thisMonth = workouts.filter(w => w.date >= format(startOfMonth(now), 'yyyy-MM-dd'))
  const allSetsFlat = Object.values(sets).flat()
  const totalVolume = allSetsFlat.reduce((s, st) => s + st.sets * st.reps * st.weight_kg, 0)

  // PR per exercise
  const prMap: Record<string, { weight: number; oneRM: number }> = {}
  allSetsFlat.forEach(st => {
    const orm = calc1RM(st.weight_kg, st.reps)
    if (!prMap[st.exercise] || st.weight_kg > prMap[st.exercise].weight) {
      prMap[st.exercise] = { weight: st.weight_kg, oneRM: orm }
    }
  })

  // Frequency heatmap
  const last30 = eachDayOfInterval({ start: subDays(now, 29), end: now })

  // Filtered exercises
  const muscleGroup = MUSCLE_GROUPS.find(m => m.id === selectedMuscle)
  const filteredEx = exerciseDB.filter(e => {
    const matchMuscle = !muscleGroup || muscleGroup.muscles.length === 0 ||
      muscleGroup.muscles.some(m => e.primaryMuscles?.includes(m) || e.secondaryMuscles?.includes(m))
    const matchSearch = !exSearch || e.name.toLowerCase().includes(exSearch.toLowerCase())
    return matchMuscle && matchSearch
  }).slice(0, 40)

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{ color: 'var(--m-workout)' }}>◈</span> אימונים</h1>
          <p className="module-sub">{thisMonth.length} החודש · {workouts.length} סה"כ</p>
        </div>
        {!activeWorkout && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" onClick={() => { setShowExercisePicker(false); setShowProgramPicker(true) }}>📋 תוכנית</button>
            <button className="btn-gold" onClick={() => startWorkout('אימון חופשי')}>▶ התחל</button>
          </div>
        )}
        {activeWorkout && <button className="btn-gold" onClick={finish}>סיים ✓ {fmt(timer)}</button>}
      </div>

      {/* Stats bar */}
      <div className="wo-stats">
        <div className="wo-stat card">
          <div className="wo-stat-val" style={{ color: 'var(--red)' }}>{workouts.length}</div>
          <div className="wo-stat-label">אימונים</div>
        </div>
        <div className="wo-stat card">
          <div className="wo-stat-val" style={{ color: 'var(--amber)' }}>{Math.round(totalVolume/1000)}K</div>
          <div className="wo-stat-label">נפח ק"ג</div>
        </div>
        <div className="wo-stat card">
          <div className="wo-stat-val" style={{ color: 'var(--blue)' }}>{Object.keys(prMap).length}</div>
          <div className="wo-stat-label">PRs</div>
        </div>
        <div className="wo-stat card">
          <div className="wo-stat-val" style={{ color: 'var(--green)' }}>
            {workouts.length > 0 ? Math.round(workouts.reduce((s,w) => s + w.duration_min, 0) / workouts.length) : 0}
          </div>
          <div className="wo-stat-label">דק' ממוצע</div>
        </div>
      </div>

      {/* Heatmap */}
      <div className="card wo-heatmap-card">
        <div className="wo-section-title">תדירות — 30 ימים</div>
        <div className="wo-heatmap">
          {last30.map(d => {
            const ds = format(d, 'yyyy-MM-dd')
            const w = workouts.find(w => w.date === ds)
            return (
              <div key={ds} className="wo-heat-cell"
                style={{ background: w ? 'var(--m-workout)' : 'var(--surface3)', opacity: w ? 1 : 0.25 }}
                title={w ? w.type : ds} />
            )
          })}
        </div>
      </div>

      {/* Active workout */}
      {activeWorkout && (
        <div className="wo-active card fade-in">
          <div className="wo-active-header">
            <div>
              <div className="wo-active-plan">{activeWorkout.type}</div>
              <div className="wo-active-timer">{fmt(timer)}</div>
            </div>
            {restActive && (
              <div className="wo-rest-timer">
                <div className="wo-rest-label">מנוחה</div>
                <div className="wo-rest-count">{fmt(restTimer)}</div>
                <button className="wo-rest-skip" onClick={() => setRestActive(false)}>דלג</button>
              </div>
            )}
          </div>

          {/* Sets logged */}
          {activeSets.length > 0 && (
            <div className="wo-active-sets">
              {activeSets.map((s, i) => (
                <div key={s.id} className="wo-set-row">
                  <span className="wo-set-num">{i+1}</span>
                  <span className="wo-set-ex">{s.exercise}</span>
                  <span className="wo-set-detail">{s.sets}×{s.reps}</span>
                  <span className="wo-set-wt">{s.weight_kg > 0 ? `${s.weight_kg}kg` : 'BW'}</span>
                  <span className="wo-set-vol" style={{ color: 'var(--amber)' }}>
                    {s.weight_kg > 0 ? `1RM≈${calc1RM(s.weight_kg, s.reps)}kg` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Add set */}
          <div className="wo-add-form">
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" style={{ flex: 1 }} value={exercise} onChange={e => setExercise(e.target.value)} placeholder="שם תרגיל..." />
              <button className="btn-ghost" onClick={() => { loadExerciseDB(); setShowExercisePicker(true) }}>🔍 בחר</button>
            </div>
            <div className="wo-form-row">
              <div className="mfield"><label>סטים</label><input className="form-input" type="number" value={numSets} onChange={e => setNumSets(e.target.value)} min="1" /></div>
              <div className="mfield"><label>חזרות</label><input className="form-input" type="number" value={reps} onChange={e => setReps(e.target.value)} min="1" /></div>
              <div className="mfield"><label>ק"ג</label><input className="form-input" type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="0" step="0.5" /></div>
              {weight && reps && (
                <div className="mfield">
                  <label>1RM</label>
                  <div className="form-input" style={{ display:'flex', alignItems:'center', color:'var(--amber)', fontWeight:700, cursor:'default' }}>
                    {calc1RM(parseFloat(weight)||0, parseInt(reps)||1)}kg
                  </div>
                </div>
              )}
              <button className="btn-primary" onClick={addSet} disabled={!exercise} style={{ alignSelf:'flex-end', height:40 }}>+ הוסף</button>
            </div>
          </div>

          {/* Quick suggestions from program */}
          {selectedProgram && (
            <div className="wo-quick-ex">
              <div className="wo-quick-label">תרגילים מומלצים:</div>
              {exerciseDB.filter(e => {
                const day = selectedProgram.days[selectedProgramDay]
                return day.muscles.some(m => e.primaryMuscles?.includes(m))
              }).slice(0,6).map(e => (
                <button key={e.name} className={`wo-ex-chip ${exercise === e.name ? 'active' : ''}`}
                  style={exercise === e.name ? { background:'var(--red-dim)', color:'var(--red)', borderColor:'var(--red)' } : {}}
                  onClick={() => setExercise(e.name)}>{e.name}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Program picker */}
      {showProgramPicker && !activeWorkout && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowProgramPicker(false)}>
          <div className="modal-card card fade-in" style={{ maxWidth: 560 }}>
            <div className="modal-header"><h3>בחר תוכנית אימון</h3><button className="modal-close" onClick={() => setShowProgramPicker(false)}>✕</button></div>
            <div className="wo-programs-grid">
              {PROGRAMS.map(p => (
                <div key={p.name}>
                  <div className="wo-program-header" style={{ color: p.color }}>
                    <span>{p.emoji}</span> <span>{p.name}</span>
                  </div>
                  {p.days.map((day, di) => (
                    <button key={di} className="wo-program-day card card-hover" onClick={() => {
                      setSelectedProgram(p); setSelectedProgramDay(di)
                      startWorkout(`${p.shortName} — ${day.label}`)
                    }}>
                      <div className="wo-program-day-label">{day.label}</div>
                      <div className="wo-program-day-muscles">{day.muscles.slice(0,4).join(' · ')}</div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button className="btn-ghost" onClick={() => startWorkout('אימון חופשי')}>
                או התחל אימון חופשי →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exercise picker */}
      {showExercisePicker && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowExercisePicker(false)}>
          <div className="modal-card card fade-in" style={{ maxWidth: 680, maxHeight: '85vh', display:'flex', flexDirection:'column' }}>
            <div className="modal-header">
              <h3>בחר תרגיל {dbLoading ? '(טוען...)' : `(${exerciseDB.length})`}</h3>
              <button className="modal-close" onClick={() => setShowExercisePicker(false)}>✕</button>
            </div>

            {selectedExercise ? (
              // Exercise detail view
              <div className="ex-detail" style={{ overflow:'auto', flex:1, padding: '0 24px 24px' }}>
                <button className="btn-ghost" style={{ marginBottom:12 }} onClick={() => setSelectedExercise(null)}>← חזור</button>
                <div className="ex-detail-header">
                  <div>
                    <h3 style={{ fontSize:20, fontWeight:800, marginBottom:6 }}>{selectedExercise.name}</h3>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <span className="badge badge-blue">{selectedExercise.level}</span>
                      <span className="badge badge-gray">{selectedExercise.equipment}</span>
                      <span className="badge" style={{ background:'var(--red-dim)', color:'var(--red)' }}>{selectedExercise.primaryMuscles?.join(', ')}</span>
                    </div>
                  </div>
                  {selectedExercise.images?.[0] && (
                    <img src={`${IMG_BASE}${selectedExercise.images[0]}`} alt={selectedExercise.name}
                      className="ex-detail-img" onError={e => (e.currentTarget.style.display='none')} />
                  )}
                </div>
                {selectedExercise.secondaryMuscles?.length > 0 && (
                  <p style={{ fontSize:13, color:'var(--text3)', marginBottom:12 }}>
                    שרירים משניים: {selectedExercise.secondaryMuscles.join(', ')}
                  </p>
                )}
                <div className="ex-instructions">
                  {selectedExercise.instructions?.map((inst, i) => (
                    <div key={i} className="ex-step">
                      <span className="ex-step-num">{i+1}</span>
                      <span>{inst}</span>
                    </div>
                  ))}
                </div>
                <button className="btn-gold" style={{ width:'100%', marginTop:16 }} onClick={() => {
                  setExercise(selectedExercise.name)
                  setShowExercisePicker(false)
                  setSelectedExercise(null)
                }}>
                  בחר תרגיל זה
                </button>
              </div>
            ) : (
              <>
                <div style={{ padding: '0 24px 12px', display:'flex', flexDirection:'column', gap:10 }}>
                  <input className="form-input" value={exSearch} onChange={e => setExSearch(e.target.value)} placeholder="חפש תרגיל..." />
                  <div className="ex-muscle-tabs">
                    {MUSCLE_GROUPS.map(m => (
                      <button key={m.id}
                        className={`ex-muscle-tab ${selectedMuscle === m.id ? 'active' : ''}`}
                        onClick={() => setSelectedMuscle(m.id)}>
                        {m.emoji} {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ex-list" style={{ flex:1, overflow:'auto', padding:'0 24px 24px' }}>
                  {filteredEx.map(ex => (
                    <div key={ex.name} className="ex-row card card-hover" onClick={() => setSelectedExercise(ex)}>
                      <div className="ex-row-info">
                        <div className="ex-row-name">{ex.name}</div>
                        <div className="ex-row-meta">
                          <span className="ex-tag">{ex.level}</span>
                          <span className="ex-tag">{ex.equipment}</span>
                          <span className="ex-tag" style={{ color:'var(--red)' }}>{ex.primaryMuscles?.[0]}</span>
                        </div>
                      </div>
                      <div className="ex-row-actions">
                        <button className="btn-ghost" style={{ fontSize:12, height:30 }} onClick={e => { e.stopPropagation(); setExercise(ex.name); setShowExercisePicker(false) }}>
                          בחר
                        </button>
                        <span style={{ color:'var(--text3)', fontSize:12 }}>מידע ›</span>
                      </div>
                    </div>
                  ))}
                  {filteredEx.length === 0 && !dbLoading && (
                    <p className="text-hint" style={{ textAlign:'center', padding:'32px 0', fontSize:14 }}>
                      {dbLoaded ? 'לא נמצאו תרגילים' : 'לחץ לטעינת מסד הנתונים'}
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="wo-tabs">
        {(['log','history','stats','exercises'] as const).map(t => (
          <button key={t} className={`wo-tab ${tab===t?'active':''}`}
            onClick={() => { setTab(t); if (t === 'exercises') loadExerciseDB() }}>
            {t === 'log' ? '📋 היסטוריה' : t === 'history' ? '📅 לוח שנה' : t === 'stats' ? '🏆 PRs' : '📚 תרגילים'}
          </button>
        ))}
      </div>

      {/* History */}
      {tab === 'log' && (
        <div className="wo-history">
          {workouts.slice(0,15).map(w => (
            <div key={w.id} className="wo-hist-card card">
              <div className="wo-hist-left">
                <div className="wo-hist-icon">◈</div>
                <div>
                  <div className="wo-hist-type">{w.type}</div>
                  <div className="wo-hist-date">{format(new Date(w.date), 'd בMMMM', { locale: he })}{w.duration_min > 0 ? ` · ${w.duration_min} דק'` : ''}</div>
                </div>
              </div>
              <div className="wo-hist-right">
                {sets[w.id] && (
                  <>
                    <div className="wo-hist-sets">{sets[w.id].length} תרגילים</div>
                    <div className="wo-hist-vol">{Math.round(sets[w.id].reduce((s,st)=>s+st.sets*st.reps*st.weight_kg,0)).toLocaleString()}kg</div>
                  </>
                )}
              </div>
            </div>
          ))}
          {workouts.length === 0 && <p className="text-hint" style={{ textAlign:'center', padding:'40px', fontSize:14 }}>התחל את האימון הראשון שלך 💪</p>}
        </div>
      )}

      {/* Calendar view */}
      {tab === 'history' && (
        <div className="wo-calendar card">
          <div className="wo-cal-grid">
            {last30.map(d => {
              const ds = format(d, 'yyyy-MM-dd')
              const w = workouts.find(w => w.date === ds)
              return (
                <div key={ds} className="wo-cal-cell" style={{ background: w ? 'var(--red-dim)' : 'transparent' }}>
                  <div className="wo-cal-date">{format(d, 'd')}</div>
                  {w && <div className="wo-cal-type">{w.type.split('—')[0].trim().slice(0,8)}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* PR Stats */}
      {tab === 'stats' && (
        <div className="wo-pr-grid">
          <div className="card wo-pr-card">
            <div className="wo-section-title">🏆 שיאים אישיים + 1RM מחושב</div>
            {Object.entries(prMap).sort((a,b)=>b[1].weight-a[1].weight).map(([ex, pr]) => (
              <div key={ex} className="wo-pr-row">
                <span className="wo-pr-ex">{ex}</span>
                <span className="wo-pr-kg">{pr.weight}kg</span>
                <span className="wo-pr-orm">1RM≈{pr.oneRM}kg</span>
              </div>
            ))}
            {Object.keys(prMap).length === 0 && <p className="text-hint" style={{ fontSize:13, marginTop:12 }}>אין PRs עדיין — התחל לאמן!</p>}
          </div>

          <div className="card wo-types-card">
            <div className="wo-section-title">📊 אימונים לפי סוג</div>
            {PROGRAMS.map(p => {
              const count = workouts.filter(w => w.type.startsWith(p.shortName)).length
              const total = workouts.length
              return count > 0 ? (
                <div key={p.name} className="wo-type-row">
                  <span>{p.emoji} {p.shortName}</span>
                  <div className="wo-type-bar-wrap">
                    <div className="wo-type-bar" style={{ width:`${(count/total)*100}%`, background: p.color }} />
                  </div>
                  <span style={{ color: p.color, fontWeight:700 }}>{count}</span>
                </div>
              ) : null
            })}
          </div>
        </div>
      )}

      {/* Exercise browser */}
      {tab === 'exercises' && (
        <div>
          {dbLoading && <p className="text-hint" style={{ textAlign:'center', padding:32 }}>טוען 873 תרגילים...</p>}
          {dbLoaded && (
            <>
              <div className="ex-muscle-tabs" style={{ marginBottom:14 }}>
                {MUSCLE_GROUPS.map(m => (
                  <button key={m.id}
                    className={`ex-muscle-tab ${selectedMuscle === m.id ? 'active' : ''}`}
                    onClick={() => setSelectedMuscle(m.id)}>
                    {m.emoji} {m.label}
                  </button>
                ))}
              </div>
              <input className="form-input" style={{ marginBottom:14 }} value={exSearch} onChange={e => setExSearch(e.target.value)} placeholder="חפש תרגיל..." />
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {filteredEx.map(ex => (
                  <div key={ex.name} className="ex-row card" style={{ cursor:'pointer' }} onClick={() => setSelectedExercise(ex)}>
                    <div className="ex-row-info">
                      <div className="ex-row-name">{ex.name}</div>
                      <div className="ex-row-meta">
                        <span className="ex-tag">{ex.level}</span>
                        <span className="ex-tag">{ex.equipment}</span>
                        <span className="ex-tag" style={{ color:'var(--red)' }}>{ex.primaryMuscles?.[0]}</span>
                        {ex.secondaryMuscles?.length > 0 && <span className="ex-tag" style={{ color:'var(--text3)' }}>{ex.secondaryMuscles.slice(0,2).join(', ')}</span>}
                      </div>
                    </div>
                    <span style={{ color:'var(--text3)', fontSize:12 }}>› פרטים</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {!dbLoaded && !dbLoading && (
            <div style={{ textAlign:'center', padding:48 }}>
              <p className="text-hint" style={{ fontSize:14, marginBottom:16 }}>873 תרגילים עם הוראות מפורטות</p>
              <button className="btn-gold" onClick={loadExerciseDB}>📚 טען מסד תרגילים</button>
            </div>
          )}
        </div>
      )}

      {/* Exercise detail modal (from exercises tab) */}
      {selectedExercise && tab === 'exercises' && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSelectedExercise(null)}>
          <div className="modal-card card fade-in" style={{ maxWidth:560, maxHeight:'85vh', overflowY:'auto' }}>
            <div className="modal-header">
              <h3>{selectedExercise.name}</h3>
              <button className="modal-close" onClick={() => setSelectedExercise(null)}>✕</button>
            </div>
            <div style={{ padding:'0 0 20px' }}>
              {selectedExercise.images?.[0] && (
                <img src={`${IMG_BASE}${selectedExercise.images[0]}`} alt={selectedExercise.name}
                  style={{ width:'100%', borderRadius:12, marginBottom:14 }}
                  onError={e => (e.currentTarget.style.display='none')} />
              )}
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                <span className="badge badge-blue">{selectedExercise.level}</span>
                <span className="badge badge-gray">{selectedExercise.equipment}</span>
                <span className="badge" style={{ background:'var(--red-dim)', color:'var(--red)' }}>{selectedExercise.primaryMuscles?.join(', ')}</span>
                {selectedExercise.secondaryMuscles?.length > 0 && (
                  <span className="badge badge-gray">{selectedExercise.secondaryMuscles.join(', ')}</span>
                )}
              </div>
              <div className="ex-instructions">
                {selectedExercise.instructions?.map((inst, i) => (
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
