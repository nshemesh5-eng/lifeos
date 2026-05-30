import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns'
import { he } from 'date-fns/locale'
import './Finance.css'

interface Transaction {
  id: string; user_id: string; type: 'income'|'expense'
  amount: number; description: string; category: string
  date: string; created_at: string
}

const CATS: Record<string, { label: string; color: string; emoji: string }> = {
  salary:         { label: 'משכורת',    color: '#10B981', emoji: '💰' },
  freelance:      { label: 'פרילנס',    color: '#10B981', emoji: '💻' },
  food:           { label: 'אוכל',      color: '#F59E0B', emoji: '🍔' },
  transport:      { label: 'תחבורה',    color: '#3B82F6', emoji: '🚗' },
  housing:        { label: 'דיור',      color: '#8B5CF6', emoji: '🏠' },
  entertainment:  { label: 'בידור',     color: '#EF4444', emoji: '🎬' },
  health:         { label: 'בריאות',    color: '#10B981', emoji: '💊' },
  subscriptions:  { label: 'מנויים',    color: '#8B5CF6', emoji: '📱' },
  other:          { label: 'אחר',       color: '#6B7280', emoji: '📦' },
}

const EXPENSE_CATS = ['food','transport','housing','entertainment','health','subscriptions','other']
const INCOME_CATS  = ['salary','freelance','other']

function useTx(userId: string) {
  const [txs, setTxs] = useState<Transaction[]>([])
  const fetch = useCallback(async () => {
    const { data } = await supabase.from('transactions').select('*')
      .eq('user_id', userId).order('date', { ascending: false }).limit(500)
    setTxs(data || [])
  }, [userId])
  useEffect(() => { fetch() }, [fetch])
  const add = async (tx: Omit<Transaction,'id'|'user_id'|'created_at'>) => {
    const { data, error } = await supabase.from('transactions').insert({ ...tx, user_id: userId }).select().single()
    if (!error && data) setTxs(p => [data, ...p])
  }
  const remove = async (id: string) => {
    await supabase.from('transactions').delete().eq('id', id)
    setTxs(p => p.filter(t => t.id !== id))
  }
  return { txs, add, remove, refresh: fetch }
}

