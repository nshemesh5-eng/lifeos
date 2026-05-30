import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns'
import { he } from 'date-fns/locale'
import './Finance.css'

interface Transaction {
  id: string; type: 'income'|'expense'; amount: number
  description: string; category: string; date: string; created_at: string
}
interface RecurringTx {
  id: string; type: 'income'|'expense'; amount: number
  description: string; category: string; day_of_month: number; active: boolean
}

const CATS = {
  income: [
    { id:'salary',    label:'משכורת',   color:'#10B981', emoji:'💰' },
    { id:'freelance', label:'פרילנס',   color:'#34D399', emoji:'💻' },
    { id:'invest_in', label:'השקעות',   color:'#9F7AFF', emoji:'📈' },
    { id:'other_in',  label:'אחר',      color:'#6B7280', emoji:'📦' },
  ],
  expense: [
    { id:'food',         label:'אוכל',      color:'#F59E0B', emoji:'🍔' },
    { id:'transport',    label:'תחבורה',    color:'#3B82F6', emoji:'🚗' },
    { id:'housing',      label:'דיור',      color:'#8B5CF6', emoji:'🏠' },
    { id:'entertainment',label:'בידור',     color:'#EF4444', emoji:'🎬' },
    { id:'health',       label:'בריאות',    color:'#10B981', emoji:'💊' },
    { id:'clothing',     label:'ביגוד',     color:'#F97316', emoji:'👕' },
    { id:'subscriptions',label:'מנויים',   color:'#7C3AED', emoji:'📱' },
    { id:'education',    label:'חינוך',    color:'#0EA5E9', emoji:'📚' },
    { id:'other',        label:'אחר',      color:'#6B7280', emoji:'📦' },
  ]
}

const ALL_CATS = [...CATS.income, ...CATS.expense]
const getCat = (id: string) => ALL_CATS.find(c => c.id === id) || { id, label: id, color: '#6B7280', emoji: '📦' }

