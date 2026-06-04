import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { format, subDays, eachDayOfInterval, startOfMonth, addDays, differenceInDays } from 'date-fns'
import { he } from 'date-fns/locale'
import './Workout.css'

// ─── Types ───────────────────────────────────────────────
interface Workout { id: string; date: string; type: string; notes: string; duration_min: number }
interface WSet { id: string; workout_id: string; exercise: string; sets: number; reps: number; weight_kg: number }
interface PlanExercise { name: string; sets: number; reps: string; rest: number; notes?: string }
interface PlanDay { label: string; sub: string; muscles: string[]; exercises: PlanExercise[] }
interface WorkoutPlan { id?: string; name: string; shortName: string; color: string; emoji: string; freq: number; days: PlanDay[] }

// ─── Default programs ─────────────────────────────────────
const DEFAULT_PLANS: WorkoutPlan[] = [
  {
    name: 'תוכנית נתנאל — W1', shortName: 'W1', color: '#F5C842', emoji: '🏋', freq: 3,
    days: [
      {
        label: 'A — עליון + רגליים', sub: 'פולי · חזה · ברך · כתפיים · טריצפס',
        muscles: ['lats','chest','quadriceps','shoulders','triceps','abdominals'],
        exercises: [
          { name: 'משיכה מטה פולי עליון',               sets: 3, reps: '12', rest: 120 },
          { name: 'לחיצת חזה בשיפוע עם משקולות יד',    sets: 2, reps: '12', rest: 120 },
          { name: 'פשיטות ברך במכונה',                  sets: 2, reps: '12', rest: 120 },
          { name: 'כפיפות ברך במכונה',                  sets: 2, reps: '12', rest: 120 },
          { name: 'הרחקות כתף משקולות יד בישיבה',       sets: 2, reps: '15', rest: 120 },
          { name: 'פטישים בישיבה בשיפוע',               sets: 2, reps: '10', rest: 120 },
          { name: 'פשיטות מרפק פולי עליון יד יד',       sets: 2, reps: '15', rest: 120 },
          { name: 'כפיפות בטן בשיפוע שלילי',            sets: 2, reps: '15', rest: 120 },
        ]
      },
      {
        label: 'B — גב + חזה + בטן', sub: 'סקוואט · פולי · פרפר · ביצפס · בטן',
        muscles: ['quadriceps','lats','chest','triceps','biceps','abdominals'],
        exercises: [
          { name: 'סקוואט עם מוט',                      sets: 3, reps: '8',  rest: 120 },
          { name: 'משיכה מטה פולי עליון יד יד',        sets: 2, reps: '8',  rest: 120 },
          { name: 'פרפר במכונה',                        sets: 2, reps: '12', rest: 120 },
          { name: 'פרפר הפוך במכונה',                   sets: 2, reps: '10', rest: 120 },
          { name: 'פשיטות מרפק פולי עליון עם מוט',      sets: 2, reps: '12', rest: 120 },
          { name: 'כפיפות מרפק עם משקולות יד כסא כומר', sets: 2, reps: '12', rest: 120 },
          { name: 'כסא רומי',                           sets: 2, reps: '15', rest: 120 },
          { name: 'כפיפה צידית כסא רומי',               sets: 2, reps: '12', rest: 120 },
        ]
      },
      {
        label: 'C — חזה + גב + רגליים', sub: 'לחיצת חזה · חתירה · לחיצת רגליים',
        muscles: ['chest','lats','quadriceps','calves','shoulders','triceps','biceps','abdominals'],
        exercises: [
          { name: 'לחיצת חזה עם מוט',                  sets: 3, reps: '12', rest: 120 },
          { name: 'חתירה במכונה',                       sets: 2, reps: '12', rest: 120 },
          { name: 'לחיצת רגליים',                       sets: 3, reps: '8',  rest: 120 },
          { name: 'לחיצת תאומים',                       sets: 1, reps: '15', rest: 120 },
          { name: 'לחיצת כתפיים במכונה',                sets: 1, reps: '10', rest: 120 },
          { name: 'פשיטות מרפק פולי אמצעי מעל הראש',   sets: 2, reps: '12', rest: 120 },
          { name: 'כפיפות מרפק פולי תחתון עם מוט',     sets: 2, reps: '12', rest: 120 },
          { name: 'כפיפות בטן במכונה',                  sets: 2, reps: '15', rest: 120 },
        ]
      },
    ]
  },
  {
    name: 'Push Pull Legs', shortName: 'PPL', color: '#F43F5E', emoji: '⚡', freq: 3,
    days: [
      { label: 'Push', sub: 'חזה · כתפיים · טריצפס', muscles: ['chest','shoulders','triceps'],
        exercises: [
          { name: 'Bench Press', sets: 4, reps: '8-10', rest: 90 },
          { name: 'Overhead Press', sets: 3, reps: '10-12', rest: 75 },
          { name: 'Incline DB Press', sets: 3, reps: '12', rest: 60 },
          { name: 'Lateral Raises', sets: 4, reps: '15', rest: 45 },
          { name: 'Tricep Dips', sets: 3, reps: '12-15', rest: 60 },
          { name: 'Cable Flyes', sets: 3, reps: '15', rest: 45 },
        ]},
      { label: 'Pull', sub: 'גב · ביצפס', muscles: ['lats','middle back','biceps'],
        exercises: [
          { name: 'Deadlift', sets: 4, reps: '5', rest: 120 },
          { name: 'Pull-ups', sets: 4, reps: '8-10', rest: 90 },
          { name: 'Barbell Row', sets: 3, reps: '10', rest: 75 },
          { name: 'Face Pulls', sets: 3, reps: '15', rest: 45 },
          { name: 'Hammer Curls', sets: 3, reps: '12', rest: 60 },
          { name: 'Preacher Curls', sets: 3, reps: '12', rest: 60 },
        ]},
      { label: 'Legs', sub: 'רגליים · ישבן', muscles: ['quadriceps','hamstrings','glutes','calves'],
        exercises: [
          { name: 'Squat', sets: 4, reps: '8', rest: 120 },
          { name: 'Romanian Deadlift', sets: 3, reps: '10', rest: 90 },
          { name: 'Leg Press', sets: 3, reps: '12', rest: 75 },
          { name: 'Leg Curls', sets: 3, reps: '15', rest: 60 },
          { name: 'Calf Raises', sets: 4, reps: '20', rest: 45 },
          { name: 'Hip Thrust', sets: 3, reps: '12', rest: 75 },
        ]},
    ]
  },
  {
    name: 'Upper / Lower', shortName: 'U/L', color: '#3B82F6', emoji: '🔄', freq: 4,
    days: [
      { label: 'Upper A', sub: 'כוח — חלק עליון', muscles: ['chest','lats','shoulders','biceps','triceps'],
        exercises: [
          { name: 'Bench Press', sets: 4, reps: '6-8', rest: 120 },
          { name: 'Barbell Row', sets: 4, reps: '6-8', rest: 120 },
          { name: 'Overhead Press', sets: 3, reps: '8-10', rest: 90 },
          { name: 'Pull-ups', sets: 3, reps: '8-10', rest: 90 },
          { name: 'Dips', sets: 3, reps: '10-12', rest: 75 },
          { name: 'Barbell Curls', sets: 3, reps: '10-12', rest: 60 },
        ]},
      { label: 'Lower A', sub: 'כוח — חלק תחתון', muscles: ['quadriceps','hamstrings','glutes'],
        exercises: [
          { name: 'Squat', sets: 4, reps: '6-8', rest: 120 },
          { name: 'Romanian Deadlift', sets: 3, reps: '8', rest: 90 },
          { name: 'Leg Press', sets: 3, reps: '10', rest: 75 },
          { name: 'Leg Curls', sets: 3, reps: '12', rest: 60 },
          { name: 'Calf Raises', sets: 4, reps: '15-20', rest: 45 },
        ]},
    ]
  },
  {
    name: 'Full Body', shortName: 'FB', color: '#10B981', emoji: '🏋', freq: 3,
    days: [
      { label: 'Full Body', sub: 'גוף שלם — כוח ונפח', muscles: ['chest','lats','quadriceps','shoulders','biceps','triceps'],
        exercises: [
          { name: 'Squat', sets: 3, reps: '8', rest: 90 },
          { name: 'Bench Press', sets: 3, reps: '8', rest: 90 },
          { name: 'Barbell Row', sets: 3, reps: '8', rest: 90 },
          { name: 'Overhead Press', sets: 3, reps: '10', rest: 75 },
          { name: 'Romanian Deadlift', sets: 3, reps: '10', rest: 75 },
          { name: 'Pull-ups', sets: 3, reps: 'max', rest: 60 },
        ]},
    ]
  },
]

