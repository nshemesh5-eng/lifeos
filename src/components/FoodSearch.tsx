import { useState, useEffect, useRef, useCallback } from 'react'
import './FoodSearch.css'

// ── Types ──────────────────────────────────────────────────────────────────
export interface OFFProduct {
  id: string
  name: string
  brand: string
  image: string
  thumb: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
  salt: number
  saturated_fat: number
  barcode: string
  nutriScore: string   // A B C D E
  novaGroup: number    // 1-4
  quantity: string
  ingredients: string
  labels: string[]
  countries: string
}

// ── Nutri-Score & Nova ─────────────────────────────────────────────────────
const NUTRI_COLOR: Record<string, string> = {
  A: '#038141', B: '#85BB2F', C: '#FECB02', D: '#EE8100', E: '#E63E11'
}
const NOVA_LABEL: Record<number, string> = {
  1: 'מינימלי מעובד', 2: 'מרכיבים מטבח', 3: 'מעובד', 4: 'אולטרה מעובד'
}
const NOVA_COLOR: Record<number, string> = {
  1: '#038141', 2: '#85BB2F', 3: '#EE8100', 4: '#E63E11'
}

// ── API ────────────────────────────────────────────────────────────────────
async function searchProducts(query: string, page = 1): Promise<{ products: OFFProduct[]; count: number }> {
  try {
    const res = await fetch(
      `/api/food-search?q=${encodeURIComponent(query)}&page=${page}`,
      { signal: AbortSignal.timeout(12000) }
    )
    if (!res.ok) return { products: [], count: 0 }
    const data = await res.json()
    return {
      count: data.count || data.products?.length || 0,
      products: (data.products || []) as OFFProduct[]
    }
  } catch { return { products: [], count: 0 } }
}

async function getProduct(barcode: string): Promise<OFFProduct | null> {
  try {
    const res = await fetch(`/api/food-search?barcode=${barcode}`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const data = await res.json()
    return data.product as OFFProduct || null
  } catch { return null }
}

// mapProduct now done server-side in /api/food-search.js

async function getAIRecommendation(product: OFFProduct): Promise<string> {
  try {
    const ns = product.nutriScore ? `Nutri-Score ${product.nutriScore}` : ''
    const nova = product.novaGroup ? `NOVA ${product.novaGroup} (${NOVA_LABEL[product.novaGroup] || ''})` : ''
    const prompt = `מוצר: ${product.name}${product.brand ? ' — ' + product.brand : ''}.
תזונה ל-100g: ${product.calories} קל׳ | חלבון ${product.protein}g | פחמימות ${product.carbs}g | שומן ${product.fat}g | סוכר ${product.sugar}g | סיבים ${product.fiber}g.
${ns}${ns && nova ? ' | ' : ''}${nova}${product.ingredients ? '. רכיבים: ' + product.ingredients.substring(0,150) : ''}

תן הערכה תזונתית קצרה בעברית (2-3 משפטים): האם בריא, מתי כדאי לצרוך, ומה לשים לב. ספציפי, עם מספרים.`

    const res = await fetch('/api/shimshon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', parts: [{ text: prompt }] }], systemPrompt: 'אתה תזונאי ישראלי. ענה בעברית, קצר ומדויק.' })
    })
    const data = await res.json()
    return data.text || ''
  } catch { return '' }
}

// ── Sub-components ─────────────────────────────────────────────────────────
function NutriScoreBadge({ score }: { score: string }) {
  if (!score) return null
  const grades = ['A','B','C','D','E']
  return (
    <div className="nutri-score-badge">
      <div className="nutri-score-label">Nutri-Score</div>
      <div className="nutri-score-letters">
        {grades.map(g => (
          <div key={g} className={`ns-letter ${score===g?'active':''}`}
            style={score===g ? {background: NUTRI_COLOR[g]} : {}}>
            {g}
          </div>
        ))}
      </div>
    </div>
  )
}

function MacroBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div className="macro-bar-row">
      <span className="macro-bar-label">{label}</span>
      <div className="macro-bar-track">
        <div className="macro-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="macro-bar-val">{value}g</span>
    </div>
  )
}

