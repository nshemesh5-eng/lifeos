import { useState, useEffect, useCallback, useRef } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { format, subDays, parseISO } from 'date-fns'
import { he } from 'date-fns/locale'
import './Nutrition.css'

// ── Types ─────────────────────────────────────────────────────
interface FoodLog {
  id: string; date: string; meal: string; food: string
  calories: number; protein: number; carbs: number; fat: number; amount_g: number
}
interface ShoppingItem { id: string; name: string; quantity: string; category: string; checked: boolean }
interface MealPlan { id: string; day: string; meal: string; food: string; calories: number; protein: number; carbs: number; fat: number }
interface OFFProduct { name: string; calories: number; protein: number; carbs: number; fat: number; barcode: string; image?: string }

// ── Constants ─────────────────────────────────────────────────
const MEALS = ['ארוחת בוקר','ארוחת צהריים','ארוחת ערב','חטיף']
const MEAL_ICONS: Record<string,string> = { 'ארוחת בוקר':'🌅','ארוחת צהריים':'☀️','ארוחת ערב':'🌙','חטיף':'🍎' }
const DAYS = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת']
const SHOP_CATS = ['פירות וירקות','בשר ודגים','מוצרי חלב','לחם ודגנים','קפואים','שונות']
const CAT_COLORS: Record<string,string> = {
  'פירות וירקות':'#10B981','בשר ודגים':'#EF4444','מוצרי חלב':'#3B82F6',
  'לחם ודגנים':'#F59E0B','קפואים':'#8B5CF6','שונות':'#6B7280'
}
type Tab = 'log' | 'presets' | 'plan' | 'shopping' | 'stats'

// ── Built-in meal presets (Israeli common meals) ──────────────
const MEAL_PRESETS = [
  { category: 'ארוחות בוקר', items: [
    { name: 'ביצים עם לחם', calories: 350, protein: 22, carbs: 28, fat: 14 },
    { name: 'קוואקר עם חלב', calories: 280, protein: 12, carbs: 42, fat: 6 },
    { name: 'יוגורט עם גרנולה', calories: 320, protein: 14, carbs: 45, fat: 8 },
    { name: 'גבינה לבנה עם ירקות', calories: 200, protein: 18, carbs: 8, fat: 9 },
    { name: 'שייק חלבון', calories: 250, protein: 35, carbs: 15, fat: 4 },
    { name: 'אבוקדו טוסט', calories: 380, protein: 10, carbs: 40, fat: 20 },
  ]},
  { category: 'ארוחות צהריים', items: [
    { name: 'חזה עוף עם אורז', calories: 420, protein: 45, carbs: 38, fat: 8 },
    { name: 'סלט טונה', calories: 280, protein: 32, carbs: 8, fat: 12 },
    { name: 'פסטה עם עוף', calories: 520, protein: 38, carbs: 58, fat: 10 },
    { name: 'שניצל עם תפוחי אדמה', calories: 580, protein: 40, carbs: 48, fat: 22 },
    { name: 'מרק עוף עם לחם', calories: 300, protein: 22, carbs: 35, fat: 8 },
    { name: 'בורגר עם ירקות', calories: 550, protein: 42, carbs: 32, fat: 28 },
  ]},
  { category: 'ארוחות ערב', items: [
    { name: 'סלמון עם ירקות', calories: 380, protein: 42, carbs: 12, fat: 18 },
    { name: 'עוף בתנור עם בטטה', calories: 440, protein: 48, carbs: 35, fat: 10 },
    { name: 'אומלט ירקות', calories: 280, protein: 20, carbs: 8, fat: 18 },
    { name: 'קציצות בשר עם פירה', calories: 520, protein: 38, carbs: 45, fat: 20 },
    { name: 'דג מוקפץ עם אורז', calories: 400, protein: 36, carbs: 42, fat: 10 },
  ]},
  { category: 'חטיפים', items: [
    { name: 'קוטג\' עם פירות', calories: 180, protein: 14, carbs: 22, fat: 4 },
    { name: 'חופן שקדים', calories: 170, protein: 6, carbs: 6, fat: 15 },
    { name: 'בננה', calories: 90, protein: 1, carbs: 23, fat: 0 },
    { name: 'תפוח', calories: 80, protein: 0, carbs: 21, fat: 0 },
    { name: 'חטיף חלבון', calories: 200, protein: 20, carbs: 20, fat: 7 },
    { name: 'גבינה + קרקרים', calories: 220, protein: 10, carbs: 24, fat: 10 },
  ]},
]