// ─── Helpers ──────────────────────────────────────────────
const calc1RM = (w: number, r: number) => Math.round(w * (1 + r / 30))
const EXERCISE_DB_URL = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
const IMG_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'
const MUSCLE_GROUPS = [
  { id:'chest', label:'חזה', emoji:'💪', muscles:['chest'] },
  { id:'back', label:'גב', emoji:'🔙', muscles:['lats','middle back','lower back','traps'] },
  { id:'shoulders', label:'כתפיים', emoji:'🏋', muscles:['shoulders'] },
  { id:'biceps', label:'ביצפס', emoji:'💪', muscles:['biceps'] },
  { id:'triceps', label:'טריצפס', emoji:'💪', muscles:['triceps'] },
  { id:'legs', label:'רגליים', emoji:'🦵', muscles:['quadriceps','hamstrings','glutes','calves'] },
  { id:'abs', label:'בטן', emoji:'🎯', muscles:['abdominals'] },
  { id:'cardio', label:'קרדיו', emoji:'🏃', muscles:[] },
]

// ─── Muscle Map SVG ───────────────────────────────────────
function MuscleMap({ trained }: { trained: string[] }) {
  const hasAny = trained.length > 0
  const isActive = (muscle: string) =>
    trained.some(t => t.toLowerCase().includes(muscle.toLowerCase()) ||
      muscle.toLowerCase().includes(t.toLowerCase()))
  const getOpacity = (active: boolean, hi: number, lo: number) =>
    active ? hi : (hasAny ? lo * 0.3 : lo)
  return (
    <svg viewBox="0 0 120 200" className="muscle-map-svg">
      <ellipse cx="60" cy="28" rx="18" ry="20" fill="none" stroke="var(--border2)" strokeWidth="1.5"/>
      <path d="M44 52 Q52 48 60 50 Q68 48 76 52 L74 64 Q66 62 60 64 Q54 62 46 64 Z"
        fill={isActive('chest') ? '#F43F5E' : 'var(--surface3)'} opacity={getOpacity(isActive('chest'), 0.9, 0.45)}/>
      <ellipse cx="36" cy="52" rx="9" ry="8"
        fill={isActive('shoulders') ? '#3B82F6' : 'var(--surface3)'} opacity={getOpacity(isActive('shoulders'), 0.9, 0.4)}/>
      <ellipse cx="84" cy="52" rx="9" ry="8"
        fill={isActive('shoulders') ? '#3B82F6' : 'var(--surface3)'} opacity={getOpacity(isActive('shoulders'), 0.9, 0.4)}/>
      <rect x="26" y="60" width="12" height="24" rx="6"
        fill={isActive('biceps') ? '#10B981' : 'var(--surface3)'} opacity={getOpacity(isActive('biceps'), 0.9, 0.4)}/>
      <rect x="82" y="60" width="12" height="24" rx="6"
        fill={isActive('biceps') ? '#10B981' : 'var(--surface3)'} opacity={getOpacity(isActive('biceps'), 0.9, 0.4)}/>
      <rect x="24" y="62" width="10" height="20" rx="5"
        fill={isActive('triceps') ? '#8B5CF6' : 'var(--surface3)'} opacity={getOpacity(isActive('triceps'), 0.8, 0.3)}/>
      <rect x="86" y="62" width="10" height="20" rx="5"
        fill={isActive('triceps') ? '#8B5CF6' : 'var(--surface3)'} opacity={getOpacity(isActive('triceps'), 0.8, 0.3)}/>
      <rect x="52" y="66" width="16" height="28" rx="4"
        fill={isActive('abdominals') ? '#F59E0B' : 'var(--surface3)'} opacity={getOpacity(isActive('abdominals'), 0.9, 0.4)}/>
      <path d="M44 54 L40 76 Q52 80 60 78 Q68 80 80 76 L76 54 Q68 58 60 60 Q52 58 44 54Z"
        fill={isActive('lats') || isActive('back') ? '#14B8A6' : 'var(--surface3)'}
        opacity={getOpacity(isActive('lats') || isActive('back'), 0.6, 0.2)}/>
      <rect x="44" y="100" width="14" height="38" rx="7"
        fill={isActive('quadriceps') || isActive('legs') ? '#F59E0B' : 'var(--surface3)'} opacity={getOpacity(isActive('quadriceps') || isActive('legs'), 0.9, 0.4)}/>
      <rect x="62" y="100" width="14" height="38" rx="7"
        fill={isActive('quadriceps') || isActive('legs') ? '#F59E0B' : 'var(--surface3)'} opacity={getOpacity(isActive('quadriceps') || isActive('legs'), 0.9, 0.4)}/>
      <rect x="44" y="142" width="12" height="28" rx="6"
        fill={isActive('calves') || isActive('legs') ? '#10B981' : 'var(--surface3)'} opacity={getOpacity(isActive('calves') || isActive('legs'), 0.9, 0.4)}/>
      <rect x="64" y="142" width="12" height="28" rx="6"
        fill={isActive('calves') || isActive('legs') ? '#10B981' : 'var(--surface3)'} opacity={getOpacity(isActive('calves') || isActive('legs'), 0.9, 0.4)}/>
      <ellipse cx="51" cy="98" rx="9" ry="8"
        fill={isActive('glutes') ? '#EC4899' : 'var(--surface3)'} opacity={getOpacity(isActive('glutes'), 0.8, 0.35)}/>
      <ellipse cx="69" cy="98" rx="9" ry="8"
        fill={isActive('glutes') ? '#EC4899' : 'var(--surface3)'} opacity={getOpacity(isActive('glutes'), 0.8, 0.35)}/>
    </svg>
  )
}