export default function Finance({ user }: { user: User }) {
  const { txs, add, remove } = useTx(user.id)
  const [showAdd, setShowAdd] = useState(false)
  const [type, setType] = useState<'income'|'expense'>('expense')
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [cat, setCat] = useState('food')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'overview'|'history'>('overview')

  const now = new Date()
  const ms = startOfMonth(now), me = endOfMonth(now)
  const thisMonth = txs.filter(t => isWithinInterval(new Date(t.date), { start: ms, end: me }))
  const income = thisMonth.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses = thisMonth.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const balance = income - expenses
  const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0

  const expByCat: Record<string, number> = {}
  thisMonth.filter(t => t.type === 'expense').forEach(t => {
    expByCat[t.category] = (expByCat[t.category] || 0) + t.amount
  })
  const topCats = Object.entries(expByCat).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // 6-month trend
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(now, 5 - i)
    const ms2 = startOfMonth(d), me2 = endOfMonth(d)
    const m = txs.filter(t => isWithinInterval(new Date(t.date), { start: ms2, end: me2 }))
    return {
      label: format(d, 'MMM', { locale: he }),
      inc: m.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      exp: m.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    }
  })
  const maxVal = Math.max(...months.flatMap(m => [m.inc, m.exp]), 1)

  const fmt = (n: number) => '₪' + Math.abs(Math.round(n)).toLocaleString('he-IL')

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || parseFloat(amount) <= 0) return
    setSaving(true)
    await add({ type, amount: parseFloat(amount), description: desc, category: cat, date })
    setSaving(false)
    setShowAdd(false)
    setAmount(''); setDesc('')
  }

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{ color: 'var(--m-finance)' }}>₪</span> פיננסים</h1>
          <p className="module-sub">{format(now, 'MMMM yyyy', { locale: he })}</p>
        </div>
        <button className="btn-gold" onClick={() => setShowAdd(true)}>+ עסקה</button>
      </div>

      {/* Hero balance */}
      <div className="fin-hero">
        <div className="fin-hero-main card">
          <div className="fin-hero-label">מאזן חודשי</div>
          <div className={`fin-hero-value ${balance >= 0 ? 'text-green' : 'text-red'}`}>
            {balance >= 0 ? '+' : ''}{fmt(balance)}
          </div>
          <div className="fin-hero-rate">
            {savingsRate >= 0 ? `חסכת ${savingsRate}% מההכנסות` : `חריגה של ${Math.abs(savingsRate)}%`}
          </div>
          <div className="fin-hero-bar">
            <div className="fin-hero-bar-fill" style={{ width: `${Math.min(100,(expenses/Math.max(income,1))*100)}%`, background: balance >= 0 ? 'var(--m-finance)' : 'var(--red)' }} />
          </div>
        </div>
        <div className="fin-hero-stats">
          <div className="fin-stat card">
            <div className="fin-stat-label">הכנסות</div>
            <div className="fin-stat-value text-green">{fmt(income)}</div>
            <div className="fin-stat-count">{thisMonth.filter(t => t.type==='income').length} עסקאות</div>
          </div>
          <div className="fin-stat card">
            <div className="fin-stat-label">הוצאות</div>
            <div className="fin-stat-value text-red">{fmt(expenses)}</div>
            <div className="fin-stat-count">{thisMonth.filter(t => t.type==='expense').length} עסקאות</div>
          </div>
        </div>
      </div>

      {/* Chart + breakdown */}
      <div className="fin-grid">
        {/* Bar chart */}
        <div className="card fin-chart">
          <div className="fin-chart-title">6 חודשים</div>
          <div className="fin-chart-legend">
            <span><span className="fin-legend-dot" style={{ background: 'var(--m-finance)' }} />הכנסות</span>
            <span><span className="fin-legend-dot" style={{ background: 'var(--red)' }} />הוצאות</span>
          </div>
          <div className="fin-bars">
            {months.map((m, i) => (
              <div key={i} className="fin-bar-group">
                <div className="fin-bar-pair">
                  <div className="fin-bar fin-bar-inc" style={{ height: `${(m.inc/maxVal)*120}px` }} title={fmt(m.inc)} />
                  <div className="fin-bar fin-bar-exp" style={{ height: `${(m.exp/maxVal)*120}px` }} title={fmt(m.exp)} />
                </div>
                <div className="fin-bar-label">{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Category breakdown */}
        <div className="card fin-breakdown">
          <div className="fin-chart-title">הוצאות לפי קטגוריה</div>
          {topCats.length === 0 && <p className="text-hint" style={{ fontSize: 13, marginTop: 16 }}>אין הוצאות החודש</p>}
          {topCats.map(([c, amt]) => {
            const info = CATS[c] || CATS.other
            const pct = expenses > 0 ? Math.round((amt / expenses) * 100) : 0
            return (
              <div key={c} className="fin-cat-row">
                <span className="fin-cat-emoji">{info.emoji}</span>
                <div className="fin-cat-info">
                  <div className="fin-cat-top">
                    <span className="fin-cat-name">{info.label}</span>
                    <span className="fin-cat-amt">{fmt(amt)}</span>
                  </div>
                  <div className="fin-cat-bar-bg">
                    <div className="fin-cat-bar-fill" style={{ width: `${pct}%`, background: info.color }} />
                  </div>
                </div>
                <span className="fin-cat-pct">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Transactions */}
      <div className="fin-tx-section">
        <div className="fin-tx-header">
          <div className="fin-tx-tabs">
            <button className={`fin-tab ${view==='overview'?'active':''}`} onClick={()=>setView('overview')}>החודש</button>
            <button className={`fin-tab ${view==='history'?'active':''}`} onClick={()=>setView('history')}>היסטוריה</button>
          </div>
        </div>
        <div className="fin-tx-list card">
          {(view === 'overview' ? thisMonth : txs).slice(0, 30).map(tx => {
            const info = CATS[tx.category] || CATS.other
            return (
              <div key={tx.id} className="fin-tx-row">
                <span className="fin-tx-emoji">{info.emoji}</span>
                <div className="fin-tx-info">
                  <div className="fin-tx-desc">{tx.description}</div>
                  <div className="fin-tx-meta">{info.label} · {tx.date}</div>
                </div>
                <span className={`fin-tx-amt ${tx.type==='income'?'text-green':'text-red'}`}>
                  {tx.type==='income'?'+':'-'}{fmt(tx.amount)}
                </span>
                <button className="fin-tx-del" onClick={() => remove(tx.id)}>✕</button>
              </div>
            )
          })}
          {txs.length === 0 && <p className="text-hint" style={{ padding: 24, textAlign: 'center', fontSize: 14 }}>אין עסקאות עדיין. הוסף את הראשונה.</p>}
        </div>
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header">
              <h3>הוסף עסקה</h3>
              <button className="modal-close" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div className="modal-type-toggle">
              <button className={type==='expense'?'active-exp':''} onClick={()=>{setType('expense');setCat('food')}}>הוצאה</button>
              <button className={type==='income'?'active-inc':''} onClick={()=>{setType('income');setCat('salary')}}>הכנסה</button>
            </div>
            <form onSubmit={handleAdd} className="modal-form">
              <div className="mfield"><label>סכום ₪</label><input className="form-input" type="number" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" required /></div>
              <div className="mfield"><label>תיאור</label><input className="form-input" type="text" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="למשל: סופרמרקול..." required /></div>
              <div className="mfield"><label>קטגוריה</label>
                <select className="form-input" value={cat} onChange={e=>setCat(e.target.value)}>
                  {(type==='income'?INCOME_CATS:EXPENSE_CATS).map(c=><option key={c} value={c}>{CATS[c]?.emoji} {CATS[c]?.label}</option>)}
                </select>
              </div>
              <div className="mfield"><label>תאריך</label><input className="form-input" type="date" value={date} onChange={e=>setDate(e.target.value)} /></div>
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={()=>setShowAdd(false)}>ביטול</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving?'...':'הוסף'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
