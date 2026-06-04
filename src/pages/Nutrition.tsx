import { useState, useEffect, useCallback } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { format, subDays, parseISO } from 'date-fns'
import { he } from 'date-fns/locale'
import './Nutrition.css'

interface FoodLog { id: string; date: string; meal: string; food: string; calories: number; protein: number; carbs: number; fat: number; amount_g: number }
interface ShoppingItem { id: string; name: string; quantity: string; category: string; checked: boolean }
interface MealPlan { id: string; day: string; meal: string; food: string; calories: number; protein: number; carbs: number; fat: number }

const MEALS = ['ארוחת בוקר','ארוחת צהריים','ארוחת ערב','חטיף']
const MEAL_ICONS: Record<string,string> = { 'ארוחת בוקר':'🌅','ארוחת צהריים':'☀️','ארוחת ערב':'🌙','חטיף':'🍎' }
const DAYS = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת']
const SHOP_CATS = ['פירות וירקות','בשר ודגים','מוצרי חלב','לחם ודגנים','קפואים','שונות']
const CAT_COLORS: Record<string,string> = {
  'פירות וירקות':'#10B981','בשר ודגים':'#EF4444','מוצרי חלב':'#3B82F6',
  'לחם ודגנים':'#F59E0B','קפואים':'#8B5CF6','שונות':'#6B7280'
}

// Common Israeli foods with nutrition per 100g
const FOOD_DB = [
  { name:'חזה עוף', cal:165, p:31, c:0, f:3.6 },
  { name:'אורז לבן מבושל', cal:130, p:2.7, c:28, f:0.3 },
  { name:'ביצה', cal:155, p:13, c:1.1, f:11 },
  { name:'לחם פיתה', cal:275, p:9, c:55, f:1.2 },
  { name:'גבינה לבנה 5%', cal:75, p:10, c:3.5, f:2 },
  { name:'טונה שימורים', cal:116, p:26, c:0, f:1 },
  { name:'שמן זית', cal:884, p:0, c:0, f:100 },
  { name:'עגבנייה', cal:18, p:0.9, c:3.9, f:0.2 },
  { name:'מלפפון', cal:16, p:0.7, c:3.6, f:0.1 },
  { name:'גזר', cal:41, p:0.9, c:10, f:0.2 },
  { name:'בננה', cal:89, p:1.1, c:23, f:0.3 },
  { name:'תפוח', cal:52, p:0.3, c:14, f:0.2 },
  { name:'קוואקר', cal:389, p:17, c:66, f:7 },
  { name:'חלב 3%', cal:61, p:3.2, c:4.8, f:3.3 },
  { name:'יוגורט 3%', cal:61, p:5, c:4.7, f:3.3 },
  { name:'קוטג׳', cal:103, p:11, c:3.4, f:4.5 },
  { name:'בשר בקר טחון', cal:250, p:26, c:0, f:17 },
  { name:'לחם קל', cal:254, p:9, c:45, f:3 },
  { name:'פסטה מבושלת', cal:131, p:5, c:25, f:1.1 },
  { name:'תפוח אדמה מבושל', cal:87, p:1.9, c:20, f:0.1 },
  { name:'גרעיני חמניה', cal:584, p:21, c:20, f:51 },
  { name:'אלמוגים (גבינה)', cal:264, p:22, c:0, f:20 },
  { name:'חומוס מבושל', cal:164, p:8.9, c:27, f:2.6 },
  { name:'שקדים', cal:579, p:21, c:22, f:50 },
  { name:'ממרח טחינה', cal:592, p:17, c:21, f:54 },
]

async function callShimshon(prompt: string): Promise<string> {
  const res = await fetch('/api/shimshon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', parts: [{ text: prompt }] }],
      systemPrompt: 'אתה עוזר תזונה ישראלי. ענה ב-JSON בלבד, ללא markdown.'
    })
  })
  const data = await res.json()
  return data.text || ''
}

type Tab = 'log' | 'plan' | 'shopping' | 'stats'

