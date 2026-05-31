import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import './Nutrition.css'

interface MealPlan {
  id: string; day: string; meal: string; food: string; calories: number; protein: number; carbs: number; fat: number
}
interface ShoppingItem {
  id: string; name: string; quantity: string; category: string; checked: boolean
}

const DAYS = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת']
const MEALS = ['ארוחת בוקר','ארוחת צהריים','ארוחת ערב','חטיף']
const SHOP_CATS = ['פירות וירקות','בשר ודגים','מוצרי חלב','לחם ודגנים','קפואים','שונות']
const CAT_COLORS: Record<string, string> = {
  'פירות וירקות': '#10B981', 'בשר ודגים': '#EF4444', 'מוצרי חלב': '#3B82F6',
  'לחם ודגנים': '#F59E0B', 'קפואים': '#8B5CF6', 'שונות': '#6B7280'
}

// All Gemini calls go through the serverless API (no CORS/allowlist issues)
async function callShimshon(prompt: string): Promise<string> {
  const res = await fetch('/api/shimshon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', parts: [{ text: prompt }] }],
      systemPrompt: 'אתה עוזר תזונה ישראלי. ענה ב-JSON בלבד, ללא markdown ולא טקסט נוסף.'
    })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `שגיאה ${res.status}`)
  }
  const data = await res.json()
  return data.text || ''
}