export default function Finance({ user }: { user: User }) {
  const [txs, setTxs] = useState<Transaction[]>([])
  const [recurring, setRecurring] = useState<RecurringTx[]>([])
  const [tab, setTab] = useState<'overview'|'transactions'|'recurring'>('overview')
  const [showAdd, setShowAdd] = useState(false)
  const [showAddRec, setShowAddRec] = useState(false)
  const [type, setType] = useState<'income'|'expense'>('expense')
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [cat, setCat] = useState('food')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [saving, setSaving] = useState(false)
  const [recDay, setRecDay] = useState(1)
  const [filterMonth, setFilterMonth] = useState(0) // 0 = this month

  const now = new Date()

  const load = useCallback(async () => {
    const { data: t } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(500)
    const { data: r } = await supabase.from('recurring_transactions').select('*').eq('user_id', user.id)
    setTxs(t || [])
    setRecurring(r || [])
  }, [user.id])

  useEffect(() => { load() }, [load])

  // Apply recurring for current month
  useEffect(() => {
    if (txs.length === 0 || recurring.length === 0) return
    const today = new Date()
    const todayNum = today.getDate()
    const monthStr = format(today, 'yyyy-MM')

    recurring.filter(r => r.active && r.day_of_month <= todayNum).forEach(async r => {
      const dateStr = `${monthStr}-${String(r.day_of_month).padStart(2, '0')}`
      const exists = txs.some(t => t.description === r.description && t.date === dateStr && Math.abs(t.amount - r.amount) < 0.01)
      if (!exists) {
        const { data } = await supabase.from('transactions').insert({
          user_id: user.id, type: r.type, amount: r.amount,
          description: r.description, category: r.category, date: dateStr
        }).select().single()
        if (data) setTxs(p => [data, ...p])
      }
    })
  }, [recurring.length, txs.length])

  const selectedMonth = subMonths(now, filterMonth)
  const ms = startOfMonth(selectedMonth), me = endOfMonth(selectedMonth)
  const monthTxs = txs.filter(t => isWithinInterval(new Date(t.date), { start: ms, end: me }))

  const income = monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses = monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const balance = income - expenses
  const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0

  // 6-month trend
  const months6 = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(now, 5 - i)
    const ms2 = startOfMonth(d), me2 = endOfMonth(d)
    const m = txs.filter(t => isWithinInterval(new Date(t.date), { start: ms2, end: me2 }))
    return {
      label: format(d, 'MMM', { locale: he }),
      inc: m.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      exp: m.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    }
  })
  const maxVal = Math.max(...months6.flatMap(m => [m.inc, m.exp]), 1)

  // Category breakdown
  const expByCat: Record<string, number> = {}
  monthTxs.filter(t => t.type === 'expense').forEach(t => {
    expByCat[t.category] = (expByCat[t.category] || 0) + t.amount
  })
  const topCats = Object.entries(expByCat).sort((a, b) => b[1] - a[1])

  const fmt = (n: number) => '₪' + Math.abs(Math.round(n)).toLocaleString('he-IL')

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || parseFloat(amount) <= 0) return
    setSaving(true)
    const { data, error } = await supabase.from('transactions').insert({
      user_id: user.id, type, amount: parseFloat(amount), description: desc, category: cat, date
    }).select().single()
    if (!error && data) setTxs(p => [data, ...p])
    setSaving(false); setShowAdd(false); setAmount(''); setDesc('')
  }

  const handleAddRec = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || !desc) return
    setSaving(true)
    const { data, error } = await supabase.from('recurring_transactions').insert({
      user_id: user.id, type, amount: parseFloat(amount), description: desc, category: cat, day_of_month: recDay, active: true
    }).select().single()
    if (!error && data) setRecurring(p => [...p, data])
    setSaving(false); setShowAddRec(false); setAmount(''); setDesc('')
  }

  const removeTx = async (id: string) => {
    await supabase.from('transactions').delete().eq('id', id)
    setTxs(p => p.filter(t => t.id !== id))
  }

  const toggleRec = async (id: string, active: boolean) => {
    await supabase.from('recurring_transactions').update({ active: !active }).eq('id', id)
    setRecurring(p => p.map(r => r.id === id ? { ...r, active: !active } : r))
  }
  const removeRec = async (id: string) => {
    await supabase.from('recurring_transactions').delete().eq('id', id)
    setRecurring(p => p.filter(r => r.id !== id))
  }

  const recIncome = recurring.filter(r => r.active && r.type === 'income').reduce((s, r) => s + r.amount, 0)
  const recExpenses = recurring.filter(r => r.active && r.type === 'expense').reduce((s, r) => s + r.amount, 0)

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{ color: 'var(--m-finance)' }}>₪</span> פיננסים</h1>
          <p className="module-sub">{format(selectedMonth, 'MMMM yyyy', { locale: he })}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={() => setShowAddRec(true)}>🔄 קבע</button>
          <button className="btn-gold" onClick={() => setShowAdd(true)}>+ עסקה</button>
        </div>
      </div>

      {/* Hero */}
      <div className="fin-hero">
        <div className="fin-hero-main card">
          <div className="fin-hero-label">מאזן</div>
          <div className={`fin-hero-value ${balance >= 0 ? 'text-green' : 'text-red'}`}>
            {balance >= 0 ? '+' : ''}{fmt(balance)}
          </div>
          <div className="fin-hero-sub" style={{ color: balance >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {balance >= 0 ? `חסכת ${savingsRate}% מההכנסות` : `חריגה של ${Math.abs(savingsRate)}%`}
          </div>
          {/* Month nav */}
          <div className="fin-month-nav">
            <button className="btn-ghost" style={{ height:28, fontSize:12 }} onClick={() => setFilterMonth(p => p + 1)}>← קודם</button>
            <span style={{ fontSize:12, color:'var(--text3)' }}>{format(selectedMonth, 'MMM yy', { locale: he })}</span>
            <button className="btn-ghost" style={{ height:28, fontSize:12 }} disabled={filterMonth === 0} onClick={() => setFilterMonth(p => Math.max(0, p - 1))}>הבא →</button>
          </div>
        </div>
        <div className="fin-hero-stats">
          <div className="fin-stat card">
            <div className="fin-stat-label">הכנסות</div>
            <div className="fin-stat-value text-green">{fmt(income)}</div>
            <div className="fin-stat-count">{monthTxs.filter(t => t.type==='income').length} עסקאות</div>
          </div>
          <div className="fin-stat card">
            <div className="fin-stat-label">הוצאות</div>
            <div className="fin-stat-value text-red">{fmt(expenses)}</div>
            <div className="fin-stat-count">{monthTxs.filter(t => t.type==='expense').length} עסקאות</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="fin-tabs-row">
        {(['overview','transactions','recurring'] as const).map(t => (
          <button key={t} className={`fin-tab ${tab===t?'active':''}`} onClick={() => setTab(t)}>
            {t==='overview' ? '📊 סקירה' : t==='transactions' ? '📋 עסקאות' : '🔄 הוראות קבע'}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <div className="fin-overview-grid">
          {/* Bar chart */}
          <div className="card fin-chart">
            <div className="fin-chart-title">מגמה — 6 חודשים</div>
            <div className="fin-chart-legend">
              <span><span className="fin-legend-dot" style={{ background:'var(--m-finance)' }}/>הכנסות</span>
              <span><span className="fin-legend-dot" style={{ background:'var(--red)' }}/>הוצאות</span>
            </div>
            <div className="fin-bars">
              {months6.map((m, i) => (
                <div key={i} className="fin-bar-group">
                  <div className="fin-bar-pair">
                    <div className="fin-bar fin-bar-inc" style={{ height:`${Math.max(4,(m.inc/maxVal)*140)}px` }} title={fmt(m.inc)} />
                    <div className="fin-bar fin-bar-exp" style={{ height:`${Math.max(4,(m.exp/maxVal)*140)}px` }} title={fmt(m.exp)} />
                  </div>
                  <div className="fin-bar-label">{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Category breakdown */}
          <div className="card fin-breakdown">
            <div className="fin-chart-title">הוצאות לפי קטגוריה</div>
            {topCats.length === 0 && <p className="text-hint" style={{ fontSize:13, marginTop:12 }}>אין הוצאות החודש</p>}
            {topCats.map(([cid, amt]) => {
              const c = getCat(cid)
              const pct = expenses > 0 ? Math.round((amt/expenses)*100) : 0
              return (
                <div key={cid} className="fin-cat-row">
                  <span className="fin-cat-emoji">{c.emoji}</span>
                  <div className="fin-cat-info">
                    <div className="fin-cat-top">
                      <span className="fin-cat-name">{c.label}</span>
                      <span className="fin-cat-amt">{fmt(amt)}</span>
                    </div>
                    <div className="fin-cat-bar-bg">
                      <div className="fin-cat-bar-fill" style={{ width:`${pct}%`, background:c.color }} />
                    </div>
                  </div>
                  <span className="fin-cat-pct">{pct}%</span>
                </div>
              )
            })}
          </div>

          {/* Savings insight */}
          <div className="card fin-insight">
            <div className="fin-chart-title">💡 תובנות</div>
            <div className="fin-insight-row">
              <span>שיעור חיסכון</span>
              <span style={{ color: savingsRate >= 20 ? 'var(--green)' : savingsRate >= 0 ? 'var(--amber)' : 'var(--red)', fontWeight: 800 }}>
                {savingsRate}%
              </span>
            </div>
            <div className="fin-insight-bar">
              <div className="fin-insight-fill" style={{
                width: `${Math.max(0, Math.min(100, savingsRate))}%`,
                background: savingsRate >= 20 ? 'var(--green)' : savingsRate >= 0 ? 'var(--amber)' : 'var(--red)'
              }} />
            </div>
            <p style={{ fontSize:12, color:'var(--text3)', marginTop:8 }}>
              {savingsRate >= 20 ? '✅ חיסכון מצוין! יעד מומלץ: 20%+' :
               savingsRate >= 10 ? '⚡ חיסכון סביר. נסה להגיע ל-20%' :
               savingsRate >= 0 ? '⚠️ חיסכון נמוך. שקול לצמצם הוצאות' :
               '🔴 הוצאות עולות על הכנסות החודש'}
            </p>

            {topCats[0] && (
              <div style={{ marginTop:16, padding:'12px 0', borderTop:'0.5px solid var(--border)' }}>
                <div style={{ fontSize:12, color:'var(--text3)', marginBottom:6 }}>הוצאה הגדולה ביותר:</div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:14, fontWeight:600 }}>{getCat(topCats[0][0]).emoji} {getCat(topCats[0][0]).label}</span>
                  <span style={{ fontSize:16, fontWeight:800, color:'var(--red)' }}>{fmt(topCats[0][1])}</span>
                </div>
              </div>
            )}

            <div style={{ marginTop:12, padding:'12px 0', borderTop:'0.5px solid var(--border)' }}>
              <div style={{ fontSize:12, color:'var(--text3)', marginBottom:6 }}>הוראות קבע פעילות:</div>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span style={{ fontSize:13, color:'var(--green)' }}>הכנסות: {fmt(recIncome)}</span>
                <span style={{ fontSize:13, color:'var(--red)' }}>הוצאות: {fmt(recExpenses)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TRANSACTIONS */}
      {tab === 'transactions' && (
        <div>
          <div className="fin-tx-list card">
            {monthTxs.length === 0 && (
              <p className="text-hint" style={{ padding:32, textAlign:'center', fontSize:14 }}>
                אין עסקאות ב{format(selectedMonth,'MMMM',{locale:he})}
              </p>
            )}
            {monthTxs.map(tx => {
              const c = getCat(tx.category)
              return (
                <div key={tx.id} className="fin-tx-row">
                  <span className="fin-tx-emoji">{c.emoji}</span>
                  <div className="fin-tx-info">
                    <div className="fin-tx-desc">{tx.description}</div>
                    <div className="fin-tx-meta">{c.label} · {tx.date}</div>
                  </div>
                  <span className={`fin-tx-amt ${tx.type==='income'?'text-green':'text-red'}`}>
                    {tx.type==='income'?'+':'-'}{fmt(tx.amount)}
                  </span>
                  <button className="fin-tx-del" onClick={() => removeTx(tx.id)}>✕</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* RECURRING */}
      {tab === 'recurring' && (
        <div>
          <div className="fin-rec-summary">
            <div className="fin-stat card">
              <div className="fin-stat-label">הכנסות קבועות</div>
              <div className="fin-stat-value text-green">{fmt(recIncome)}</div>
            </div>
            <div className="fin-stat card">
              <div className="fin-stat-label">הוצאות קבועות</div>
              <div className="fin-stat-value text-red">{fmt(recExpenses)}</div>
            </div>
            <div className="fin-stat card">
              <div className="fin-stat-label">מאזן קבוע</div>
              <div className={`fin-stat-value ${recIncome-recExpenses>=0?'text-green':'text-red'}`}>
                {fmt(recIncome-recExpenses)}
              </div>
            </div>
          </div>

          <div className="fin-tx-list card">
            {recurring.length === 0 && (
              <div style={{ padding:40, textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:12 }}>🔄</div>
                <p className="text-hint" style={{ fontSize:14, marginBottom:16 }}>אין הוראות קבע עדיין</p>
                <button className="btn-gold" onClick={() => setShowAddRec(true)}>הוסף ראשונה</button>
              </div>
            )}
            {recurring.map(r => {
              const c = getCat(r.category)
              return (
                <div key={r.id} className="fin-tx-row" style={{ opacity: r.active ? 1 : 0.45 }}>
                  <span className="fin-tx-emoji">{c.emoji}</span>
                  <div className="fin-tx-info">
                    <div className="fin-tx-desc">{r.description}</div>
                    <div className="fin-tx-meta">{c.label} · יום {r.day_of_month} לחודש</div>
                  </div>
                  <span className={`fin-tx-amt ${r.type==='income'?'text-green':'text-red'}`}>
                    {r.type==='income'?'+':'-'}{fmt(r.amount)}
                  </span>
                  <button onClick={() => toggleRec(r.id, r.active)} style={{ fontSize:16, width:32, height:32, borderRadius:8, background:'var(--surface2)' }}>
                    {r.active ? '⏸' : '▶'}
                  </button>
                  <button className="fin-tx-del" onClick={() => removeRec(r.id)}>✕</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Add transaction modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header"><h3>עסקה חדשה</h3><button className="modal-close" onClick={() => setShowAdd(false)}>✕</button></div>
            <div className="modal-type-toggle">
              <button className={type==='expense'?'active-exp':''} onClick={() => { setType('expense'); setCat('food') }}>הוצאה</button>
              <button className={type==='income'?'active-inc':''} onClick={() => { setType('income'); setCat('salary') }}>הכנסה</button>
            </div>
            <form onSubmit={handleAdd} className="modal-form">
              <div className="mfield"><label>סכום ₪</label><input className="form-input" type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" required /></div>
              <div className="mfield"><label>תיאור</label><input className="form-input" type="text" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="למשל: סופר, דלק..." required /></div>
              <div className="mfield"><label>קטגוריה</label>
                <select className="form-input" value={cat} onChange={e=>setCat(e.target.value)}>
                  {(type==='income'?CATS.income:CATS.expense).map(c=><option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                </select>
              </div>
              <div className="mfield"><label>תאריך</label><input className="form-input" type="date" value={date} onChange={e=>setDate(e.target.value)} /></div>
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowAdd(false)}>ביטול</button>
                <button type="submit" className="btn-gold" disabled={saving}>{saving?'...':'הוסף'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add recurring modal */}
      {showAddRec && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAddRec(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header"><h3>הוראת קבע חדשה</h3><button className="modal-close" onClick={() => setShowAddRec(false)}>✕</button></div>
            <div className="modal-type-toggle">
              <button className={type==='expense'?'active-exp':''} onClick={() => { setType('expense'); setCat('food') }}>הוצאה</button>
              <button className={type==='income'?'active-inc':''} onClick={() => { setType('income'); setCat('salary') }}>הכנסה</button>
            </div>
            <form onSubmit={handleAddRec} className="modal-form">
              <div className="mfield"><label>תיאור</label><input className="form-input" type="text" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="משכורת, שכר דירה, נטפליקס..." required /></div>
              <div className="mfield"><label>סכום ₪</label><input className="form-input" type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" required /></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div className="mfield"><label>קטגוריה</label>
                  <select className="form-input" value={cat} onChange={e=>setCat(e.target.value)}>
                    {(type==='income'?CATS.income:CATS.expense).map(c=><option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                  </select>
                </div>
                <div className="mfield"><label>יום בחודש</label>
                  <select className="form-input" value={recDay} onChange={e=>setRecDay(parseInt(e.target.value))}>
                    {Array.from({length:28},(_,i)=>i+1).map(d=><option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowAddRec(false)}>ביטול</button>
                <button type="submit" className="btn-gold" disabled={saving}>{saving?'...':'הוסף'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