// ─── Volume ring ──────────────────────────────────────────
function VolumeRing({ value, max, color, label, sub }: { value:number;max:number;color:string;label:string;sub:string }) {
  const pct = max > 0 ? Math.min(value/max, 1) : 0
  const r=32, circ=2*Math.PI*r
  return (
    <div className="vol-ring-wrap">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--surface3)" strokeWidth="6"/>
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${circ*pct} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 40 40)" style={{transition:'stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)'}}/>
        <text x="40" y="38" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--text)"
          fontFamily="DM Sans,Heebo,sans-serif">{label}</text>
        <text x="40" y="52" textAnchor="middle" fontSize="9" fill="var(--text3)"
          fontFamily="DM Sans,Heebo,sans-serif">{sub}</text>
      </svg>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────
type Tab = 'hero'|'log'|'stats'|'exercises'|'plan'
export default function Workout({ user }: { user: User }) {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [sets, setSets] = useState<Record<string,WSet[]>>({})
  const [activeWorkout, setActiveWorkout] = useState<Workout|null>(null)
  const [activeSets, setActiveSets] = useState<WSet[]>([])
  // Plan state
  const [savedPlan, setSavedPlan] = useState<WorkoutPlan|null>(null)
  const [activePlanDay, setActivePlanDay] = useState(0)
  // Exercise DB
  const [exerciseDB, setExerciseDB] = useState<any[]>([])
  const [dbLoaded, setDbLoaded] = useState(false)
  const [dbLoading, setDbLoading] = useState(false)
  const [exSearch, setExSearch] = useState('')
  const [selectedMuscle, setSelectedMuscle] = useState('chest')
  const [selectedExercise, setSelectedExercise] = useState<any|null>(null)
  // UI
  const [tab, setTab] = useState<Tab>('hero')
  const [showPlanPicker, setShowPlanPicker] = useState(false)
  const [swapTarget, setSwapTarget] = useState<{idx:number;name:string}|null>(null) // exercise being swapped
  const [showSwapPicker, setShowSwapPicker] = useState(false)
  // Active workout form
  const [exercise, setExercise] = useState('')
  const [numSets, setNumSets] = useState('3')
  const [reps, setReps] = useState('10')
  const [weight, setWeight] = useState('')
  const [showExercisePicker, setShowExercisePicker] = useState(false)
  const [swapTargetIdx, setSwapTargetIdx] = useState<number | null>(null)  // index in plan to swap
  const [swapSearch, setSwapSearch] = useState('')
  // Timer
  const [timer, setTimer] = useState(0)
  const [restTimer, setRestTimer] = useState(0)
  const [restActive, setRestActive] = useState(false)
  const timerRef = useRef<any>()
  const now = new Date()

  // ── Load ──────────────────────────────────────────────
  const loadWorkouts = useCallback(async () => {
    const { data: w } = await supabase.from('workouts').select('*').eq('user_id',user.id).order('date',{ascending:false}).limit(60)
    setWorkouts(w||[])
    if (w?.length) {
      const { data: s } = await supabase.from('workout_sets').select('*').in('workout_id',w.slice(0,20).map((x:any)=>x.id))
      const grouped:Record<string,WSet[]> = {}
      ;(s||[]).forEach((st:WSet)=>{ grouped[st.workout_id]=[...(grouped[st.workout_id]||[]),st] })
      setSets(grouped)
    }
  }, [user.id])

  // Load saved plan from Supabase user_settings table (or localStorage fallback)
  const loadSavedPlan = useCallback(async () => {
    const { data } = await supabase.from('user_settings').select('value').eq('user_id',user.id).eq('key','workout_plan').single()
    if (data?.value) {
      try { setSavedPlan(JSON.parse(data.value)); return } catch {}
    }
    // Default: Natanel's W1 plan (first in list)
    setSavedPlan(DEFAULT_PLANS[0])
  }, [user.id])

  useEffect(() => { loadWorkouts(); loadSavedPlan() }, [loadWorkouts, loadSavedPlan])

  // Timer
  useEffect(() => {
    if (!activeWorkout) { clearInterval(timerRef.current); return }
    timerRef.current = setInterval(()=>setTimer(t=>t+1), 1000)
    return ()=>clearInterval(timerRef.current)
  }, [!!activeWorkout])

  useEffect(() => {
    if (!restActive) return
    if (restTimer<=0) { setRestActive(false); return }
    const i = setInterval(()=>setRestTimer(t=>{ if(t<=1){setRestActive(false);return 0} return t-1 }),1000)
    return ()=>clearInterval(i)
  }, [restActive, restTimer])

  // Load exercise DB
  const loadExerciseDB = useCallback(async () => {
    if (dbLoaded) return
    setDbLoading(true)
    try { const res=await fetch(EXERCISE_DB_URL); setExerciseDB(await res.json()); setDbLoaded(true) }
    catch {}
    setDbLoading(false)
  }, [dbLoaded])

  // Save plan to Supabase
  const savePlan = async (plan: WorkoutPlan) => {
    setSavedPlan(plan)
    await supabase.from('user_settings').upsert({
      user_id: user.id, key: 'workout_plan', value: JSON.stringify(plan),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,key' })
    setShowPlanPicker(false)
  }

  // ── Stats ──────────────────────────────────────────────
  const thisMonth = workouts.filter(w=>w.date>=format(startOfMonth(now),'yyyy-MM-dd'))
  const allSets = Object.values(sets).flat()
  const totalVolume = allSets.reduce((s,st)=>s+st.sets*st.reps*st.weight_kg,0)
  const avgDuration = workouts.filter(w=>w.duration_min>0).length > 0
    ? Math.round(workouts.filter(w=>w.duration_min>0).reduce((s,w)=>s+w.duration_min,0)/workouts.filter(w=>w.duration_min>0).length)
    : 0
  let streak=0
  for(let i=0;i<60;i++){
    const d=format(subDays(now,i),'yyyy-MM-dd')
    if(workouts.some(w=>w.date===d)) streak++
    else if(i>0) break
  }
  const prMap:Record<string,{weight:number;oneRM:number}>={}
  allSets.forEach(st=>{
    const orm=calc1RM(st.weight_kg,st.reps)
    if(!prMap[st.exercise]||st.weight_kg>prMap[st.exercise].weight) prMap[st.exercise]={weight:st.weight_kg,oneRM:orm}
  })
  const daysSinceLast = workouts[0] ? differenceInDays(now,new Date(workouts[0].date)) : 999
  const calDays = eachDayOfInterval({start:subDays(now,34),end:now})

  // Next plan day
  const getNextDay = () => {
    if (!savedPlan) return null
    const recentTypes = workouts.slice(0,10).map(w=>w.type)
    for(let i=0;i<savedPlan.days.length;i++){
      const day=savedPlan.days[i]
      if(!recentTypes.some(t=>t.includes(day.label))) return {day,idx:i}
    }
    const lastIdx = recentTypes.reduce((best,t,i)=>{
      const di=savedPlan.days.findIndex(d=>t.includes(d.label))
      return di!==-1&&i<10?di:best
    },-1)
    return {day:savedPlan.days[(lastIdx+1)%savedPlan.days.length], idx:(lastIdx+1)%savedPlan.days.length}
  }
  const nextDay = getNextDay()

  // Current plan day exercises (for active workout)
  const currentPlanDay = savedPlan && activeWorkout
    ? savedPlan.days.find(d=>activeWorkout.type.includes(d.label))
    : null

  // ── Actions ────────────────────────────────────────────
  const startWorkout = async (type: string) => {
    const { data, error } = await supabase.from('workouts').insert({
      user_id:user.id, date:format(now,'yyyy-MM-dd'), type, notes:'', duration_min:0
    }).select().single()
    if (!error&&data) { setActiveWorkout(data); setActiveSets([]); setTimer(0); setTab('log') }
    setShowPlanPicker(false)
  }

  const addSet = async (exName?: string, setsNum?: number, repsVal?: string, restSec?: number) => {
    if (!activeWorkout) return
    const ex = exName||exercise
    if (!ex) return
    const { data, error } = await supabase.from('workout_sets').insert({
      workout_id:activeWorkout.id, user_id:user.id,
      exercise:ex, sets:setsNum||parseInt(numSets)||1,
      reps:parseInt(repsVal?.split('-')[0]||reps)||1,
      weight_kg:parseFloat(weight)||0
    }).select().single()
    if (!error&&data) {
      setActiveSets(p=>[...p,data])
      const rest = restSec||90
      setRestTimer(rest); setRestActive(true)
    }
  }

  const finish = async () => {
    if (!activeWorkout) return
    await supabase.from('workouts').update({duration_min:Math.round(timer/60)}).eq('id',activeWorkout.id)
    setActiveWorkout(null); setActiveSets([]); setTimer(0); setRestActive(false)
    loadWorkouts(); setTab('hero')
  }

  // Swap exercise in plan
  const swapExercise = (dayIdx: number, exIdx: number, newName: string) => {
    if (!savedPlan) return
    const newPlan = {
      ...savedPlan,
      days: savedPlan.days.map((d, di) =>
        di !== dayIdx ? d : {
          ...d,
          exercises: d.exercises.map((e, ei) => ei !== exIdx ? e : { ...e, name: newName })
        }
      )
    }
    savePlan(newPlan)
    setSwapTarget(null); setShowSwapPicker(false); setSelectedExercise(null)
  }

  const fmt = (s:number)=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  const filteredEx = exerciseDB.filter(e=>{
    const mg = MUSCLE_GROUPS.find(m=>m.id===selectedMuscle)
    const matchM = !mg || mg.muscles.length===0 || mg.muscles.some(m=>e.primaryMuscles?.includes(m)||e.secondaryMuscles?.includes(m))
    return matchM && (!exSearch||e.name.toLowerCase().includes(exSearch.toLowerCase()))
  }).slice(0,40)

  const TABS = [
    {id:'hero',label:'הבא',emoji:'⚡'},
    {id:'log',label:'אימון',emoji:'▶'},
    {id:'plan',label:'תוכנית',emoji:'📋'},
    {id:'stats',label:'סטטס',emoji:'📊'},
    {id:'exercises',label:'תרגילים',emoji:'📚'},
  ]

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="module-page fade-in">
      {/* Header */}
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{color:'var(--m-workout)'}}>◈</span> אימונים</h1>
          <p className="module-sub">{thisMonth.length} החודש · {streak>0?`🔥 ${streak} ימי streak`:'אין streak'}</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          {!activeWorkout ? (
            <>
              <button className="btn-ghost" onClick={()=>setShowPlanPicker(true)}>📋 בחר תוכנית</button>
              <button className="btn-gold" onClick={()=>setTab('log')}>▶ אימון</button>
            </>
          ) : (
            <button className="btn-gold" style={{background:'var(--green)',color:'#fff'}} onClick={finish}>
              ✓ סיים · {fmt(timer)}
            </button>
          )}
        </div>
      </div>

      {/* KPI rings */}
      <div className="wo-kpi-row">
        <VolumeRing value={thisMonth.length} max={12} color="var(--m-workout)" label={String(thisMonth.length)} sub="אימונים"/>
        <VolumeRing value={totalVolume} max={50000} color="var(--amber)" label={`${Math.round(totalVolume/1000)}K`} sub="נפח"/>
        <VolumeRing value={Object.keys(prMap).length} max={20} color="var(--gold)" label={String(Object.keys(prMap).length)} sub="PRs"/>
        <VolumeRing value={avgDuration} max={90} color="var(--teal)" label={`${avgDuration}'`} sub="ממוצע"/>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {TABS.map(t=>(
          <button key={t.id} className={`tab-btn ${tab===t.id?'active':''}`}
            onClick={()=>{ setTab(t.id as Tab); if(t.id==='exercises') loadExerciseDB() }}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* ══ HERO TAB ════════════════════════════════════ */}
      {tab==='hero' && (
        <div className="wo-hero-layout">
          {/* Next workout card */}
          <div className="wo-next-card card">
            <div className="wo-next-header">
              <div>
                <div className="wo-next-badge"><span className="wo-next-dot"/>האימון הבא</div>
                <h2 className="wo-next-title">{nextDay?nextDay.day.label:savedPlan?'✓ הכל הושלם':'אין תוכנית'}</h2>
                <p className="wo-next-sub">{nextDay?nextDay.day.sub:savedPlan?'כל ימי השבוע הושלמו 💪':'בחר תוכנית לקבל המלצה'}</p>
              </div>
              {savedPlan && (
                <div className="wo-next-prog-badge" style={{borderColor:savedPlan.color,color:savedPlan.color}}>
                  {savedPlan.emoji} {savedPlan.shortName}
                </div>
              )}
            </div>

            {/* Timing chips */}
            <div className="wo-timing-row">
              <div className="wo-timing-chip" style={{borderColor:'var(--green)',background:'var(--green-dim)'}}>
                <span style={{color:'var(--green)',fontSize:18}}>📅</span>
                <div><div className="wo-timing-label">מתי לאמן</div>
                  <div className="wo-timing-val" style={{color:'var(--green)'}}>
                    {daysSinceLast===0?'מחר בבוקר':daysSinceLast>=2?'היום — זמן!':'מחר'}
                  </div></div>
              </div>
              <div className="wo-timing-chip" style={{borderColor:'var(--amber)',background:'var(--amber-dim)'}}>
                <span style={{color:'var(--amber)',fontSize:18}}>⏱</span>
                <div><div className="wo-timing-label">זמן משוער</div>
                  <div className="wo-timing-val" style={{color:'var(--amber)'}}>{avgDuration>0?`~${avgDuration}'`:'~60\''}</div></div>
              </div>
              <div className="wo-timing-chip" style={{borderColor:'var(--blue)',background:'var(--blue-dim)'}}>
                <span style={{color:'var(--blue)',fontSize:18}}>💤</span>
                <div><div className="wo-timing-label">מנוחה אחרונה</div>
                  <div className="wo-timing-val" style={{color:'var(--blue)'}}>
                    {daysSinceLast===0?'היום':daysSinceLast===1?'אתמול':`${daysSinceLast} ימים`}
                  </div></div>
              </div>
            </div>

            {/* Streak */}
            {streak>0 && (
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0'}}>
                <div className="wo-streak-hero">🔥 {streak}</div>
                <div style={{fontSize:12,color:'var(--text3)'}}>ימי streak רצופים</div>
              </div>
            )}

            {/* Body map + exercises preview */}
            <div className="wo-next-body">
              <div className="wo-muscle-map-wrap">
                <MuscleMap trained={nextDay?nextDay.day.muscles:[]}/>
              </div>

              {nextDay && savedPlan && (
                <div className="wo-ex-preview">
                  <div className="wo-ex-preview-title">תרגילי האימון</div>
                  {nextDay.day.exercises.map((ex,i)=>(
                    <div key={i} className="wo-ex-preview-row">
                      <span className="wo-ex-num">{i+1}</span>
                      <span className="wo-ex-name">{ex.name}</span>
                      <span className="wo-ex-meta">{ex.sets}×{ex.reps}</span>
                    </div>
                  ))}
                </div>
              )}

              {!savedPlan && (
                <div className="wo-no-plan">
                  <div style={{fontSize:32,marginBottom:8}}>📋</div>
                  <p style={{fontSize:13,color:'var(--text3)',marginBottom:12}}>אין תוכנית פעילה</p>
                  <button className="btn-gold" style={{fontSize:12}} onClick={()=>setShowPlanPicker(true)}>בחר תוכנית</button>
                </div>
              )}
            </div>

            {/* CTA */}
            <div className="wo-character">💪</div>
            <button className="btn-gold wo-start-btn"
              onClick={()=>nextDay?startWorkout(`${savedPlan?.shortName} — ${nextDay.day.label}`):startWorkout('אימון חופשי')}>
              ▶ התחל {nextDay?nextDay.day.label:'אימון'}
            </button>
          </div>

          {/* Side panel */}
          <div className="wo-hero-side">
            {/* Heatmap */}
            <div className="card wo-heatmap-card">
              <div className="wo-section-title">פעילות — 5 שבועות</div>
              <div className="wo-heatmap-grid">
                {['א','ב','ג','ד','ה','ו','ש'].map(d=><div key={d} className="wo-hm-day-label">{d}</div>)}
                {calDays.map(d=>{
                  const ds=format(d,'yyyy-MM-dd')
                  const w=workouts.find(w=>w.date===ds)
                  const isToday=ds===format(now,'yyyy-MM-dd')
                  return <div key={ds} className={`wo-hm-cell ${w?'active':''} ${isToday?'today':''}`}
                    style={w?{background:'var(--m-workout)'}:{}} title={w?w.type:ds}/>
                })}
              </div>
            </div>

            {/* Recent */}
            <div className="card wo-recent-card">
              <div className="wo-section-title">אחרונים</div>
              {workouts.slice(0,5).map(w=>{
                const wSets=sets[w.id]||[]
                const vol=wSets.reduce((s,st)=>s+st.sets*st.reps*st.weight_kg,0)
                return (
                  <div key={w.id} className="wo-recent-row">
                    <div className="wo-recent-icon" style={{color:'var(--m-workout)'}}>◈</div>
                    <div className="wo-recent-info">
                      <div className="wo-recent-type">{w.type}</div>
                      <div className="wo-recent-meta">
                        {format(new Date(w.date),'d בMMM',{locale:he})}
                        {w.duration_min>0&&` · ${w.duration_min}'`}
                        {vol>0&&` · ${Math.round(vol)}kg`}
                      </div>
                    </div>
                  </div>
                )
              })}
              {workouts.length===0 && <div className="empty-state" style={{padding:'16px 0'}}><div className="empty-state-icon">💪</div><p>אין אימונים עדיין</p></div>}
            </div>
          </div>
        </div>
      )}

      {/* ══ ACTIVE WORKOUT TAB ══════════════════════════ */}
      {tab==='log' && (
        <div>
          {!activeWorkout ? (
            // Choose workout type
            <div className="wo-start-grid">
              {savedPlan ? (
                <>
                  <div className="wo-start-card card" style={{borderColor:savedPlan.color+'44',background:`linear-gradient(135deg,${savedPlan.color}08,var(--surface))`}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                      <span style={{fontSize:24}}>{savedPlan.emoji}</span>
                      <div>
                        <div style={{fontWeight:700,color:savedPlan.color}}>{savedPlan.name}</div>
                        <div style={{fontSize:12,color:'var(--text3)'}}>{savedPlan.freq}x שבוע</div>
                      </div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:6}}>
                      {savedPlan.days.map((d,i)=>{
                        const isNext=nextDay?.idx===i
                        const lastUsed=workouts.findIndex(w=>w.type.includes(d.label))
                        const recentlyDone=lastUsed!==-1&&lastUsed<4
                        return (
                          <button key={i} className={`wo-day-btn ${isNext?'next':''} ${recentlyDone&&!isNext?'done':''}`}
                            onClick={()=>startWorkout(`${savedPlan.shortName} — ${d.label}`)}>
                            <div className="wo-day-btn-left">
                              <span style={{color:isNext?savedPlan.color:'var(--text3)',fontWeight:700,fontSize:14}}>{d.label}</span>
                              <span style={{fontSize:11,color:'var(--text3)'}}>{d.sub}</span>
                            </div>
                            <div className="wo-day-btn-right">
                              <span style={{fontSize:11,color:'var(--text3)'}}>{d.exercises.length} תרגילים</span>
                              {isNext && <span className="wo-next-tag">הבא ›</span>}
                              {recentlyDone&&!isNext && <span className="wo-done-tag">✓</span>}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <button className="btn-ghost" style={{alignSelf:'flex-start'}}
                    onClick={()=>startWorkout('אימון חופשי')}>+ אימון חופשי</button>
                </>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-icon">📋</div>
                  <p style={{marginBottom:12}}>בחר תוכנית כדי להתחיל</p>
                  <div style={{display:'flex',gap:8}}>
                    <button className="btn-gold" onClick={()=>setShowPlanPicker(true)}>בחר תוכנית</button>
                    <button className="btn-ghost" onClick={()=>startWorkout('אימון חופשי')}>אימון חופשי</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Active workout
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

              {/* Plan exercises checklist */}
              {currentPlanDay && (
                <div className="wo-plan-checklist">
                  <div className="wo-section-title" style={{marginBottom:8}}>תרגילי האימון</div>
                  {currentPlanDay.exercises.map((ex,i)=>{
                    const done = activeSets.some(s=>s.exercise===ex.name)
                    return (
                      <div key={i} className={`wo-plan-ex-row ${done?'done':''}`}>
                        <div className="wo-plan-check">{done?'✓':i+1}</div>
                        <div className="wo-plan-ex-info">
                          <span className="wo-plan-ex-name">{ex.name}</span>
                          <span className="wo-plan-ex-meta">{ex.sets}×{ex.reps} · {ex.rest}″</span>
                        </div>
                        <div style={{display:'flex',gap:4}}>
                          {!done && (
                            <button className="btn-surface" style={{fontSize:11,height:28,padding:'0 8px'}}
                              onClick={()=>{ setExercise(ex.name); setNumSets(String(ex.sets)); setReps(ex.reps.split('-')[0]); }}>
                              בחר
                            </button>
                          )}
                          <button className="btn-icon" style={{width:28,height:28,fontSize:11}}
                            title="החלף תרגיל"
                            onClick={()=>{
                              setSwapTarget({idx:i, name:ex.name})
                              setShowSwapPicker(true)
                              loadExerciseDB()
                            }}>⇄</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Sets log */}
              {activeSets.length>0 && (
                <div className="wo-sets-log">
                  {activeSets.map((s,i)=>(
                    <div key={s.id} className="wo-set-row">
                      <span className="wo-set-num">{i+1}</span>
                      <span className="wo-set-ex">{s.exercise}</span>
                      <span className="wo-set-info">{s.sets}×{s.reps}</span>
                      <span className="wo-set-wt">{s.weight_kg>0?`${s.weight_kg}kg`:'BW'}</span>
                      {s.weight_kg>0&&<span className="wo-set-1rm">1RM≈{calc1RM(s.weight_kg,s.reps)}kg</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Add set form */}
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
                  {weight&&reps&&(
                    <div className="mfield"><label>1RM</label>
                      <div className="form-input" style={{color:'var(--amber)',fontWeight:700,cursor:'default',display:'flex',alignItems:'center'}}>
                        {calc1RM(parseFloat(weight)||0,parseInt(reps)||1)}kg
                      </div></div>
                  )}
                  <button className="btn-gold" onClick={()=>addSet()} disabled={!exercise} style={{alignSelf:'flex-end',height:40}}>+ הוסף</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ PLAN TAB ════════════════════════════════════ */}
      {tab==='plan' && (
        <div>
          {!savedPlan ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              <p style={{marginBottom:16}}>אין תוכנית פעילה</p>
              <button className="btn-gold" onClick={()=>setShowPlanPicker(true)}>בחר תוכנית</button>
            </div>
          ) : (
            <div>
              {/* Plan header */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontSize:28}}>{savedPlan.emoji}</span>
                  <div>
                    <div style={{fontWeight:800,fontSize:18,letterSpacing:'-0.02em'}}>{savedPlan.name}</div>
                    <div style={{fontSize:13,color:'var(--text3)'}}>{savedPlan.freq}x שבוע · {savedPlan.days.reduce((s,d)=>s+d.exercises.length,0)} תרגילים סה"כ</div>
                  </div>
                </div>
                <button className="btn-ghost" onClick={()=>setShowPlanPicker(true)}>החלף תוכנית</button>
              </div>

              {/* Days tabs */}
              <div className="tab-bar" style={{marginBottom:16}}>
                {savedPlan.days.map((d,i)=>(
                  <button key={i} className={`tab-btn ${activePlanDay===i?'active':''}`} onClick={()=>setActivePlanDay(i)}>
                    {d.label}
                  </button>
                ))}
              </div>

              {/* Current day exercises — editable */}
              {savedPlan.days[activePlanDay] && (
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <MuscleMap trained={savedPlan.days[activePlanDay].muscles}/>
                    <div>
                      <div style={{fontWeight:700,fontSize:16}}>{savedPlan.days[activePlanDay].label}</div>
                      <div style={{fontSize:13,color:'var(--text3)',marginBottom:8}}>{savedPlan.days[activePlanDay].sub}</div>
                      <button className="btn-gold" style={{fontSize:12,height:32}}
                        onClick={()=>startWorkout(`${savedPlan.shortName} — ${savedPlan.days[activePlanDay].label}`)}>
                        ▶ התחל אימון זה
                      </button>
                    </div>
                  </div>

                  {savedPlan.days[activePlanDay].exercises.map((ex,i)=>(
                    <div key={i} className="wo-plan-edit-row card">
                      <div className="wo-plan-edit-num">{i+1}</div>
                      <div className="wo-plan-edit-info">
                        <div className="wo-plan-edit-name">{ex.name}</div>
                        <div className="wo-plan-edit-meta">
                          <span className="badge badge-red">{ex.sets} סטים</span>
                          <span className="badge badge-blue">{ex.reps} חזרות</span>
                          <span className="badge" style={{background:'var(--surface3)',color:'var(--text3)'}}>{ex.rest}″ מנוחה</span>
                        </div>
                      </div>
                      <button className="btn-ghost" style={{fontSize:12,height:30,padding:'0 10px'}}
                        onClick={()=>{setSwapTarget({idx:i,name:ex.name});setShowSwapPicker(true);loadExerciseDB()}}>
                        ⇄ החלף
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══ STATS TAB ═══════════════════════════════════ */}
      {tab==='stats' && (
        <div className="wo-stats-grid">
          <div className="card wo-pr-card">
            <div className="wo-section-title">🏆 שיאים אישיים</div>
            {Object.entries(prMap).sort((a,b)=>b[1].weight-a[1].weight).slice(0,10).map(([ex,pr])=>(
              <div key={ex} className="wo-pr-row">
                <span className="wo-pr-ex">{ex}</span>
                <div style={{flex:1,height:4,background:'var(--surface3)',borderRadius:2,margin:'0 8px'}}>
                  <div style={{height:'100%',width:`${(pr.weight/200)*100}%`,background:'var(--gold)',borderRadius:2,maxWidth:'100%'}}/>
                </div>
                <span className="wo-pr-kg" style={{color:'var(--gold)'}}>{pr.weight}kg</span>
                <span className="wo-pr-orm" style={{color:'var(--text3)'}}>1RM≈{pr.oneRM}</span>
              </div>
            ))}
            {Object.keys(prMap).length===0&&<p style={{color:'var(--text3)',fontSize:13,marginTop:8}}>אין PRs עדיין</p>}
          </div>

          <div className="card wo-types-card">
            <div className="wo-section-title">📊 התפלגות אימונים</div>
            {Object.entries(workouts.reduce((acc,w)=>{
              const key=w.type.split('—')[0].trim()
              acc[key]=(acc[key]||0)+1; return acc
            },{} as Record<string,number>)).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([type,count])=>(
              <div key={type} className="wo-type-row">
                <span style={{fontSize:13,color:'var(--text2)',flex:1}}>{type}</span>
                <div className="wo-type-bar-wrap">
                  <div style={{height:'100%',width:`${(count/workouts.length)*100}%`,background:'var(--m-workout)',borderRadius:2}}/>
                </div>
                <span style={{color:'var(--m-workout)',fontWeight:700,minWidth:24}}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ EXERCISES TAB ═══════════════════════════════ */}
      {tab==='exercises' && (
        <div>
          {!dbLoaded&&!dbLoading&&(
            <div className="empty-state">
              <div className="empty-state-icon">📚</div>
              <p style={{marginBottom:12}}>873 תרגילים עם הוראות</p>
              <button className="btn-gold" onClick={loadExerciseDB}>טען מסד תרגילים</button>
            </div>
          )}
          {dbLoading&&<div className="empty-state"><p>טוען...</p></div>}
          {dbLoaded&&(
            <>
              <input className="form-input" style={{marginBottom:10}} value={exSearch} onChange={e=>setExSearch(e.target.value)} placeholder="חפש תרגיל..."/>
              <div className="ex-muscle-tabs" style={{marginBottom:12}}>
                {MUSCLE_GROUPS.map(m=>(
                  <button key={m.id} className={`ex-muscle-tab ${selectedMuscle===m.id?'active':''}`} onClick={()=>setSelectedMuscle(m.id)}>
                    {m.emoji} {m.label}
                  </button>
                ))}
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:5}}>
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

      {/* ══ PLAN PICKER MODAL ═══════════════════════════ */}
      {showPlanPicker && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowPlanPicker(false)}>
          <div className="modal-card card fade-in" style={{maxWidth:580}}>
            <div className="modal-header">
              <h3>בחר תוכנית אימונים</h3>
              <button className="modal-close" onClick={()=>setShowPlanPicker(false)}>✕</button>
            </div>
            <div style={{padding:'12px 24px 24px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              {DEFAULT_PLANS.map(p=>(
                <div key={p.name} className="card" style={{padding:16,border:`1.5px solid ${p.color}33`,cursor:'pointer',transition:'all .15s'}}
                  onClick={()=>savePlan(p)}
                  onMouseEnter={e=>(e.currentTarget.style.borderColor=p.color)}
                  onMouseLeave={e=>(e.currentTarget.style.borderColor=p.color+'33')}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                    <span style={{fontSize:22}}>{p.emoji}</span>
                    <div>
                      <div style={{fontWeight:700,color:p.color,fontSize:14}}>{p.name}</div>
                      <div style={{fontSize:11,color:'var(--text3)'}}>{p.freq}x שבוע</div>
                    </div>
                    {savedPlan?.name===p.name&&<span className="badge badge-green" style={{marginRight:'auto'}}>פעיל ✓</span>}
                  </div>
                  {p.days.map((d,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 0',borderBottom:'0.5px solid var(--border)',fontSize:12}}>
                      <span style={{color:p.color,fontWeight:600,minWidth:60}}>{d.label}</span>
                      <span style={{color:'var(--text3)'}}>{d.exercises.length} תרגילים</span>
                    </div>
                  ))}
                  <div style={{marginTop:10,textAlign:'center'}}>
                    <span style={{fontSize:12,color:p.color,fontWeight:600}}>בחר תוכנית ›</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ SWAP EXERCISE MODAL ═════════════════════════ */}
      {showSwapPicker && swapTarget && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&(setShowSwapPicker(false),setSwapTarget(null))}>
          <div className="modal-card card fade-in" style={{maxWidth:540,maxHeight:'80vh',display:'flex',flexDirection:'column'}}>
            <div className="modal-header">
              <div>
                <h3>החלף תרגיל</h3>
                <div style={{fontSize:12,color:'var(--text3)',marginTop:2}}>מחליף: <b style={{color:'var(--text)'}}>{swapTarget.name}</b></div>
              </div>
              <button className="modal-close" onClick={()=>{setShowSwapPicker(false);setSwapTarget(null)}}>✕</button>
            </div>

            {selectedExercise ? (
              <div style={{flex:1,overflow:'auto',padding:'0 24px 24px'}}>
                <button className="btn-ghost" style={{marginBottom:12,marginTop:12}} onClick={()=>setSelectedExercise(null)}>← חזור</button>
                <h3 style={{fontSize:16,fontWeight:800,marginBottom:8}}>{selectedExercise.name}</h3>
                <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
                  <span className="badge badge-blue">{selectedExercise.level}</span>
                  <span className="badge" style={{background:'var(--surface3)',color:'var(--text2)'}}>{selectedExercise.equipment}</span>
                  <span className="badge badge-red">{selectedExercise.primaryMuscles?.join(', ')}</span>
                </div>
                {selectedExercise.images?.[0]&&(
                  <img src={`${IMG_BASE}${selectedExercise.images[0]}`} alt={selectedExercise.name}
                    style={{width:'100%',borderRadius:12,marginBottom:12}} onError={e=>(e.currentTarget.style.display='none')}/>
                )}
                <div style={{display:'flex',gap:8,marginTop:8}}>
                  <button className="btn-gold" style={{flex:1}} onClick={()=>{
                    // Find which day is being edited
                    const dayIdx = tab==='log' && currentPlanDay
                      ? savedPlan!.days.findIndex(d=>d.label===currentPlanDay.label)
                      : activePlanDay
                    swapExercise(dayIdx, swapTarget.idx, selectedExercise.name)
                  }}>✓ החלף ב"{selectedExercise.name}"</button>
                  <button className="btn-ghost" onClick={()=>setSelectedExercise(null)}>ביטול</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{padding:'12px 24px'}}>
                  <input className="form-input" value={exSearch} onChange={e=>setExSearch(e.target.value)}
                    placeholder="חפש תרגיל חלופי..." autoFocus/>
                  <div className="ex-muscle-tabs" style={{marginTop:8}}>
                    {MUSCLE_GROUPS.map(m=>(
                      <button key={m.id} className={`ex-muscle-tab ${selectedMuscle===m.id?'active':''}`}
                        onClick={()=>setSelectedMuscle(m.id)}>{m.emoji} {m.label}</button>
                    ))}
                  </div>
                </div>
                <div style={{flex:1,overflow:'auto',padding:'0 24px 24px',display:'flex',flexDirection:'column',gap:5}}>
                  {dbLoading&&<div className="empty-state" style={{padding:'20px 0'}}>טוען...</div>}
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
                        e.stopPropagation()
                        const dayIdx = tab==='log'&&currentPlanDay
                          ? savedPlan!.days.findIndex(d=>d.label===currentPlanDay.label)
                          : activePlanDay
                        swapExercise(dayIdx, swapTarget.idx, ex.name)
                      }}>החלף</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ EXERCISE PICKER (for free workout) ══════════ */}
      {showExercisePicker && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowExercisePicker(false)}>
          <div className="modal-card card fade-in" style={{maxWidth:540,maxHeight:'80vh',display:'flex',flexDirection:'column'}}>
            <div className="modal-header">
              <h3>בחר תרגיל</h3>
              <button className="modal-close" onClick={()=>{setShowExercisePicker(false);setSelectedExercise(null)}}>✕</button>
            </div>
            {selectedExercise ? (
              <div style={{flex:1,overflow:'auto',padding:'0 24px 24px'}}>
                <button className="btn-ghost" style={{margin:'12px 0'}} onClick={()=>setSelectedExercise(null)}>← חזור</button>
                <h3 style={{fontWeight:800,marginBottom:8}}>{selectedExercise.name}</h3>
                <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
                  <span className="badge badge-blue">{selectedExercise.level}</span>
                  <span className="badge badge-red">{selectedExercise.primaryMuscles?.join(', ')}</span>
                </div>
                {selectedExercise.images?.[0]&&(
                  <img src={`${IMG_BASE}${selectedExercise.images[0]}`} alt={selectedExercise.name}
                    style={{width:'100%',borderRadius:12,marginBottom:12}} onError={e=>(e.currentTarget.style.display='none')}/>
                )}
                <div className="ex-instructions">
                  {selectedExercise.instructions?.map((inst:string,i:number)=>(
                    <div key={i} className="ex-step"><span className="ex-step-num">{i+1}</span><span>{inst}</span></div>
                  ))}
                </div>
                <button className="btn-gold" style={{width:'100%',marginTop:14}} onClick={()=>{
                  setExercise(selectedExercise.name); setShowExercisePicker(false); setSelectedExercise(null)
                }}>בחר תרגיל זה</button>
              </div>
            ) : (
              <>
                <div style={{padding:'12px 24px'}}>
                  <input className="form-input" value={exSearch} onChange={e=>setExSearch(e.target.value)} placeholder="חפש..." autoFocus/>
                  <div className="ex-muscle-tabs" style={{marginTop:8}}>
                    {MUSCLE_GROUPS.map(m=>(
                      <button key={m.id} className={`ex-muscle-tab ${selectedMuscle===m.id?'active':''}`}
                        onClick={()=>setSelectedMuscle(m.id)}>{m.emoji} {m.label}</button>
                    ))}
                  </div>
                </div>
                <div style={{flex:1,overflow:'auto',padding:'0 24px 24px',display:'flex',flexDirection:'column',gap:5}}>
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
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Exercise detail from exercises tab */}
      {selectedExercise&&tab==='exercises'&&(
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setSelectedExercise(null)}>
          <div className="modal-card card fade-in" style={{maxWidth:500,maxHeight:'85vh',overflowY:'auto'}}>
            <div className="modal-header">
              <h3>{selectedExercise.name}</h3>
              <button className="modal-close" onClick={()=>setSelectedExercise(null)}>✕</button>
            </div>
            <div style={{padding:'0 24px 24px'}}>
              {selectedExercise.images?.[0]&&(
                <img src={`${IMG_BASE}${selectedExercise.images[0]}`} alt={selectedExercise.name}
                  style={{width:'100%',borderRadius:12,margin:'14px 0'}} onError={e=>(e.currentTarget.style.display='none')}/>
              )}
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
                <span className="badge badge-blue">{selectedExercise.level}</span>
                <span className="badge" style={{background:'var(--surface3)',color:'var(--text2)'}}>{selectedExercise.equipment}</span>
                <span className="badge badge-red">{selectedExercise.primaryMuscles?.join(', ')}</span>
              </div>
              <div className="ex-instructions">
                {selectedExercise.instructions?.map((inst:string,i:number)=>(
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
