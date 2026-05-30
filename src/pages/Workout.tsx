import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { format, subDays } from 'date-fns'
import { he } from 'date-fns/locale'
import './Workout.css'

interface Workout { id: string; user_id: string; date: string; type: string; notes: string; duration_min: number; created_at: string }
interface WorkoutSet { id: string; workout_id: string; exercise: string; sets: number; reps: number; weight_kg: number }

const WORKOUT_TYPES = ['חזה + כתפיים', 'גב + ביצפס', 'רגליים', 'יד שלישית', 'כל הגוף', 'קרדיו', 'יוגה / מתיחות', 'אחר']

export default function Workout({ user }: { user: User }) {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [sets, setSets] = useState<Record<string, WorkoutSet[]>>({})
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [wType, setWType] = useState(WORKOUT_TYPES[0])
  const [timer, setTimer] = useState(0)
  const [timerOn, setTimerOn] = useState(false)

  // New set form
  const [exercise, setExercise] = useState('')
  const [numSets, setNumSets] = useState('3')
  const [reps, setReps] = useState('12')
  const [weight, setWeight] = useState('')
  const [saving, setSaving] = useState(false)

  const loadWorkouts = useCallback(async () => {
    const { data } = await supabase.from('workouts').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(30)
    setWorkouts(data || [])
  }, [user.id])

  const loadSets = useCallback(async (workoutId: string) => {
    const { data } = await supabase.from('workout_sets').select('*').eq('workout_id', workoutId)
    setSets(p => ({ ...p, [workoutId]: data || [] }))
  }, [])

  useEffect(() => { loadWorkouts() }, [loadWorkouts])

  useEffect(() => {
    if (!timerOn) return
    const i = setInterval(() => setTimer(t => t + 1), 1000)
    return () => clearInterval(i)
  }, [timerOn])

  const startWorkout = async () => {
    const { data, error } = await supabase.from('workouts').insert({
      user_id: user.id, date: format(new Date(), 'yyyy-MM-dd'), type: wType, notes: '', duration_min: 0
    }).select().single()
    if (!error && data) {
      setActiveWorkout(data)
      setWorkouts(p => [data, ...p])
      setSets(p => ({ ...p, [data.id]: [] }))
      setTimerOn(true)
      setShowNew(false)
    }
  }

  const addSet = async () => {
    if (!activeWorkout || !exercise) return
    setSaving(true)
    const { data, error } = await supabase.from('workout_sets').insert({
      workout_id: activeWorkout.id, user_id: user.id,
      exercise, sets: parseInt(numSets), reps: parseInt(reps), weight_kg: parseFloat(weight) || 0
    }).select().single()
    if (!error && data) {
      setSets(p => ({ ...p, [activeWorkout.id]: [...(p[activeWorkout.id] || []), data] }))
      setExercise('')
    }
    setSaving(false)
  }

  const finishWorkout = async () => {
    if (!activeWorkout) return
    const dur = Math.round(timer / 60)
    await supabase.from('workouts').update({ duration_min: dur }).eq('id', activeWorkout.id)
    setActiveWorkout(null)
    setTimerOn(false)
    setTimer(0)
    loadWorkouts()
  }

  const fmtTimer = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  const volume = (w: Workout) => (sets[w.id] || []).reduce((s, st) => s + st.sets * st.reps * st.weight_kg, 0)

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{ color: 'var(--m-workout)' }}>◈</span> אימונים</h1>
          <p className="module-sub">לוג אימון, סטים וחזרות</p>
        </div>
        {!activeWorkout && <button className="btn-gold" onClick={() => setShowNew(true)}>+ אימון חדש</button>}
      </div>

      {/* Active workout */}
      {activeWorkout && (
        <div className="workout-active card fade-in">
          <div className="workout-active-header">
            <div>
              <div className="workout-active-type">{activeWorkout.type}</div>
              <div className="workout-active-timer">{fmtTimer(timer)}</div>
            </div>
            <button className="btn-gold" onClick={finishWorkout}>סיים אימון ✓</button>
          </div>

          <div className="workout-sets-list">
            {(sets[activeWorkout.id] || []).map((s, i) => (
              <div key={s.id} className="workout-set-row">
                <span className="workout-set-num">{i + 1}</span>
                <span className="workout-set-exercise">{s.exercise}</span>
                <span className="workout-set-detail">{s.sets} × {s.reps}</span>
                <span className="workout-set-weight">{s.weight_kg > 0 ? `${s.weight_kg} ק"ג` : 'משקל גוף'}</span>
              </div>
            ))}
            {(sets[activeWorkout.id] || []).length === 0 && (
              <p className="text-hint" style={{ fontSize: 13, padding: '12px 0' }}>הוסף סט ראשון ↓</p>
            )}
          </div>

          <div className="workout-add-set">
            <input className="form-input" placeholder="שם תרגיל (למשל: לחיצת חזה)" value={exercise} onChange={e => setExercise(e.target.value)} />
            <div className="workout-set-inputs">
              <div className="mfield"><label>סטים</label><input className="form-input" type="number" value={numSets} onChange={e => setNumSets(e.target.value)} min="1" /></div>
              <div className="mfield"><label>חזרות</label><input className="form-input" type="number" value={reps} onChange={e => setReps(e.target.value)} min="1" /></div>
              <div className="mfield"><label>ק"ג</label><input className="form-input" type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="0" /></div>
              <button className="btn-primary" onClick={addSet} disabled={saving || !exercise} style={{ alignSelf: 'flex-end', height: 40 }}>
                {saving ? '...' : '+ הוסף'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start new workout */}
      {showNew && !activeWorkout && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowNew(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header"><h3>אימון חדש</h3><button className="modal-close" onClick={() => setShowNew(false)}>✕</button></div>
            <div className="mfield" style={{ marginBottom: 20 }}>
              <label>סוג אימון</label>
              <select className="form-input" value={wType} onChange={e => setWType(e.target.value)}>
                {WORKOUT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowNew(false)}>ביטול</button>
              <button className="btn-gold" onClick={startWorkout}>התחל אימון ▶</button>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      <div className="workout-history">
        <div className="workout-history-title">היסטוריית אימונים</div>
        {workouts.filter(w => !activeWorkout || w.id !== activeWorkout.id).map(w => (
          <div key={w.id} className="workout-hist-card card card-hover" onClick={() => { loadSets(w.id) }}>
            <div className="workout-hist-left">
              <div className="workout-hist-icon" style={{ background: 'var(--red-dim)', color: 'var(--red)' }}>◈</div>
              <div>
                <div className="workout-hist-type">{w.type}</div>
                <div className="workout-hist-date">{format(new Date(w.date), 'd בMMMM', { locale: he })} · {w.duration_min > 0 ? `${w.duration_min} דקות` : ''}</div>
              </div>
            </div>
            <div className="workout-hist-right">
              {sets[w.id] && <div className="workout-hist-volume">{sets[w.id].length} תרגילים</div>}
              {sets[w.id] && volume(w) > 0 && <div className="workout-hist-vol2">נפח: {Math.round(volume(w)).toLocaleString()} ק"ג</div>}
            </div>
          </div>
        ))}
        {workouts.length === 0 && <p className="text-hint" style={{ fontSize: 14, padding: '32px 0', textAlign: 'center' }}>אין אימונים עדיין. התחל את הראשון.</p>}
      </div>
    </div>
  )
}