function ProductCard({ product, onSelect }: { product: OFFProduct; onSelect: (p: OFFProduct) => void }) {
  const [imgErr, setImgErr] = useState(false)
  return (
    <div className="food-card" onClick={() => onSelect(product)}>
      <div className="food-card-img-wrap">
        {product.thumb && !imgErr
          ? <img src={product.thumb} alt={product.name} onError={() => setImgErr(true)} loading="lazy" />
          : <div className="food-card-img-placeholder">🍽</div>
        }
        {product.nutriScore && (
          <div className="food-card-ns" style={{ background: NUTRI_COLOR[product.nutriScore] || '#aaa' }}>
            {product.nutriScore}
          </div>
        )}
        {product.novaGroup > 0 && (
          <div className="food-card-nova" style={{ background: NOVA_COLOR[product.novaGroup] || '#aaa' }}>
            N{product.novaGroup}
          </div>
        )}
      </div>
      <div className="food-card-body">
        <div className="food-card-name">{product.name}</div>
        {product.brand && <div className="food-card-brand">{product.brand}</div>}
        <div className="food-card-macros">
          <span className="food-macro-pill cal">{product.calories} קל'</span>
          <span className="food-macro-pill prot">{product.protein}g חל'</span>
          <span className="food-macro-pill carb">{product.carbs}g פח'</span>
          <span className="food-macro-pill fat">{product.fat}g שו'</span>
        </div>
      </div>
    </div>
  )
}