export default function Nutrition({ user }: { user: User }) {
  const [tab, setTab] = useState<'menu'|'shopping'>('menu')
  const [mealPlan, setMealPlan] = useState<MealPlan[]>([])
  const [shopping, setShopping] = useState<ShoppingItem[]>([])
  const [generating, setGenerating] = useState(false)
  const [genStep, setGenStep] = useState('')
  const [showAddItem, setShowAddItem] = useState(false)
  const [itemName, setItemName] = useState('')
  const [itemQty, setItemQty] = useState('')
  const [itemCat, setItemCat] = useState('שונות')
  const [preferences, setPreferences] = useState('')
  const [showPrefs, setShowPrefs] = useState(false)
  const [error, setError] = useState('')

  const today = format(new Date(), 'EEEE', { locale: he }).replace('יום ', '')
  const todayMeals = mealPlan.filter(m => m.day === today)

  useEffect(() => {
    const saved = localStorage.getItem(`shimshon_mealplan_${user.id}`)
    if (saved) try { setMealPlan(JSON.parse(saved)) } catch {}
    const savedShop = localStorage.getItem(`shimshon_shopping_${user.id}`)
    if (savedShop) try { setShopping(JSON.parse(savedShop)) } catch {}
    const savedPrefs = localStorage.getItem(`shimshon_prefs_${user.id}`)
    if (savedPrefs) setPreferences(savedPrefs)
  }, [user.id])

  const saveMP = (plan: MealPlan[]) => {
    setMealPlan(plan)
    localStorage.setItem(`shimshon_mealplan_${user.id}`, JSON.stringify(plan))
  }
  const saveShopping = (items: ShoppingItem[]) => {
    setShopping(items)
    localStorage.setItem(`shimshon_shopping_${user.id}`, JSON.stringify(items))
  }

  const generateMenu = async () => {
    setGenerating(true)
    setError('')
    try {
      // Step 1: Generate meal plan
      setGenStep('יוצר תפריט שבועי...')
      const menuPrompt = `צור תפריט שבועי בריא לאדם ישראלי.${preferences ? '\nהעדפות: ' + preferences : ''}
החזר JSON בלבד (מערך), כך:
[{"day":"ראשון","meal":"ארוחת בוקר","food":"שם המנה","calories":300,"protein":15,"carbs":40,"fat":8}]
4 ארוחות × 7 ימים = 28 רשומות. ימים: ראשון שני שלישי רביעי חמישי שישי שבת. ארוחות: ארוחת בוקר, ארוחת צהריים, ארוחת ערב, חטיף.`

      const menuText = await callShimshon(menuPrompt)
      const cleanMenu = menuText.replace(/```json|```/g, '').trim()
      const plan: MealPlan[] = JSON.parse(cleanMenu).map((m: any, i: number) => ({ ...m, id: String(i) }))
      saveMP(plan)

      // Step 2: Generate shopping list (small delay to avoid 429)
      setGenStep('יוצר רשימת קניות...')
      await new Promise(r => setTimeout(r, 2000))

      const allFoods = [...new Set(plan.map(m => m.food))].slice(0, 20).join(', ')
      const shopPrompt = `מהמאכלים: ${allFoods}
צור רשימת קניות. החזר JSON בלבד:
[{"name":"פריט","quantity":"כמות","category":"קטגוריה"}]
קטגוריות: פירות וירקות, בשר ודגים, מוצרי חלב, לחם ודגנים, קפואים, שונות. 20 פריטים.`

      const shopText = await callShimshon(shopPrompt)
      const cleanShop = shopText.replace(/```json|```/g, '').trim()
      const items: ShoppingItem[] = JSON.parse(cleanShop).map((i: any, idx: number) => ({
        ...i, id: String(idx), checked: false
      }))
      saveShopping(items)
      setGenStep('')
    } catch (e: any) {
      setError(e.message?.includes('429') ? 'יותר מדי בקשות — נסה שוב בעוד דקה' : e.message || 'שגיאה ביצירת התפריט')
      setGenStep('')
    }
    setGenerating(false)
  }

  const addItem = () => {
    if (!itemName) return
    saveShopping([...shopping, { id: Date.now().toString(), name: itemName, quantity: itemQty, category: itemCat, checked: false }])
    setItemName(''); setItemQty(''); setShowAddItem(false)
  }

  const toggleItem = (id: string) => saveShopping(shopping.map(i => i.id === id ? { ...i, checked: !i.checked } : i))
  const removeItem = (id: string) => saveShopping(shopping.filter(i => i.id !== id))
  const clearChecked = () => saveShopping(shopping.filter(i => !i.checked))

  const totalCals = todayMeals.reduce((s, m) => s + m.calories, 0)
  const unchecked = shopping.filter(i => !i.checked).length
  const grouped = SHOP_CATS.reduce((acc, cat) => {
    acc[cat] = shopping.filter(i => i.category === cat)
    return acc
  }, {} as Record<string, ShoppingItem[]>)

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{ color:'var(--m-food)' }}>🥗</span> תזונה</h1>
          <p className="module-sub">תפריט שבועי, קניות ומעקב קלוריות</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn-ghost" onClick={() => setShowPrefs(true)}>⚙️ העדפות</button>
          <button className="btn-gold" onClick={generateMenu} disabled={generating}>
            {generating ? `⏳ ${genStep}` : '✨ צור תפריט AI'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background:'var(--red-dim)', border:'1px solid var(--red)', borderRadius:10, padding:'10px 16px', marginBottom:14, color:'var(--red)', fontSize:13 }}>
          ⚠️ {error}
        </div>
      )}

      {todayMeals.length > 0 && (
        <div className="nutr-today card">
          <div className="nutr-today-title">היום — {format(new Date(), 'EEEE d בMMMM', {locale:he})}</div>
          <div className="nutr-macros">
            <div className="nutr-macro"><div className="nutr-macro-val" style={{color:'var(--amber)'}}>{totalCals}</div><div className="nutr-macro-label">קלוריות</div></div>
            <div className="nutr-macro"><div className="nutr-macro-val" style={{color:'var(--red)'}}>{todayMeals.reduce((s,m)=>s+m.protein,0)}g</div><div className="nutr-macro-label">חלבון</div></div>
            <div className="nutr-macro"><div className="nutr-macro-val" style={{color:'var(--blue)'}}>{todayMeals.reduce((s,m)=>s+m.carbs,0)}g</div><div className="nutr-macro-label">פחמימות</div></div>
            <div className="nutr-macro"><div className="nutr-macro-val" style={{color:'var(--green)'}}>{todayMeals.reduce((s,m)=>s+m.fat,0)}g</div><div className="nutr-macro-label">שומן</div></div>
          </div>
        </div>
      )}

      <div className="wo-tabs">
        <button className={`wo-tab ${tab==='menu'?'active':''}`} onClick={() => setTab('menu')}>📅 תפריט שבועי</button>
        <button className={`wo-tab ${tab==='shopping'?'active':''}`} onClick={() => setTab('shopping')}>
          🛒 קניות {unchecked > 0 && <span style={{background:'var(--m-food)',color:'#000',borderRadius:99,padding:'1px 7px',fontSize:11,fontWeight:700,marginRight:4}}>{unchecked}</span>}
        </button>
      </div>

      {tab === 'menu' && (
        mealPlan.length === 0 ? (
          <div className="tasks-empty2" style={{padding:'60px 24px'}}>
            <div style={{fontSize:48,marginBottom:16}}>🥗</div>
            <p style={{fontSize:16,fontWeight:700,marginBottom:8}}>אין תפריט עדיין</p>
            <p className="text-hint" style={{marginBottom:24}}>לחץ "צור תפריט AI" וקבל תפריט שבועי מלא עם רשימת קניות</p>
            <button className="btn-gold" onClick={generateMenu} disabled={generating}>
              {generating ? `⏳ ${genStep}` : '✨ צור תפריט שבועי'}
            </button>
          </div>
        ) : (
          <div className="nutr-week">
            {DAYS.map(day => {
              const dayMeals = mealPlan.filter(m => m.day === day)
              const dayCals = dayMeals.reduce((s,m) => s+m.calories, 0)
              const isToday = today === day
              return (
                <div key={day} className={`nutr-day card ${isToday ? 'nutr-day-today' : ''}`}>
                  <div className="nutr-day-header">
                    <span className="nutr-day-name">{isToday ? `${day} ← היום` : day}</span>
                    <span className="nutr-day-cals">{dayCals} קל'</span>
                  </div>
                  {MEALS.map(meal => {
                    const m = dayMeals.find(x => x.meal === meal)
                    return m ? (
                      <div key={meal} className="nutr-meal-row">
                        <span className="nutr-meal-type">{meal}</span>
                        <span className="nutr-meal-food">{m.food}</span>
                        <span className="nutr-meal-cal">{m.calories}</span>
                      </div>
                    ) : null
                  })}
                </div>
              )
            })}
          </div>
        )
      )}

      {tab === 'shopping' && (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
            <div style={{fontSize:13,color:'var(--text3)'}}>{shopping.filter(i=>i.checked).length}/{shopping.length} נרכש</div>
            <div style={{display:'flex',gap:8}}>
              {shopping.some(i=>i.checked) && <button className="btn-ghost" style={{fontSize:12,height:32}} onClick={clearChecked}>🗑 נקה שנרכש</button>}
              <button className="btn-ghost" style={{fontSize:12,height:32}} onClick={() => setShowAddItem(true)}>+ הוסף פריט</button>
            </div>
          </div>
          {shopping.length === 0 ? (
            <div className="tasks-empty2"><div style={{fontSize:36,marginBottom:12}}>🛒</div><p>צור תפריט AI לקבל רשימה אוטומטית.</p></div>
          ) : (
            <div className="nutr-shop-list">
              {SHOP_CATS.filter(cat => grouped[cat]?.length > 0).map(cat => (
                <div key={cat} className="nutr-shop-section">
                  <div className="nutr-shop-cat" style={{color: CAT_COLORS[cat]}}>{cat}</div>
                  {grouped[cat].map(item => (
                    <div key={item.id} className={`nutr-shop-item card ${item.checked ? 'nutr-checked' : ''}`}>
                      <button className={`task-check2 ${item.checked ? 'checked' : ''}`}
                        style={item.checked ? {background:'var(--green-dim)',borderColor:'var(--green)'} : {}}
                        onClick={() => toggleItem(item.id)}>
                        {item.checked && <span style={{color:'var(--green)'}}>✓</span>}
                      </button>
                      <div className="nutr-shop-info">
                        <span className="nutr-shop-name" style={item.checked ? {textDecoration:'line-through',color:'var(--text3)'} : {}}>{item.name}</span>
                        {item.quantity && <span className="nutr-shop-qty">{item.quantity}</span>}
                      </div>
                      <button className="task-del2" onClick={() => removeItem(item.id)}>✕</button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAddItem && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddItem(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header"><h3>הוסף לרשימה</h3><button className="modal-close" onClick={() => setShowAddItem(false)}>✕</button></div>
            <div className="modal-form">
              <div className="mfield"><label>פריט</label><input className="form-input" value={itemName} onChange={e=>setItemName(e.target.value)} placeholder="למשל: עגבניות" autoFocus /></div>
              <div className="mfield"><label>כמות</label><input className="form-input" value={itemQty} onChange={e=>setItemQty(e.target.value)} placeholder='1 ק"ג' /></div>
              <div className="mfield"><label>קטגוריה</label>
                <select className="form-input" value={itemCat} onChange={e=>setItemCat(e.target.value)}>
                  {SHOP_CATS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setShowAddItem(false)}>ביטול</button>
                <button className="btn-gold" onClick={addItem}>הוסף</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPrefs && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPrefs(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header"><h3>העדפות תזונה</h3><button className="modal-close" onClick={() => setShowPrefs(false)}>✕</button></div>
            <div className="modal-form">
              <div className="mfield">
                <label>העדפות / אלרגיות / מגבלות</label>
                <textarea className="form-input" rows={4} style={{height:'auto',padding:'10px 14px'}}
                  value={preferences} onChange={e=>setPreferences(e.target.value)}
                  placeholder="למשל: ללא גלוטן, צמחוני, לא אוהב כוסברה..." />
              </div>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setShowPrefs(false)}>ביטול</button>
                <button className="btn-gold" onClick={() => {
                  localStorage.setItem(`shimshon_prefs_${user.id}`, preferences)
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