export default function Nutrition({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>('log')
  const [logs, setLogs] = useState<FoodLog[]>([])
  const [mealPlan, setMealPlan] = useState<MealPlan[]>([])
  const [shopping, setShopping] = useState<ShoppingItem[]>([])
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [generating, setGenerating] = useState(false)
  const [genStep, setGenStep] = useState('')
  const [preferences, setPreferences] = useState('')
  const [showPrefs, setShowPrefs] = useState(false)
  const [showAddMeal, setShowAddMeal] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [addMealType, setAddMealType] = useState('ארוחת בוקר')
  const [foodSearch, setFoodSearch] = useState('')
  const [foodAmount, setFoodAmount] = useState('100')
  const [customFood, setCustomFood] = useState('')
  const [customCal, setCustomCal] = useState('')
  const [customP, setCustomP] = useState('')
  const [customC, setCustomC] = useState('')
  const [customF, setCustomF] = useState('')
  const [itemName, setItemName] = useState('')
  const [itemQty, setItemQty] = useState('')
  const [itemCat, setItemCat] = useState('שונות')
  const [targetCal, setTargetCal] = useState(2000)
  const [error, setError] = useState('')

  const now = new Date()
  const today = format(now, 'EEEE', { locale: he }).replace('יום ', '')

  // Load
  const loadLogs = useCallback(async () => {
    const last30 = format(subDays(now, 30), 'yyyy-MM-dd')
    const { data } = await supabase.from('food_logs').select('*').eq('user_id', user.id).gte('date', last30).order('date', { ascending: false })
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
    const tc = localStorage.getItem(`shimshon_target_${user.id}`)
    if (tc) setTargetCal(parseInt(tc) || 2000)
  }, [user.id])

  // Today's logs
  const todayLogs = logs.filter(l => l.date === selectedDate)
  const totalCal = todayLogs.reduce((s, l) => s + l.calories, 0)
  const totalP = todayLogs.reduce((s, l) => s + l.protein, 0)
  const totalC = todayLogs.reduce((s, l) => s + l.carbs, 0)
  const totalF = todayLogs.reduce((s, l) => s + l.fat, 0)
  const calPct = Math.min((totalCal / targetCal) * 100, 100)

  // Food search results
  const searchResults = foodSearch.length > 1
    ? FOOD_DB.filter(f => f.name.includes(foodSearch)).slice(0, 8)
    : []

  const addFoodLog = async (food: typeof FOOD_DB[0] | null) => {
    const amount = parseFloat(foodAmount) || 100
    const ratio = amount / 100
    const entry = {
      user_id: user.id,
      date: selectedDate,
      meal: addMealType,
      food: food ? food.name : customFood,
      calories: Math.round((food ? food.cal : parseFloat(customCal) || 0) * ratio),
      protein: Math.round((food ? food.p : parseFloat(customP) || 0) * ratio * 10) / 10,
      carbs: Math.round((food ? food.c : parseFloat(customC) || 0) * ratio * 10) / 10,
      fat: Math.round((food ? food.f : parseFloat(customF) || 0) * ratio * 10) / 10,
      amount_g: amount,
    }
    const { data } = await supabase.from('food_logs').insert(entry).select().single()
    if (data) { setLogs(p => [data, ...p]); setShowAddMeal(false); setFoodSearch(''); setFoodAmount('100'); setCustomFood('') }
  }

  const deleteLog = async (id: string) => {
    await supabase.from('food_logs').delete().eq('id', id)
    setLogs(p => p.filter(l => l.id !== id))
  }

  const generateMenu = async () => {
    setGenerating(true); setError('')
    try {
      setGenStep('יוצר תפריט...')
      const menuText = await callShimshon(
        `צור תפריט שבועי בריא לאדם ישראלי.${preferences ? ' העדפות: ' + preferences : ''}
החזר JSON מערך בלבד:
[{"day":"ראשון","meal":"ארוחת בוקר","food":"שם","calories":300,"protein":15,"carbs":40,"fat":8}]
4 ארוחות × 7 ימים = 28 רשומות. ימים: ${DAYS.join(' ')}. ארוחות: ${MEALS.join(', ')}.`
      )
      const plan: MealPlan[] = JSON.parse(menuText.replace(/```json|```/g,'')).map((m: any, i: number) => ({...m, id: String(i)}))
      setMealPlan(plan)
      localStorage.setItem(`shimshon_mealplan_${user.id}`, JSON.stringify(plan))
      setGenStep('יוצר קניות...')
      await new Promise(r => setTimeout(r, 1500))
      const foods = [...new Set(plan.map(m => m.food))].slice(0, 15).join(', ')
      const shopText = await callShimshon(
        `עבור: ${foods}\nרשימת קניות JSON:\n[{"name":"פריט","quantity":"כמות","category":"קטגוריה"}]\nקטגוריות: ${SHOP_CATS.join(', ')}. 15 פריטים.`
      )
      const items: ShoppingItem[] = JSON.parse(shopText.replace(/```json|```/g,'')).map((i: any, idx: number) => ({...i, id: String(idx), checked: false}))
      setShopping(items)
      localStorage.setItem(`shimshon_shopping_${user.id}`, JSON.stringify(items))
    } catch (e: any) {
      setError('שגיאה ביצירת תפריט — נסה שוב')
    }
    setGenerating(false); setGenStep('')
  }

  const saveShopping = (items: ShoppingItem[]) => {
    setShopping(items)
    localStorage.setItem(`shimshon_shopping_${user.id}`, JSON.stringify(items))
  }

  // Last 7 days for stats
  const last7 = Array.from({length:7}, (_,i) => {
    const d = format(subDays(now, 6-i), 'yyyy-MM-dd')
    const dayLogs = logs.filter(l => l.date === d)
    return { date: d, label: format(subDays(now,6-i),'EEE',{locale:he}), cal: dayLogs.reduce((s,l)=>s+l.calories,0) }
  })
  const maxCal = Math.max(...last7.map(d=>d.cal), targetCal)

  const TABS: {id:Tab, label:string, emoji:string}[] = [
    { id:'log', label:'יומן אוכל', emoji:'📝' },
    { id:'plan', label:'תפריט שבועי', emoji:'📅' },
    { id:'shopping', label:'קניות', emoji:'🛒' },
    { id:'stats', label:'סטטיסטיקות', emoji:'📊' },
  ]

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{color:'var(--m-food)'}}>🥗</span> תזונה</h1>
          <p className="module-sub">{format(now,'d בMMMM',{locale:he})} · {totalCal}/{targetCal} קלוריות</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn-ghost" onClick={()=>setShowPrefs(true)}>⚙️ הגדרות</button>
          <button className="btn-gold" onClick={()=>setShowAddMeal(true)}>+ ארוחה</button>
        </div>
      </div>

      {error && <div className="nutr-error">⚠️ {error}</div>}

      {/* Daily summary strip */}
      <div className="nutr-summary">
        {/* Calorie ring */}
        <div className="nutr-cal-ring">
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--surface3)" strokeWidth="7"/>
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--m-food)" strokeWidth="7"
              strokeDasharray={`${2*Math.PI*32*calPct/100} ${2*Math.PI*32}`}
              strokeLinecap="round" transform="rotate(-90 40 40)"
              style={{transition:'stroke-dasharray .8s'}}/>
            <text x="40" y="37" textAnchor="middle" fontSize="13" fontWeight="800" fill="var(--text)" fontFamily="DM Sans,sans-serif">{totalCal}</text>
            <text x="40" y="51" textAnchor="middle" fontSize="9" fill="var(--text3)" fontFamily="DM Sans,sans-serif">קלוריות</text>
          </svg>
        </div>
        {/* Macros */}
        <div className="nutr-macros-row">
          {[
            {label:'חלבון', val:totalP, color:'var(--red)', unit:'g', icon:'🥩'},
            {label:'פחמימות', val:totalC, color:'var(--blue)', unit:'g', icon:'🍞'},
            {label:'שומן', val:totalF, color:'var(--green)', unit:'g', icon:'🥑'},
          ].map(m => (
            <div key={m.label} className="nutr-macro-block">
              <div className="nutr-macro-icon">{m.icon}</div>
              <div className="nutr-macro-val" style={{color:m.color}}>{Math.round(m.val)}{m.unit}</div>
              <div className="nutr-macro-label">{m.label}</div>
            </div>
          ))}
        </div>
        {/* Date selector */}
        <div className="nutr-date-nav">
          <button className="btn-icon" onClick={()=>setSelectedDate(format(subDays(parseISO(selectedDate),1),'yyyy-MM-dd'))}>›</button>
          <div className="nutr-date-label">
            {selectedDate === format(now,'yyyy-MM-dd') ? 'היום' :
             selectedDate === format(subDays(now,1),'yyyy-MM-dd') ? 'אתמול' :
             format(parseISO(selectedDate),'d/M',{locale:he})}
          </div>
          <button className="btn-icon" onClick={()=>setSelectedDate(format(new Date(new Date(selectedDate).getTime()+86400000),'yyyy-MM-dd'))}
            disabled={selectedDate >= format(now,'yyyy-MM-dd')}>‹</button>
        </div>
      </div>

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
            const mealCal = mealLogs.reduce((s,l)=>s+l.calories, 0)
            return (
              <div key={meal} className="nutr-meal-section card">
                <div className="nutr-meal-header">
                  <span className="nutr-meal-icon">{MEAL_ICONS[meal]}</span>
                  <span className="nutr-meal-name">{meal}</span>
                  <span className="nutr-meal-total">{mealCal > 0 ? `${mealCal} קל'` : ''}</span>
                  <button className="btn-icon" style={{width:28,height:28,fontSize:13}}
                    onClick={()=>{setAddMealType(meal);setShowAddMeal(true)}}>+</button>
                </div>
                {mealLogs.length > 0 ? mealLogs.map(l => (
                  <div key={l.id} className="nutr-food-row">
                    <div className="nutr-food-info">
                      <span className="nutr-food-name">{l.food}</span>
                      <span className="nutr-food-meta">{l.amount_g}g · {l.protein}g חל' · {l.carbs}g פח' · {l.fat}g שו'</span>
                    </div>
                    <span className="nutr-food-cal">{l.calories}</span>
                    <button className="nutr-del" onClick={()=>deleteLog(l.id)}>✕</button>
                  </div>
                )) : (
                  <div className="nutr-meal-empty" onClick={()=>{setAddMealType(meal);setShowAddMeal(true)}}>
                    לחץ + להוסיף
                  </div>
                )}
              </div>
            )
          })}
          <button className="btn-ghost" style={{width:'100%',marginTop:8}} onClick={()=>setShowAddMeal(true)}>
            + הוסף ארוחה / מזון
          </button>
        </div>
      )}

      {/* ── PLAN TAB ─────────────────────────────────── */}
      {tab === 'plan' && (
        <div>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
            <button className="btn-gold" onClick={generateMenu} disabled={generating}>
              {generating ? `⏳ ${genStep}` : '✨ צור תפריט AI'}
            </button>
          </div>
          {mealPlan.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📅</div>
              <p>לחץ "צור תפריט AI" לקבל תפריט שבועי מותאם</p>
            </div>
          ) : (
            <div className="nutr-week">
              {DAYS.map(day => {
                const dayMeals = mealPlan.filter(m => m.day === day)
                const dayCals = dayMeals.reduce((s,m)=>s+m.calories,0)
                const isToday = today === day
                return (
                  <div key={day} className={`nutr-day card ${isToday?'nutr-today-day':''}`}>
                    <div className="nutr-day-hdr">
                      <span style={{fontWeight:700,fontSize:14,color:isToday?'var(--m-food)':'var(--text)'}}>
                        {isToday?`${day} ✓`:day}
                      </span>
                      <span style={{fontSize:12,color:'var(--text3)'}}>{dayCals} קל'</span>
                    </div>
                    {MEALS.map(meal => {
                      const m = dayMeals.find(x=>x.meal===meal)
                      return m ? (
                        <div key={meal} className="nutr-plan-row">
                          <span className="nutr-plan-meal">{MEAL_ICONS[meal]}</span>
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
          {shopping.length===0 ? (
            <div className="empty-state"><div className="empty-state-icon">🛒</div><p>צור תפריט AI לקבל רשימה, או הוסף פריטים ידנית</p></div>
          ) : (
            SHOP_CATS.filter(cat=>shopping.some(i=>i.category===cat)).map(cat => (
              <div key={cat} style={{marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:700,color:CAT_COLORS[cat],letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:8}}>{cat}</div>
                {shopping.filter(i=>i.category===cat).map(item => (
                  <div key={item.id} className={`nutr-shop-item card ${item.checked?'nutr-checked':''}`}>
                    <button className="nutr-check-btn" onClick={()=>saveShopping(shopping.map(i=>i.id===item.id?{...i,checked:!i.checked}:i))}
                      style={item.checked?{background:'var(--green-dim)',borderColor:'var(--green)',color:'var(--green)'}:{}}>
                      {item.checked?'✓':''}
                    </button>
                    <div style={{flex:1}}>
                      <span style={item.checked?{textDecoration:'line-through',color:'var(--text3)'}:{}}>{item.name}</span>
                      {item.quantity&&<span style={{fontSize:11,color:'var(--text3)',marginRight:6}}>{item.quantity}</span>}
                    </div>
                    <button style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:12}} onClick={()=>saveShopping(shopping.filter(i=>i.id!==item.id))}>✕</button>
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
          <div className="card" style={{padding:20,marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:700,color:'var(--text3)',marginBottom:16,letterSpacing:'0.06em',textTransform:'uppercase'}}>קלוריות — 7 ימים אחרונים</div>
            <div className="nutr-bar-chart">
              {last7.map(d => {
                const pct = maxCal > 0 ? (d.cal / maxCal) * 100 : 0
                const isToday = d.date === format(now,'yyyy-MM-dd')
                const onTarget = d.cal > 0 && Math.abs(d.cal - targetCal) < 200
                return (
                  <div key={d.date} className="nutr-bar-col" onClick={()=>setSelectedDate(d.date)}>
                    <div className="nutr-bar-val" style={{color: d.cal===0?'var(--text3)':onTarget?'var(--green)':'var(--m-food)'}}>{d.cal>0?d.cal:''}</div>
                    <div className="nutr-bar-wrap">
                      <div className="nutr-bar-fill" style={{height:`${pct}%`,background:isToday?'var(--m-food)':onTarget?'var(--green)':'var(--amber)',opacity:isToday?1:0.7}}/>
                      {/* Target line */}
                      <div className="nutr-target-line" style={{bottom:`${(targetCal/maxCal)*100}%`}}/>
                    </div>
                    <div className="nutr-bar-label" style={{color:isToday?'var(--m-food)':'var(--text3)'}}>{d.label}</div>
                  </div>
                )
              })}
            </div>
            <div style={{fontSize:11,color:'var(--text3)',marginTop:8,display:'flex',alignItems:'center',gap:6}}>
              <div style={{width:20,height:2,background:'var(--green)',opacity:0.5}}/>
              יעד: {targetCal} קל'
            </div>
          </div>
          {/* Averages */}
          <div className="nutr-avg-grid">
            {[
              {label:'ממוצע קלוריות',val:Math.round(last7.filter(d=>d.cal>0).reduce((s,d)=>s+d.cal,0)/Math.max(last7.filter(d=>d.cal>0).length,1)),unit:"קל'",color:'var(--m-food)'},
              {label:'ימי רישום',val:last7.filter(d=>d.cal>0).length,unit:'/ 7',color:'var(--blue)'},
            ].map(s => (
              <div key={s.label} className="stat-card">
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{color:s.color}}>{s.val} <span style={{fontSize:14,fontWeight:400,color:'var(--text3)'}}>{s.unit}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ADD MEAL MODAL ───────────────────────────── */}
      {showAddMeal && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowAddMeal(false)}>
          <div className="modal-card card fade-in" style={{maxWidth:520}}>
            <div className="modal-header">
              <h3>הוסף מזון</h3>
              <button className="modal-close" onClick={()=>{setShowAddMeal(false);setFoodSearch('')}}>✕</button>
            </div>
            <div className="modal-form">
              {/* Meal type */}
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {MEALS.map(m => (
                  <button key={m} style={{flex:1,padding:'8px 4px',borderRadius:8,
                    border:`1.5px solid ${addMealType===m?'var(--m-food)':'var(--border)'}`,
                    background:addMealType===m?'rgba(245,158,11,0.1)':'transparent',
                    cursor:'pointer',fontSize:12,fontWeight:600,color:addMealType===m?'var(--m-food)':'var(--text2)'}}
                    onClick={()=>setAddMealType(m)}>{MEAL_ICONS[m]} {m}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="mfield">
                <label>חיפוש מזון</label>
                <input className="form-input" value={foodSearch} onChange={e=>setFoodSearch(e.target.value)}
                  placeholder="חפש: עוף, אורז, ביצה..." autoFocus />
              </div>

              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="nutr-search-results">
                  {searchResults.map(f => (
                    <div key={f.name} className="nutr-search-item card-hover" onClick={()=>{setFoodSearch(f.name);setCustomFood('')}}>
                      <span className="nutr-search-name">{f.name}</span>
                      <span className="nutr-search-info">{f.cal} קל' | {f.p}g חל'</span>
                      {foodSearch === f.name && <span style={{color:'var(--green)',fontSize:12}}>✓</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Amount */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div className="mfield">
                  <label>כמות (גרם)</label>
                  <input className="form-input" type="number" value={foodAmount} onChange={e=>setFoodAmount(e.target.value)} />
                </div>
                {(() => {
                  const f = FOOD_DB.find(x=>x.name===foodSearch)
                  return f ? (
                    <div className="mfield">
                      <label>קלוריות</label>
                      <div className="form-input" style={{display:'flex',alignItems:'center',color:'var(--amber)',fontWeight:700}}>
                        {Math.round(f.cal * (parseFloat(foodAmount)||100) / 100)} קל'
                      </div>
                    </div>
                  ) : null
                })()}
              </div>

              {/* Manual entry */}
              {!FOOD_DB.find(x=>x.name===foodSearch) && (
                <div>
                  <div style={{fontSize:11,color:'var(--text3)',margin:'4px 0 8px',textAlign:'center'}}>— או הזן ידנית —</div>
                  <div className="mfield">
                    <label>שם המזון</label>
                    <input className="form-input" value={customFood} onChange={e=>setCustomFood(e.target.value)} placeholder="שם המנה" />
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginTop:8}}>
                    {[{label:'קלוריות',val:customCal,set:setCustomCal},{label:'חלבון g',val:customP,set:setCustomP},{label:'פחמימות g',val:customC,set:setCustomC},{label:'שומן g',val:customF,set:setCustomF}].map(x=>(
                      <div key={x.label} className="mfield">
                        <label>{x.label}</label>
                        <input className="form-input" type="number" value={x.val} onChange={e=>x.set(e.target.value)} placeholder="0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button className="btn-ghost" onClick={()=>setShowAddMeal(false)}>ביטול</button>
                <button className="btn-gold"
                  disabled={!FOOD_DB.find(x=>x.name===foodSearch) && !customFood}
                  onClick={()=>addFoodLog(FOOD_DB.find(x=>x.name===foodSearch) || null)}>
                  + הוסף
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD SHOPPING ITEM ─────────────────────────── */}
      {showAddItem && (
        <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&setShowAddItem(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header"><h3>הוסף לרשימה</h3><button className="modal-close" onClick={()=>setShowAddItem(false)}>✕</button></div>
            <div className="modal-form">
              <div className="mfield"><label>פריט</label><input className="form-input" value={itemName} onChange={e=>setItemName(e.target.value)} placeholder="עגבניות" autoFocus /></div>
              <div className="mfield"><label>כמות</label><input className="form-input" value={itemQty} onChange={e=>setItemQty(e.target.value)} placeholder='1 ק"ג' /></div>
              <div className="mfield"><label>קטגוריה</label>
                <select className="form-input" value={itemCat} onChange={e=>setItemCat(e.target.value)}>
                  {SHOP_CATS.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={()=>setShowAddItem(false)}>ביטול</button>
                <button className="btn-gold" onClick={()=>{
                  if(!itemName) return
                  saveShopping([...shopping,{id:Date.now().toString(),name:itemName,quantity:itemQty,category:itemCat,checked:false}])
                  setItemName(''); setItemQty(''); setShowAddItem(false)
                }}>הוסף</button>
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
              <div className="mfield">
                <label>יעד קלוריות יומי</label>
                <input className="form-input" type="number" value={targetCal} onChange={e=>setTargetCal(parseInt(e.target.value)||2000)} />
              </div>
              <div className="mfield">
                <label>העדפות / אלרגיות / מגבלות</label>
                <textarea className="form-input" style={{height:80}} value={preferences} onChange={e=>setPreferences(e.target.value)} placeholder="ללא גלוטן, צמחוני..." />
              </div>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={()=>setShowPrefs(false)}>ביטול</button>
                <button className="btn-gold" onClick={()=>{
                  localStorage.setItem(`shimshon_prefs_${user.id}`, preferences)
                  localStorage.setItem(`shimshon_target_${user.id}`, String(targetCal))
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