// ── Local food DB (per 100g) ──────────────────────────────────
const FOOD_DB = [
  { name:'חזה עוף', cal:165, p:31, c:0, f:3.6 },
  { name:'אורז לבן מבושל', cal:130, p:2.7, c:28, f:0.3 },
  { name:'ביצה', cal:155, p:13, c:1.1, f:11 },
  { name:'לחם פיתה', cal:275, p:9, c:55, f:1.2 },
  { name:'גבינה לבנה 5%', cal:75, p:10, c:3.5, f:2 },
  { name:'טונה שימורים', cal:116, p:26, c:0, f:1 },
  { name:'עגבנייה', cal:18, p:0.9, c:3.9, f:0.2 },
  { name:'מלפפון', cal:16, p:0.7, c:3.6, f:0.1 },
  { name:'בננה', cal:89, p:1.1, c:23, f:0.3 },
  { name:'קוואקר', cal:389, p:17, c:66, f:7 },
  { name:'חלב 3%', cal:61, p:3.2, c:4.8, f:3.3 },
  { name:'יוגורט 3%', cal:61, p:5, c:4.7, f:3.3 },
  { name:'קוטג׳', cal:103, p:11, c:3.4, f:4.5 },
  { name:'בשר בקר טחון', cal:250, p:26, c:0, f:17 },
  { name:'פסטה מבושלת', cal:131, p:5, c:25, f:1.1 },
  { name:'תפוח אדמה מבושל', cal:87, p:1.9, c:20, f:0.1 },
  { name:'שקדים', cal:579, p:21, c:22, f:50 },
  { name:'חומוס מבושל', cal:164, p:8.9, c:27, f:2.6 },
  { name:'ממרח טחינה', cal:592, p:17, c:21, f:54 },
  { name:'סלמון', cal:208, p:20, c:0, f:13 },
  { name:'שמן זית', cal:884, p:0, c:0, f:100 },
  { name:'אבוקדו', cal:160, p:2, c:9, f:15 },
  { name:'בטטה מבושלת', cal:90, p:2, c:21, f:0.1 },
  { name:'גרעיני חמניה', cal:584, p:21, c:20, f:51 },
  { name:'לחם קל', cal:254, p:9, c:45, f:3 },
]

// ── Open Food Facts API ───────────────────────────────────────
async function searchOFF(query: string): Promise<OFFProduct[]> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=8&lc=he,en`,
      { signal: AbortSignal.timeout(5000) }
    )
    const data = await res.json()
    return (data.products || []).map((p: any) => ({
      name: p.product_name_he || p.product_name || p.product_name_en || 'מוצר לא ידוע',
      calories: Math.round(p.nutriments?.['energy-kcal_100g'] || p.nutriments?.['energy-kcal'] || 0),
      protein: Math.round((p.nutriments?.proteins_100g || 0) * 10) / 10,
      carbs: Math.round((p.nutriments?.carbohydrates_100g || 0) * 10) / 10,
      fat: Math.round((p.nutriments?.fat_100g || 0) * 10) / 10,
      barcode: p.code || '',
      image: p.image_small_url,
    })).filter((p: OFFProduct) => p.calories > 0 && p.name !== 'מוצר לא ידוע')
  } catch { return [] }
}

async function lookupBarcode(code: string): Promise<OFFProduct | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${code}.json`,
      { signal: AbortSignal.timeout(6000) }
    )
    const data = await res.json()
    if (data.status !== 1) return null
    const p = data.product
    return {
      name: p.product_name_he || p.product_name || p.product_name_en || '',
      calories: Math.round(p.nutriments?.['energy-kcal_100g'] || p.nutriments?.['energy-kcal'] || 0),
      protein: Math.round((p.nutriments?.proteins_100g || 0) * 10) / 10,
      carbs: Math.round((p.nutriments?.carbohydrates_100g || 0) * 10) / 10,
      fat: Math.round((p.nutriments?.fat_100g || 0) * 10) / 10,
      barcode: code,
      image: p.image_small_url,
    }
  } catch { return null }
}

async function callShimshon(prompt: string): Promise<string> {
  const res = await fetch('/api/shimshon', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', parts: [{ text: prompt }] }], systemPrompt: 'אתה עוזר תזונה ישראלי. ענה ב-JSON בלבד.' })
  })
  const data = await res.json()
  return data.text || ''
}