// ── Product Detail Modal ───────────────────────────────────────────────────
function ProductDetail({
  product, meal, onAdd, onClose
}: {
  product: OFFProduct
  meal: string
  onAdd: (p: OFFProduct, amount: number, meal: string) => void
  onClose: () => void
}) {
  const [amount, setAmount] = useState(100)
  const [aiRec, setAiRec] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [imgErr, setImgErr] = useState(false)
  const [selectedMeal, setSelectedMeal] = useState(meal)
  const MEALS = ['ארוחת בוקר','ארוחת צהריים','ארוחת ערב','חטיף']
  const MEAL_ICONS: Record<string,string> = { 'ארוחת בוקר':'🌅','ארוחת צהריים':'☀️','ארוחת ערב':'🌙','חטיף':'🍎' }

  const ratio = amount / 100
  const cal = Math.round(product.calories * ratio)
  const prot = Math.round(product.protein * ratio * 10) / 10
  const carb = Math.round(product.carbs * ratio * 10) / 10
  const fat = Math.round(product.fat * ratio * 10) / 10

  useEffect(() => {
    setAiLoading(true)
    getAIRecommendation(product).then(r => { setAiRec(r); setAiLoading(false) })
  }, [product.id])

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="food-detail-modal card fade-in">
        {/* Header */}
        <div className="food-detail-header">
          <div className="food-detail-img-wrap">
            {product.image && !imgErr
              ? <img src={product.image} alt={product.name} onError={() => setImgErr(true)} />
              : <div className="food-detail-img-ph">🍽</div>
            }
          </div>
          <div className="food-detail-title-area">
            <h2 className="food-detail-name">{product.name}</h2>
            {product.brand && <p className="food-detail-brand">{product.brand}</p>}
            {product.quantity && <p className="food-detail-qty">📦 {product.quantity}</p>}
            <div className="food-detail-badges">
              <NutriScoreBadge score={product.nutriScore} />
              {product.novaGroup > 0 && (
                <div className="nova-badge" style={{ borderColor: NOVA_COLOR[product.novaGroup] }}>
                  <span style={{ color: NOVA_COLOR[product.novaGroup], fontWeight: 700 }}>NOVA {product.novaGroup}</span>
                  <span style={{ fontSize: 10, color: 'var(--text3)' }}> · {NOVA_LABEL[product.novaGroup]}</span>
                </div>
              )}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="food-detail-body">
          {/* Amount selector */}
          <div className="food-detail-amount-section">
            <div className="food-detail-section-title">כמות</div>
            <div className="food-amount-controls">
              <button className="amount-btn" onClick={() => setAmount(a => Math.max(10, a - 10))}>−</button>
              <input className="amount-input" type="number" value={amount}
                onChange={e => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
                min="1" max="2000" />
              <span className="amount-unit">גרם</span>
              <button className="amount-btn" onClick={() => setAmount(a => a + 10)}>+</button>
            </div>
            {/* Quick amounts */}
            <div className="quick-amounts">
              {[50, 100, 150, 200, 250, 300].map(q => (
                <button key={q} className={`quick-amt-btn ${amount===q?'active':''}`} onClick={() => setAmount(q)}>
                  {q}g
                </button>
              ))}
            </div>
          </div>

          {/* Calculated macros */}
          <div className="food-detail-calc">
            <div className="calc-main">
              <div className="calc-cal">{cal}</div>
              <div className="calc-cal-label">קלוריות</div>
            </div>
            <div className="calc-macros">
              <div className="calc-macro"><span style={{color:'var(--red)'}}>{prot}g</span><span>חלבון</span></div>
              <div className="calc-macro"><span style={{color:'var(--blue)'}}>{carb}g</span><span>פחמימות</span></div>
              <div className="calc-macro"><span style={{color:'var(--green)'}}>{fat}g</span><span>שומן</span></div>
            </div>
          </div>

          {/* Full nutrition per 100g */}
          <div className="food-detail-nutrition">
            <div className="food-detail-section-title">ל-100g</div>
            <MacroBar label="חלבון" value={product.protein} max={50} color="var(--red)" />
            <MacroBar label="פחמימות" value={product.carbs} max={100} color="var(--blue)" />
            <MacroBar label="שומן" value={product.fat} max={50} color="var(--green)" />
            <MacroBar label="סוכרים" value={product.sugar} max={50} color="var(--amber)" />
            <MacroBar label="סיבים" value={product.fiber} max={20} color="#8B5CF6" />
            <MacroBar label="מלח" value={product.salt} max={5} color="#6B7280" />
            {product.saturated_fat > 0 && <MacroBar label="שומן רווי" value={product.saturated_fat} max={20} color="#EF4444" />}
          </div>

          {/* AI recommendation */}
          {(aiRec || aiLoading) && (
            <div className="food-ai-rec">
              <div className="food-detail-section-title">🤖 המלצת שמשון</div>
              {aiLoading
                ? <div className="food-ai-loading">מנתח מוצר...</div>
                : <p className="food-ai-text">{aiRec}</p>
              }
            </div>
          )}

          {/* Labels */}
          {product.labels.length > 0 && (
            <div className="food-labels">
              {product.labels.slice(0, 6).map(l => (
                <span key={l} className="food-label-tag">{l}</span>
              ))}
            </div>
          )}
        </div>

        {/* Footer — meal selector + add */}
        <div className="food-detail-footer">
          <div className="food-meal-select">
            {MEALS.map(m => (
              <button key={m} className={`food-meal-btn ${selectedMeal===m?'active':''}`}
                onClick={() => setSelectedMeal(m)}>
                {MEAL_ICONS[m]}
              </button>
            ))}
          </div>
          <button className="btn-gold food-add-btn" onClick={() => { onAdd(product, amount, selectedMeal); onClose() }}>
            + הוסף {cal} קל' לאימון {MEAL_ICONS[selectedMeal]}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main FoodSearch Component ──────────────────────────────────────────────
export default function FoodSearch({
  initialMeal = 'ארוחת בוקר',
  onAdd,
  onClose,
}: {
  initialMeal?: string
  onAdd: (product: OFFProduct, amount: number, meal: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<OFFProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [selected, setSelected] = useState<OFFProduct | null>(null)
  const [meal, setMeal] = useState(initialMeal)
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('food_recent') || '[]') } catch { return [] }
  })
  const [barcodeMode, setBarcodeMode] = useState(false)
  const [barcodeVal, setBarcodeVal] = useState('')
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const POPULAR = ['שוקולד','עוף','אורז','יוגורט','לחם','טונה','ביצים','שיבולת שועל','פיתה','גבינה']

  const doSearch = useCallback(async (q: string, p = 1) => {
    if (!q.trim()) return
    setLoading(true)
    setPage(p)
    const res = await searchProducts(q, p)
    setProducts(p === 1 ? res.products : prev => [...prev, ...res.products])
    setTotalCount(res.count)
    setLoading(false)
    // Save recent
    const newRecent = [q, ...recentSearches.filter(r => r !== q)].slice(0, 8)
    setRecentSearches(newRecent)
    localStorage.setItem('food_recent', JSON.stringify(newRecent))
  }, [recentSearches])

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleBarcode = async () => {
    if (!barcodeVal.trim()) return
    setBarcodeLoading(true)
    const p = await getProduct(barcodeVal)
    setBarcodeLoading(false)
    if (p) setSelected(p)
    else alert('מוצר לא נמצא בברקוד ' + barcodeVal)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="food-search-modal card fade-in">
        {/* Header */}
        <div className="food-search-header">
          <h2 className="food-search-title">🔍 חיפוש מוצרים</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Search bar */}
        <div className="food-search-bar-wrap">
          <div className="food-search-bar">
            <span className="food-search-icon">🔍</span>
            <input
              ref={inputRef}
              className="food-search-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="חפש מוצר — שוקולד, עוף, אורז..."
              onKeyDown={e => e.key === 'Enter' && doSearch(query)}
            />
            {query && <button className="food-search-clear" onClick={() => { setQuery(''); setProducts([]) }}>✕</button>}
            <button className="food-search-btn btn-gold" onClick={() => doSearch(query)} disabled={!query.trim() || loading}>
              {loading ? '⏳' : 'חפש'}
            </button>
          </div>
          <button className={`food-barcode-toggle ${barcodeMode?'active':''}`} onClick={() => setBarcodeMode(b => !b)}>
            📷 ברקוד
          </button>
        </div>

        {/* Barcode input */}
        {barcodeMode && (
          <div className="food-barcode-row">
            <input className="form-input" value={barcodeVal} onChange={e => setBarcodeVal(e.target.value)}
              placeholder="729010337xxx" inputMode="numeric"
              onKeyDown={e => e.key === 'Enter' && handleBarcode()} />
            <button className="btn-gold" onClick={handleBarcode} disabled={!barcodeVal || barcodeLoading}>
              {barcodeLoading ? '...' : '→'}
            </button>
          </div>
        )}

        {/* Popular / recent chips */}
        {products.length === 0 && !loading && (
          <div className="food-chips-section">
            {recentSearches.length > 0 && (
              <>
                <div className="food-chips-label">🕐 חיפושים אחרונים</div>
                <div className="food-chips">
                  {recentSearches.map(r => (
                    <button key={r} className="food-chip recent" onClick={() => { setQuery(r); doSearch(r) }}>{r}</button>
                  ))}
                </div>
              </>
            )}
            <div className="food-chips-label">🔥 פופולרי</div>
            <div className="food-chips">
              {POPULAR.map(p => (
                <button key={p} className="food-chip" onClick={() => { setQuery(p); doSearch(p) }}>{p}</button>
              ))}
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && products.length === 0 && (
          <div className="food-grid">
            {Array.from({length: 8}).map((_,i) => (
              <div key={i} className="food-card skeleton">
                <div className="food-card-img-wrap skeleton-img" />
                <div className="food-card-body">
                  <div className="skeleton-line long" />
                  <div className="skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {products.length > 0 && (
          <>
            <div className="food-results-bar">
              <span>{totalCount.toLocaleString()} תוצאות עבור "{query}"</span>
              <span style={{fontSize:11, color:'var(--text3)'}}>מאגר Open Food Facts</span>
            </div>
            <div className="food-grid">
              {products.map(p => (
                <ProductCard key={p.id + p.barcode} product={p} onSelect={setSelected} />
              ))}
            </div>
            {products.length < totalCount && (
              <button className="btn-ghost food-load-more" onClick={() => doSearch(query, page + 1)} disabled={loading}>
                {loading ? '⏳ טוען...' : `טען עוד (${totalCount - products.length} נותרו)`}
              </button>
            )}
          </>
        )}

        {/* No results */}
        {!loading && products.length === 0 && query && (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <p>לא נמצאו תוצאות עבור "{query}"</p>
            <p style={{fontSize:12, color:'var(--text3)'}}>נסה באנגלית, או חפש לפי ברקוד</p>
          </div>
        )}

        {/* Product detail */}
        {selected && (
          <ProductDetail product={selected} meal={meal} onAdd={onAdd} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  )
}