// ── Main Component ────────────────────────────────────────────
export default function Nutrition({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>('log')
  const [logs, setLogs] = useState<FoodLog[]>([])
  const [mealPlan, setMealPlan] = useState<MealPlan[]>([])
  const [shopping, setShopping] = useState<ShoppingItem[]>([])
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [generating, setGenerating] = useState(false)
  const [preferences, setPreferences] = useState('')
  const [showPrefs, setShowPrefs] = useState(false)
  const [showAddMeal, setShowAddMeal] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [addMealType, setAddMealType] = useState('ארוחת בוקר')
  const [foodSearch, setFoodSearch] = useState('')
  const [foodAmount, setFoodAmount] = useState('100')
  const [offResults, setOffResults] = useState<OFFProduct[]>([])
  const [offLoading, setOffLoading] = useState(false)
  const [selectedFood, setSelectedFood] = useState<OFFProduct | typeof FOOD_DB[0] | null>(null)
  const [customFood, setCustomFood] = useState('')
  const [customCal, setCustomCal] = useState('')
  const [customP, setCustomP] = useState('')
  const [customC, setCustomC] = useState('')
  const [customF, setCustomF] = useState('')
  const [targetCal, setTargetCal] = useState(2000)
  const [targetProtein, setTargetProtein] = useState(150)
  const [itemName, setItemName] = useState('')
  const [itemQty, setItemQty] = useState('')
  const [itemCat, setItemCat] = useState('שונות')
  const [error, setError] = useState('')
  // Barcode scanner
  const [showScanner, setShowScanner] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState('')
  const [scanResult, setScanResult] = useState<OFFProduct | null>(null)
  const [cameraError, setCameraError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanIntervalRef = useRef<number | null>(null)
  // Midday check
  const [middayCheck, setMiddayCheck] = useState('')

  const now = new Date()
  const today = format(now, 'EEEE', { locale: he }).replace('יום ', '')

  const loadLogs = useCallback(async () => {
    const last30 = format(subDays(now, 30), 'yyyy-MM-dd')
    const { data } = await supabase.from('food_logs').select('*')
      .eq('user_id', user.id).gte('date', last30).order('created_at', { ascending: false })
    setLogs(data || [])
  }, [user.id])

  useEffect(() => {
    loadLogs()
    const mp = localStorage.getItem(`shimshon_mealplan_${user.id}`)
    if (mp) try { setMealPlan(JSON.parse(mp)) } catch {}
    const sh = localStorage.getItem(`shimshon_shopping_${user.id}`)
    if (sh) try { setShopping(JSON.parse(sh)) } catch {}
    const pr = localStorage.getItem(`shimshon_prefs_${user.id}`)
    if (pr) setPreferences(pr)
    const tc = localStorage.getItem(`shimshon_target_cal_${user.id}`)
    if (tc) setTargetCal(parseInt(tc) || 2000)
    const tp = localStorage.getItem(`shimshon_target_protein_${user.id}`)
    if (tp) setTargetProtein(parseInt(tp) || 150)
  }, [user.id])

  // Search OFF when user types
  useEffect(() => {
    if (foodSearch.length < 2) { setOffResults([]); return }
    const timer = setTimeout(async () => {
      setOffLoading(true)
      const results = await searchOFF(foodSearch)
      setOffResults(results)
      setOffLoading(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [foodSearch])

  const todayLogs = logs.filter(l => l.date === selectedDate)
  const totalCal  = todayLogs.reduce((s,l) => s + l.calories, 0)
  const totalP    = todayLogs.reduce((s,l) => s + l.protein, 0)
  const totalC    = todayLogs.reduce((s,l) => s + l.carbs, 0)
  const totalF    = todayLogs.reduce((s,l) => s + l.fat, 0)
  const calPct    = Math.min((totalCal / targetCal) * 100, 100)
  const protPct   = Math.min((totalP / targetProtein) * 100, 100)

  const localResults = foodSearch.length > 1
    ? FOOD_DB.filter(f => f.name.includes(foodSearch)).slice(0, 5)
    : []

  // ── Midday check ──────────────────────────────────────────
  const runMiddayCheck = async () => {
    const hr = now.getHours()
    const pct = Math.round((totalCal / targetCal) * 100)
    const msg = `השעה ${hr}:00. עד כה היום אכלת ${totalCal} קלוריות (${pct}% מהיעד) ו-${Math.round(totalP)}g חלבון מתוך ${targetProtein}g. יעד קלוריות: ${targetCal}. כתוב 2 משפטים קצרים: איך אנחנו מבחינת המעקב, ומה כדאי לאכול בהמשך היום.`
    const res = await callShimshon(msg)
    setMiddayCheck(res.replace(/```json|```/g,'').trim())
  }

  // ── Camera / Barcode scanner ──────────────────────────────
  const startCamera = async () => {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      // Auto-scan every 800ms using ZXing via CDN
      scanIntervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || !canvasRef.current) return
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (!ctx || videoRef.current.readyState < 2) return
        canvas.width  = videoRef.current.videoWidth
        canvas.height = videoRef.current.videoHeight
        ctx.drawImage(videoRef.current, 0, 0)
        // Use ZXing if available
        if ((window as any).ZXing) {
          try {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const hints = new Map()
            const reader = new (window as any).ZXing.MultiFormatReader()
            reader.setHints(hints)
            const luminanceSource = new (window as any).ZXing.RGBLuminanceSource(imageData.data, canvas.width, canvas.height)
            const binaryBitmap = new (window as any).ZXing.BinaryBitmap(new (window as any).ZXing.HybridBinarizer(luminanceSource))
            const result = reader.decode(binaryBitmap)
            if (result) handleBarcode(result.getText())
          } catch {}
        }
      }, 800)
    } catch (e: any) {
      setCameraError('לא ניתן לגשת למצלמה. נסה להזין ברקוד ידנית.')
    }
  }

  const stopCamera = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  const handleBarcode = async (code: string) => {
    if (scanLoading) return
    stopCamera()
    setScanLoading(true)
    const product = await lookupBarcode(code)
    if (product) {
      setScanResult(product)
      setSelectedFood({ name: product.name, cal: product.calories, p: product.protein, c: product.carbs, f: product.fat })
      setFoodSearch(product.name)
    } else {
      setCameraError(`ברקוד ${code} לא נמצא במאגר. נסה מוצר אחר.`)
    }
    setScanLoading(false)
  }

  const addFoodLog = async (food: { name:string; cal:number; p:number; c:number; f:number } | null) => {
    const amount = parseFloat(foodAmount) || 100
    const ratio  = amount / 100
    const src = food || { name: customFood, cal: parseFloat(customCal)||0, p: parseFloat(customP)||0, c: parseFloat(customC)||0, f: parseFloat(customF)||0 }
    if (!src.name) return
    const entry = {
      user_id: user.id, date: selectedDate, meal: addMealType, food: src.name,
      calories: Math.round(src.cal * ratio), protein: Math.round(src.p * ratio * 10) / 10,
      carbs: Math.round(src.c * ratio * 10) / 10, fat: Math.round(src.f * ratio * 10) / 10,
      amount_g: amount,
    }
    const { data } = await supabase.from('food_logs').insert(entry).select().single()
    if (data) {
      setLogs(p => [data, ...p.filter(l => l.id !== data.id)])
      setShowAddMeal(false); setFoodSearch(''); setFoodAmount('100')
      setSelectedFood(null); setScanResult(null); setOffResults([])
      setCustomFood(''); setCustomCal(''); setCustomP(''); setCustomC(''); setCustomF('')
    }
  }

  const addPreset = async (preset: typeof MEAL_PRESETS[0]['items'][0], meal: string) => {
    const entry = {
      user_id: user.id, date: selectedDate, meal, food: preset.name,
      calories: preset.calories, protein: preset.protein, carbs: preset.carbs, fat: preset.fat, amount_g: 1
    }
    const { data } = await supabase.from('food_logs').insert(entry).select().single()
    if (data) setLogs(p => [data, ...p])
  }

  const deleteLog = async (id: string) => {
    await supabase.from('food_logs').delete().eq('id', id)
    setLogs(p => p.filter(l => l.id !== id))
  }

  const saveShopping = (items: ShoppingItem[]) => {
    setShopping(items)
    localStorage.setItem(`shimshon_shopping_${user.id}`, JSON.stringify(items))
  }

  const generateMenu = async () => {
    setGenerating(true); setError('')
    try {
      const text = await callShimshon(
        `צור תפריט שבועי בריא לאדם ישראלי.${preferences ? ' העדפות: ' + preferences : ''} יעד קלוריות: ${targetCal} ליום.\nהחזר JSON מערך בלבד:\n[{"day":"ראשון","meal":"ארוחת בוקר","food":"שם","calories":300,"protein":15,"carbs":40,"fat":8}]\n4 ארוחות × 7 ימים = 28 רשומות. ימים: ראשון שני שלישי רביעי חמישי שישי שבת. ארוחות: ארוחת בוקר, ארוחת צהריים, ארוחת ערב, חטיף.`
      )
      const plan: MealPlan[] = JSON.parse(text.replace(/```json|```/g,'')).map((m: any, i: number) => ({...m, id: String(i)}))
      setMealPlan(plan)
      localStorage.setItem(`shimshon_mealplan_${user.id}`, JSON.stringify(plan))
    } catch { setError('שגיאה ביצירת תפריט') }
    setGenerating(false)
  }

  const last7 = Array.from({length:7}, (_,i) => {
    const d = format(subDays(now, 6-i), 'yyyy-MM-dd')
    const dl = logs.filter(l => l.date === d)
    return { date: d, label: format(subDays(now,6-i),'EEE',{locale:he}), cal: dl.reduce((s,l)=>s+l.calories,0), prot: dl.reduce((s,l)=>s+l.protein,0) }
  })
  const maxCal = Math.max(...last7.map(d=>d.cal), targetCal, 1)

  const TABS: {id:Tab; label:string; emoji:string}[] = [
    { id:'log',      label:'יומן',     emoji:'📝' },
    { id:'presets',  label:'תפריטים',  emoji:'🍽' },
    { id:'plan',     label:'שבועי',    emoji:'📅' },
    { id:'shopping', label:'קניות',    emoji:'🛒' },
    { id:'stats',    label:'סטטיסטיקות', emoji:'📊' },
  ]

  return (
    <div className="module-page fade-in">
      {/* Header */}
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{color:'var(--m-food)'}}>🥗</span> תזונה</h1>
          <p className="module-sub">{format(now,'d בMMMM',{locale:he})} · {totalCal}/{targetCal} קל' · {Math.round(totalP)}/{targetProtein}g חל'</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn-ghost" onClick={()=>setShowPrefs(true)}>⚙️</button>
          <button className="btn-ghost" onClick={()=>{setShowScanner(true); setTimeout(startCamera, 300)}}>📷 ברקוד</button>
          <button className="btn-gold" onClick={()=>setShowAddMeal(true)}>+ ארוחה</button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="nutr-summary">
        {/* Cal ring */}
        <div className="nutr-cal-ring">
          <svg width="76" height="76" viewBox="0 0 76 76">
            <circle cx="38" cy="38" r="30" fill="none" stroke="var(--surface3)" strokeWidth="7"/>
            <circle cx="38" cy="38" r="30" fill="none" stroke="var(--m-food)" strokeWidth="7"
              strokeDasharray={`${2*Math.PI*30*calPct/100} ${2*Math.PI*30}`}
              strokeLinecap="round" transform="rotate(-90 38 38)"
              style={{transition:'stroke-dasharray .8s'}}/>
            <text x="38" y="34" textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--text)" fontFamily="DM Sans,sans-serif">{totalCal}</text>
            <text x="38" y="47" textAnchor="middle" fontSize="9" fill="var(--text3)" fontFamily="DM Sans,sans-serif">קל'</text>
          </svg>
        </div>
        {/* Protein ring */}
        <div className="nutr-cal-ring">
          <svg width="76" height="76" viewBox="0 0 76 76">
            <circle cx="38" cy="38" r="30" fill="none" stroke="var(--surface3)" strokeWidth="7"/>
            <circle cx="38" cy="38" r="30" fill="none" stroke="var(--red)" strokeWidth="7"
              strokeDasharray={`${2*Math.PI*30*protPct/100} ${2*Math.PI*30}`}
              strokeLinecap="round" transform="rotate(-90 38 38)"
              style={{transition:'stroke-dasharray .8s'}}/>
            <text x="38" y="34" textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--text)" fontFamily="DM Sans,sans-serif">{Math.round(totalP)}</text>
            <text x="38" y="47" textAnchor="middle" fontSize="9" fill="var(--text3)" fontFamily="DM Sans,sans-serif">חל' g</text>
          </svg>
        </div>
        {/* Macros */}
        <div className="nutr-macros-row">
          {[
            {label:'פחמימות', val:totalC, color:'var(--blue)', icon:'🍞'},
            {label:'שומן', val:totalF, color:'var(--green)', icon:'🥑'},
          ].map(m => (
            <div key={m.label} className="nutr-macro-block">
              <div className="nutr-macro-icon">{m.icon}</div>
              <div className="nutr-macro-val" style={{color:m.color}}>{Math.round(m.val)}g</div>
              <div className="nutr-macro-label">{m.label}</div>
            </div>
          ))}
        </div>
        {/* Date nav */}
        <div className="nutr-date-nav">
          <button className="btn-icon" onClick={()=>setSelectedDate(format(subDays(parseISO(selectedDate),1),'yyyy-MM-dd'))}>›</button>
          <div className="nutr-date-label">
            {selectedDate === format(now,'yyyy-MM-dd') ? 'היום' :
             selectedDate === format(subDays(now,1),'yyyy-MM-dd') ? 'אתמול' :
             format(parseISO(selectedDate),'d/M',{locale:he})}
          </div>
          <button className="btn-icon" disabled={selectedDate >= format(now,'yyyy-MM-dd')}
            onClick={()=>setSelectedDate(format(new Date(new Date(selectedDate).getTime()+86400000),'yyyy-MM-dd'))}>‹</button>
        </div>
        {/* Midday check */}
        <button className="nutr-midday-btn" onClick={runMiddayCheck} title="בדיקת אמצע היום">🔔 בדיקה</button>
      </div>

      {/* Midday check result */}
      {middayCheck && (
        <div className="nutr-midday-card card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div style={{fontSize:13,lineHeight:1.6}}>{middayCheck}</div>
            <button style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:14,flexShrink:0,marginRight:8}} onClick={()=>setMiddayCheck('')}>✕</button>
          </div>
        </div>
      )}

      {error && <div className="nutr-error">⚠️ {error}</div>}

      {/* Tabs */}
      <div className="tab-bar" style={{marginBottom:16}}>
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      {/* ── LOG TAB ──────────────────────────────────── */}
      {tab === 'log' && (
        <div className="nutr-log">
          {MEALS.map(meal => {
            const mealLogs = todayLogs.filter(l => l.meal === meal)
            const mealCal = mealLogs.reduce((s,l)=>s+l.calories,0)
            const mealP   = mealLogs.reduce((s,l)=>s+l.protein,0)
            return (
              <div key={meal} className="nutr-meal-section card">
                <div className="nutr-meal-header">
                  <span className="nutr-meal-icon">{MEAL_ICONS[meal]}</span>
                  <span className="nutr-meal-name">{meal}</span>
                  {mealCal > 0 && <span className="nutr-meal-total">{mealCal} קל' · {Math.round(mealP)}g חל'</span>}
                  <button className="btn-icon" style={{width:28,height:28,fontSize:13}} onClick={()=>{setAddMealType(meal);setShowAddMeal(true)}}>+</button>
                </div>
                {mealLogs.length > 0 ? mealLogs.map(l => (
                  <div key={l.id} className="nutr-food-row">
                    <div className="nutr-food-info">
                      <span className="nutr-food-name">{l.food}</span>
                      <span className="nutr-food-meta">{l.amount_g > 1 ? `${l.amount_g}g · ` : ''}{l.protein}g חל' · {l.carbs}g פח' · {l.fat}g שו'</span>
                    </div>
                    <span className="nutr-food-cal">{l.calories}</span>
                    <button className="nutr-del" onClick={()=>deleteLog(l.id)}>✕</button>
                  </div>
                )) : (
                  <div className="nutr-meal-empty" onClick={()=>{setAddMealType(meal);setShowAddMeal(true)}}>לחץ + להוסיף</div>
                )}
              </div>
            )
          })}
          <button className="btn-ghost" style={{width:'100%',marginTop:4}} onClick={()=>setShowAddMeal(true)}>+ הוסף מזון</button>
        </div>
      )}

      {/* ── PRESETS TAB ──────────────────────────────── */}
      {tab === 'presets' && (
        <div>
          <p style={{fontSize:13,color:'var(--text3)',marginBottom:16}}>בחר ארוחה מוכנה ולחץ + להוסיף ליומן</p>
          {MEAL_PRESETS.map(cat => (
            <div key={cat.category} style={{marginBottom:20}}>
              <div className="nutr-preset-cat">{cat.category}</div>
              <div className="nutr-preset-grid">
                {cat.items.map(item => (
                  <div key={item.name} className="nutr-preset-card card">
                    <div className="nutr-preset-name">{item.name}</div>
                    <div className="nutr-preset-macros">
                      <span style={{color:'var(--amber)'}}>{item.calories}</span>
                      <span style={{color:'var(--red)'}}>{item.protein}g חל'</span>
                    </div>
                    <div className="nutr-preset-macros" style={{fontSize:11}}>
                      <span style={{color:'var(--blue)'}}>{item.carbs}g פח'</span>
                      <span style={{color:'var(--green)'}}>{item.fat}g שו'</span>
                    </div>
                    <div className="nutr-preset-actions">
                      {MEALS.map(meal => (
                        <button key={meal} className="nutr-preset-add" onClick={()=>addPreset(item, meal)}
                          title={meal} style={{fontSize:14}}>{MEAL_ICONS[meal]}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── PLAN TAB ─────────────────────────────────── */}
      {tab === 'plan' && (
        <div>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
            <button className="btn-gold" onClick={generateMenu} disabled={generating}>
              {generating ? '⏳ יוצר...' : '✨ צור תפריט AI'}
            </button>
          </div>
          {mealPlan.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">📅</div><p>לחץ "צור תפריט AI" לקבל תפריט שבועי</p></div>
          ) : (
            <div className="nutr-week">
              {DAYS.map(day => {
                const dm = mealPlan.filter(m => m.day === day)
                const dc = dm.reduce((s,m)=>s+m.calories,0)
                const isToday = today === day
                return (
                  <div key={day} className={`nutr-day card ${isToday?'nutr-today-day':''}`}>
                    <div className="nutr-day-hdr">
                      <span style={{fontWeight:700,fontSize:13,color:isToday?'var(--m-food)':'var(--text)'}}>{isToday?`${day} ✓`:day}</span>
                      <span style={{fontSize:11,color:'var(--text3)'}}>{dc} קל'</span>
                    </div>
                    {MEALS.map(meal => {
                      const m = dm.find(x=>x.meal===meal)
                      return m ? (
                        <div key={meal} className="nutr-plan-row">
                          <span>{MEAL_ICONS[meal]}</span>
                          <span className="nutr-plan-food">{m.food}</span>
                          <span className="nutr-plan-cal">{m.calories}</span>
                        </div>
                      ) : null
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SHOPPING TAB ─────────────────────────────── */}
      {tab === 'shopping' && (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
            <span style={{fontSize:13,color:'var(--text3)'}}>{shopping.filter(i=>i.checked).length}/{shopping.length} נרכש</span>
            <div style={{display:'flex',gap:8}}>
              {shopping.some(i=>i.checked)&&<button className="btn-ghost" style={{fontSize:12,height:32}} onClick={()=>saveShopping(shopping.filter(i=>!i.checked))}>🗑 נקה</button>}
              <button className="btn-ghost" style={{fontSize:12,height:32}} onClick={()=>setShowAddItem(true)}>+ הוסף</button>
            </div>
          </div>
          {shopping.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">🛒</div><p>הוסף פריטים ידנית</p></div>
          ) : (
            SHOP_CATS.filter(cat=>shopping.some(i=>i.category===cat)).map(cat => (
              <div key={cat} style={{marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:700,color:CAT_COLORS[cat],letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:6}}>{cat}</div>
                {shopping.filter(i=>i.category===cat).map(item => (
                  <div key={item.id} className={`nutr-shop-item card ${item.checked?'nutr-checked':''}`}>
                    <button className="nutr-check-btn" onClick={()=>saveShopping(shopping.map(i=>i.id===item.id?{...i,checked:!i.checked}:i))}
                      style={item.checked?{background:'var(--green-dim)',borderColor:'var(--green)',color:'var(--green)'}:{}}>{item.checked?'✓':''}</button>
                    <div style={{flex:1}}>
                      <span style={item.checked?{textDecoration:'line-through',color:'var(--text3)'}:{}}>{item.name}</span>
                      {item.quantity&&<span style={{fontSize:11,color:'var(--text3)',marginRight:6}}>{item.quantity}</span>}
                    </div>
                    <button style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer'}} onClick={()=>saveShopping(shopping.filter(i=>i.id!==item.id))}>✕</button>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {/* ── STATS TAB ────────────────────────────────── */}
      {tab === 'stats' && (
        <div>
          <div className="card" style={{padding:20,marginBottom:14}}>
            <div className="nutr-stats-title">קלוריות + חלבון — 7 ימים</div>
            <div className="nutr-bar-chart">
              {last7.map(d => {
                const calH = (d.cal / maxCal) * 100
                const isToday = d.date === format(now,'yyyy-MM-dd')
                return (
                  <div key={d.date} className="nutr-bar-col" onClick={()=>setSelectedDate(d.date)}>
                    <div className="nutr-bar-val">{d.cal>0?d.cal:''}</div>
                    <div className="nutr-bar-wrap">
                      <div className="nutr-bar-fill" style={{height:`${calH}%`, background:isToday?'var(--m-food)':'var(--amber)', opacity:isToday?1:0.75}}/>
                      {d.prot > 0 && <div className="nutr-prot-indicator" style={{bottom:`${calH}%`, opacity: d.prot/targetProtein >= 0.8 ? 1 : 0.4}}/>}
                      <div className="nutr-target-line" style={{bottom:`${(targetCal/maxCal)*100}%`}}/>
                    </div>
                    <div className="nutr-bar-label" style={{color:isToday?'var(--m-food)':'var(--text3)'}}>{d.label}</div>
                  </div>
                )
              })}
            </div>
            <div style={{fontSize:11,color:'var(--text3)',marginTop:8,display:'flex',gap:16}}>
              <span><span style={{display:'inline-block',width:12,height:2,background:'var(--green)',opacity:.6,marginLeft:4,verticalAlign:'middle'}}/>יעד {targetCal} קל'</span>
              <span><span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:'var(--red)',marginLeft:4,verticalAlign:'middle'}}/>חלבון ≥80%</span>
            </div>
          </div>
          <div className="nutr-avg-grid">
            {[
              {label:'ממוצע קלוריות',val:Math.round(last7.filter(d=>d.cal>0).reduce((s,d)=>s+d.cal,0)/Math.max(last7.filter(d=>d.cal>0).length,1)),unit:"קל'",color:'var(--m-food)'},
              {label:'ממוצע חלבון',val:Math.round(last7.filter(d=>d.prot>0).reduce((s,d)=>s+d.prot,0)/Math.max(last7.filter(d=>d.prot>0).length,1)),unit:'g',color:'var(--red)'},
              {label:'ימי מעקב',val:last7.filter(d=>d.cal>0).length,unit:'/ 7',color:'var(--blue)'},
            ].map(s => (
              <div key={s.label} className="stat-card">
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{color:s.color}}>{s.val} <span style={{fontSize:13,color:'var(--text3)'}}>{s.unit}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BARCODE SCANNER MODAL ────────────────────── */}
      {showScanner && (
        <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget){stopCamera();setShowScanner(false);setScanResult(null);setCameraError('')}}}>
          <div className="modal-card card fade-in" style={{maxWidth:460}}>
            <div className="modal-header">
              <h3>📷 סריקת ברקוד</h3>
              <button className="modal-close" onClick={()=>{stopCamera();setShowScanner(false);setScanResult(null);setCameraError('')}}>✕</button>
            </div>
            <div style={{padding:'0 0 16px'}}>
              {scanResult ? (
                <div>
                  {scanResult.image && <img src={scanResult.image} alt={scanResult.name} style={{width:80,height:80,objectFit:'contain',borderRadius:10,display:'block',margin:'0 auto 12px'}}/>}
                  <div className="nutr-scan-result card">
                    <div style={{fontWeight:700,fontSize:15,marginBottom:6}}>{scanResult.name}</div>
                    <div style={{display:'flex',gap:12,fontSize:13}}>
                      <span style={{color:'var(--amber)'}}>{scanResult.calories} קל'</span>
                      <span style={{color:'var(--red)'}}>{scanResult.protein}g חל'</span>
                      <span style={{color:'var(--blue)'}}>{scanResult.carbs}g פח'</span>
                      <span style={{color:'var(--green)'}}>{scanResult.fat}g שו'</span>
                    </div>
                    <div style={{fontSize:11,color:'var(--text3)',marginTop:4}}>לכל 100g</div>
                  </div>
                  <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
                    {MEALS.map(meal => (
                      <button key={meal} className="btn-ghost" style={{flex:1,fontSize:12}}
                        onClick={()=>{
                          setAddMealType(meal)
                          setSelectedFood({name:scanResult.name,cal:scanResult.calories,p:scanResult.protein,c:scanResult.carbs,f:scanResult.fat})
                          setFoodSearch(scanResult.name)
                          stopCamera(); setShowScanner(false); setShowAddMeal(true)
                        }}>
                        {MEAL_ICONS[meal]} {meal}
                      </button>
                    ))}
                  </div>
                  <button className="btn-ghost" style={{width:'100%',marginTop:8}} onClick={()=>{setScanResult(null);setCameraError('');startCamera()}}>סרוק שוב</button>
                </div>
              ) : (
                <div>
                  <div className="nutr-camera-wrap">
                    <video ref={videoRef} style={{width:'100%',borderRadius:12,display:'block'}} playsInline muted/>
                    <canvas ref={canvasRef} style={{display:'none'}}/>
                    {scanLoading && <div className="nutr-scan-loading">🔍 מחפש מוצר...</div>}
                    <div className="nutr-scan-frame"/>
                  </div>
                  {cameraError && <div className="nutr-error" style={{marginTop:10}}>{cameraError}</div>}
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:12,color:'var(--text3)',marginBottom:6,textAlign:'center'}}>— או הזן ברקוד ידנית —</div>
                    <div style={{display:'flex',gap:8}}>
                      <input className="form-input" style={{flex:1}} value={barcodeInput} onChange={e=>setBarcodeInput(e.target.value)}
                        placeholder="729010337xxx" inputMode="numeric" onKeyDown={e=>e.key==='Enter'&&handleBarcode(barcodeInput)}/>
                      <button className="btn-gold" onClick={()=>handleBarcode(barcodeInput)} disabled={!barcodeInput||scanLoading}>
                        {scanLoading?'...':'חפש'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ADD MEAL MODAL ───────────────────────────── */}
      {showAddMeal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowAddMeal(false)}>
          <div className="modal-card card fade-in" style={{maxWidth:520}}>
            <div className="modal-header">
              <h3>הוסף מזון</h3>
              <button className="modal-close" onClick={()=>setShowAddMeal(false)}>✕</button>
            </div>
            <div className="modal-form">
              {/* Meal selector */}
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {MEALS.map(m => (
                  <button key={m} style={{flex:1,padding:'7px 4px',borderRadius:8,border:`1.5px solid ${addMealType===m?'var(--m-food)':'var(--border)'}`,background:addMealType===m?'rgba(245,158,11,.12)':'transparent',cursor:'pointer',fontSize:12,fontWeight:600,color:addMealType===m?'var(--m-food)':'var(--text2)'}}
                    onClick={()=>setAddMealType(m)}>{MEAL_ICONS[m]} {m}</button>
                ))}
              </div>

              {/* Search */}
              <div className="mfield">
                <label>חיפוש מזון (מאגר מקומי + Open Food Facts)</label>
                <input className="form-input" value={foodSearch} onChange={e=>{setFoodSearch(e.target.value);setSelectedFood(null)}}
                  placeholder="חפש: עוף, אורז, Prigat..." autoFocus/>
              </div>

              {/* Local results */}
              {localResults.length > 0 && (
                <div className="nutr-search-results">
                  <div style={{fontSize:10,color:'var(--text3)',padding:'6px 14px',letterSpacing:'0.06em',textTransform:'uppercase'}}>מאגר מקומי</div>
                  {localResults.map(f => (
                    <div key={f.name} className={`nutr-search-item ${selectedFood && 'name' in selectedFood && (selectedFood as any).name===f.name?'selected':''}`}
                      onClick={()=>{setSelectedFood({...f,name:f.name});setFoodSearch(f.name)}}>
                      <span className="nutr-search-name">{f.name}</span>
                      <span className="nutr-search-info">{f.cal} קל' | {f.p}g חל' / 100g</span>
                    </div>
                  ))}
                </div>
              )}

              {/* OFF results */}
              {offLoading && <div style={{fontSize:12,color:'var(--text3)',padding:'8px 0'}}>🔍 מחפש ב-Open Food Facts...</div>}
              {offResults.length > 0 && (
                <div className="nutr-search-results">
                  <div style={{fontSize:10,color:'var(--text3)',padding:'6px 14px',letterSpacing:'0.06em',textTransform:'uppercase'}}>Open Food Facts 🌐</div>
                  {offResults.map((f,i) => (
                    <div key={i} className={`nutr-search-item ${selectedFood && 'barcode' in selectedFood && (selectedFood as any).barcode===f.barcode?'selected':''}`}
                      onClick={()=>{setSelectedFood({name:f.name,cal:f.calories,p:f.protein,c:f.carbs,f:f.fat});setFoodSearch(f.name)}}>
                      <span className="nutr-search-name">{f.name}</span>
                      <span className="nutr-search-info">{f.calories} קל' | {f.protein}g חל'</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Amount + calc */}
              {selectedFood && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                  <div className="mfield">
                    <label>כמות (גרם)</label>
                    <input className="form-input" type="number" value={foodAmount} onChange={e=>setFoodAmount(e.target.value)}/>
                  </div>
                  <div className="mfield">
                    <label>קלוריות בפועל</label>
                    <div className="form-input" style={{color:'var(--amber)',fontWeight:700,display:'flex',alignItems:'center'}}>
                      {Math.round((selectedFood as any).cal * (parseFloat(foodAmount)||100) / 100)} קל'
                      {' · '}{Math.round((selectedFood as any).p * (parseFloat(foodAmount)||100) / 100)}g חל'
                    </div>
                  </div>
                </div>
              )}

              {/* Manual */}
              {!selectedFood && (
                <div>
                  <div style={{fontSize:11,color:'var(--text3)',textAlign:'center',margin:'4px 0 8px'}}>— הזנה ידנית —</div>
                  <div className="mfield"><label>שם</label><input className="form-input" value={customFood} onChange={e=>setCustomFood(e.target.value)} placeholder="שם המנה"/></div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:6}}>
                    {[{l:'קלוריות',v:customCal,s:setCustomCal},{l:'חלבון',v:customP,s:setCustomP},{l:'פחמימות',v:customC,s:setCustomC},{l:'שומן',v:customF,s:setCustomF}].map(x=>(
                      <div key={x.l} className="mfield"><label>{x.l}</label><input className="form-input" type="number" value={x.v} onChange={e=>x.s(e.target.value)} placeholder="0"/></div>
                    ))}
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button className="btn-ghost" onClick={()=>{setShowAddMeal(false);setSelectedFood(null)}}>ביטול</button>
                <button className="btn-ghost" onClick={()=>{stopCamera();setShowAddMeal(false);setShowScanner(true);setTimeout(startCamera,300)}}>📷 ברקוד</button>
                <button className="btn-gold" disabled={!selectedFood && !customFood}
                  onClick={()=>addFoodLog(selectedFood as any)}>+ הוסף</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD SHOPPING ──────────────────────────────── */}
      {showAddItem && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowAddItem(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header"><h3>הוסף לרשימה</h3><button className="modal-close" onClick={()=>setShowAddItem(false)}>✕</button></div>
            <div className="modal-form">
              <div className="mfield"><label>פריט</label><input className="form-input" value={itemName} onChange={e=>setItemName(e.target.value)} placeholder="עגבניות" autoFocus/></div>
              <div className="mfield"><label>כמות</label><input className="form-input" value={itemQty} onChange={e=>setItemQty(e.target.value)} placeholder='1 ק"ג'/></div>
              <div className="mfield"><label>קטגוריה</label>
                <select className="form-input" value={itemCat} onChange={e=>setItemCat(e.target.value)}>
                  {SHOP_CATS.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={()=>setShowAddItem(false)}>ביטול</button>
                <button className="btn-gold" onClick={()=>{if(!itemName)return;saveShopping([...shopping,{id:Date.now().toString(),name:itemName,quantity:itemQty,category:itemCat,checked:false}]);setItemName('');setItemQty('');setShowAddItem(false)}}>הוסף</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PREFERENCES ───────────────────────────────── */}
      {showPrefs && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowPrefs(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header"><h3>⚙️ הגדרות תזונה</h3><button className="modal-close" onClick={()=>setShowPrefs(false)}>✕</button></div>
            <div className="modal-form">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div className="mfield"><label>יעד קלוריות יומי</label><input className="form-input" type="number" value={targetCal} onChange={e=>setTargetCal(parseInt(e.target.value)||2000)}/></div>
                <div className="mfield"><label>יעד חלבון (g)</label><input className="form-input" type="number" value={targetProtein} onChange={e=>setTargetProtein(parseInt(e.target.value)||150)}/></div>
              </div>
              <div className="mfield"><label>העדפות / אלרגיות</label>
                <textarea className="form-input" style={{height:70}} value={preferences} onChange={e=>setPreferences(e.target.value)} placeholder="ללא גלוטן, צמחוני..."/>
              </div>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={()=>setShowPrefs(false)}>ביטול</button>
                <button className="btn-gold" onClick={()=>{
                  localStorage.setItem(`shimshon_prefs_${user.id}`, preferences)
                  localStorage.setItem(`shimshon_target_cal_${user.id}`, String(targetCal))
                  localStorage.setItem(`shimshon_target_protein_${user.id}`, String(targetProtein))
                  setShowPrefs(false)
                }}>שמור</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
