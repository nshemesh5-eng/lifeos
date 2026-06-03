import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths, parseISO } from 'date-fns'
import { he } from 'date-fns/locale'
import './Finance.css'

// ─── Types ───────────────────────────────────────────────
interface Transaction {
  id: string; type: 'income'|'expense'; amount: number
  description: string; category: string; date: string; notes?: string; created_at: string
}
interface Budget { id: string; category: string; amount: number; month: string }
interface Goal { id: string; name: string; target: number; current: number; deadline?: string; emoji?: string }
interface RecurringTx {
  id: string; type: 'income'|'expense'; amount: number
  description: string; category: string; day_of_month: number; active: boolean
}

// ─── Categories ──────────────────────────────────────────
const CATS = {
  income: [
    { id:'salary',    label:'משכורת',    color:'#10B981', emoji:'💰' },
    { id:'freelance', label:'פרילנס',    color:'#34D399', emoji:'💻' },
    { id:'invest_in', label:'השקעות',    color:'#9F7AFF', emoji:'📈' },
    { id:'bonus',     label:'בונוס',     color:'#F5C842', emoji:'🎁' },
    { id:'other_in',  label:'אחר',       color:'#6B7280', emoji:'📦' },
  ],
  expense: [
    { id:'food',         label:'אוכל',       color:'#F59E0B', emoji:'🍔' },
    { id:'transport',    label:'תחבורה',     color:'#3B82F6', emoji:'🚗' },
    { id:'housing',      label:'דיור',       color:'#8B5CF6', emoji:'🏠' },
    { id:'entertainment',label:'בידור',      color:'#EF4444', emoji:'🎬' },
    { id:'health',       label:'בריאות',     color:'#10B981', emoji:'💊' },
    { id:'clothing',     label:'ביגוד',      color:'#F97316', emoji:'👕' },
    { id:'subscriptions',label:'מנויים',    color:'#7C3AED', emoji:'📱' },
    { id:'education',    label:'חינוך',     color:'#0EA5E9', emoji:'📚' },
    { id:'groceries',    label:'סופר',       color:'#84CC16', emoji:'🛒' },
    { id:'dining',       label:'מסעדות',    color:'#F43F5E', emoji:'🍽️' },
    { id:'insurance',    label:'ביטוח',     color:'#64748B', emoji:'🛡️' },
    { id:'utilities',    label:'חשבונות',   color:'#0891B2', emoji:'⚡' },
    { id:'other',        label:'אחר',       color:'#6B7280', emoji:'📦' },
  ]
}
const ALL_CATS = [...CATS.income, ...CATS.expense]
const getCat = (id: string) => ALL_CATS.find(c => c.id === id) || { id, label: id, color: '#6B7280', emoji: '📦' }

// ─── Mini Bar Chart ───────────────────────────────────────
function MiniBar({ data }: { data: { label: string; income: number; expense: number }[] }) {
  const max = Math.max(...data.map(d => Math.max(d.income, d.expense)), 1)
  return (
    <div className="mini-chart">
      {data.map((d, i) => (
        <div key={i} className="mini-bar-group">
          <div className="mini-bars">
            <div className="mini-bar income" style={{ height: `${(d.income / max) * 100}%` }} title={`הכנסה: ₪${d.income.toLocaleString()}`} />
            <div className="mini-bar expense" style={{ height: `${(d.expense / max) * 100}%` }} title={`הוצאה: ₪${d.expense.toLocaleString()}`} />
          </div>
          <div className="mini-label">{d.label}</div>
        </div>
      ))}
      <div className="mini-legend">
        <span><span style={{background:'var(--green)'}} />הכנסות</span>
        <span><span style={{background:'var(--red)'}} />הוצאות</span>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────
type Tab = 'overview'|'transactions'|'budgets'|'goals'|'recurring'|'import'

export default function Finance({ user }: { user: User }) {
  const [txs, setTxs] = useState<Transaction[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [recurring, setRecurring] = useState<RecurringTx[]>([])
  const [tab, setTab] = useState<Tab>('overview')
  const [periodMonths, setPeriodMonths] = useState(1)
  const [filterCat, setFilterCat] = useState('all')
  const [filterType, setFilterType] = useState<'all'|'income'|'expense'>('all')
  const [search, setSearch] = useState('')

  // Forms
  const [showAdd, setShowAdd] = useState(false)
  const [type, setType] = useState<'income'|'expense'>('expense')
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [cat, setCat] = useState('food')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // Goal form
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [gName, setGName] = useState(''); const [gTarget, setGTarget] = useState('')
  const [gCurrent, setGCurrent] = useState(''); const [gDeadline, setGDeadline] = useState('')
  const [gEmoji, setGEmoji] = useState('🎯')

  // Recurring form
  const [showRecForm, setShowRecForm] = useState(false)
  const [rType, setRType] = useState<'income'|'expense'>('expense')
  const [rAmount, setRAmount] = useState(''); const [rDesc, setRDesc] = useState('')
  const [rCat, setRCat] = useState('food'); const [rDay, setRDay] = useState(1)

  // Import
  const fileRef = useRef<HTMLInputElement>(null)
  const [importResult, setImportResult] = useState('')

  const now = new Date()

  const load = useCallback(async () => {
    const [{ data: t }, { data: b }, { data: g }, { data: r }] = await Promise.all([
      supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false }).limit(1000),
      supabase.from('budgets').select('*').eq('user_id', user.id),
      supabase.from('goals').select('*').eq('user_id', user.id),
      supabase.from('recurring_transactions').select('*').eq('user_id', user.id),
    ])
    setTxs(t || [])
    setBudgets(b || [])
    setGoals(g || [])
    setRecurring(r || [])
  }, [user.id])

  useEffect(() => { load() }, [load])

  // Auto-apply recurring
  useEffect(() => {
    if (!recurring.length) return
    const today = new Date()
    const todayNum = today.getDate()
    const monthStr = format(today, 'yyyy-MM')
    recurring.filter(r => r.active && r.day_of_month <= todayNum).forEach(async r => {
      const dateStr = `${monthStr}-${String(r.day_of_month).padStart(2, '0')}`
      const exists = txs.some(t => t.description === r.description && t.date === dateStr)
      if (!exists) {
        const { data } = await supabase.from('transactions').insert({
          user_id: user.id, type: r.type, amount: r.amount,
          description: r.description, category: r.category, date: dateStr
        }).select().single()
        if (data) setTxs(p => [data, ...p])
      }
    })
  }, [recurring.length, user.id])

  // ── Period calculations ────────────────────────────────
  const periodStart = startOfMonth(subMonths(now, periodMonths - 1))
  const periodEnd = endOfMonth(now)
  const periodTxs = txs.filter(t => isWithinInterval(parseISO(t.date), { start: periodStart, end: periodEnd }))

  const income = periodTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expenses = periodTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const balance = income - expenses
  const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0

  // ── 6-month trend data ─────────────────────────────────
  const trend6 = Array.from({ length: 6 }, (_, i) => {
    const d = subMonths(now, 5 - i)
    const ms = startOfMonth(d), me = endOfMonth(d)
    const m = txs.filter(t => isWithinInterval(parseISO(t.date), { start: ms, end: me }))
    return {
      label: format(d, 'MMM', { locale: he }),
      income: m.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      expense: m.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    }
  })

  // ── Category breakdown ─────────────────────────────────
  const catBreakdown = CATS.expense.map(c => ({
    ...c,
    total: periodTxs.filter(t => t.type === 'expense' && t.category === c.id).reduce((s, t) => s + t.amount, 0),
  })).filter(c => c.total > 0).sort((a, b) => b.total - a.total)

  // ── Filtered transactions ─────────────────────────────
  const filteredTxs = txs.filter(t => {
    if (filterType !== 'all' && t.type !== filterType) return false
    if (filterCat !== 'all' && t.category !== filterCat) return false
    if (search && !t.description.includes(search) && !t.amount.toString().includes(search)) return false
    return true
  }).slice(0, 100)

  // ── This month budget progress ─────────────────────────
  const thisMonthTxs = txs.filter(t => isWithinInterval(parseISO(t.date), { start: startOfMonth(now), end: endOfMonth(now) }))
  const monthStr = format(now, 'yyyy-MM')
  const monthBudgets = budgets.filter(b => b.month === monthStr)

  // ── Save transaction ───────────────────────────────────
  const saveTx = async () => {
    if (!amount || !desc) return
    setSaving(true)
    await supabase.from('transactions').insert({
      user_id: user.id, type, amount: parseFloat(amount),
      description: desc, category: cat, date, notes: notes || null,
    })
    setSaving(false)
    load()
    setShowAdd(false)
    setAmount(''); setDesc(''); setNotes('')
  }

  const deleteTx = async (id: string) => {
    await supabase.from('transactions').delete().eq('id', id)
    setTxs(p => p.filter(t => t.id !== id))
  }

  // ── Budget save ───────────────────────────────────────
  const saveBudget = async (catId: string, val: string) => {
    const amount = parseFloat(val)
    if (isNaN(amount)) return
    const existing = monthBudgets.find(b => b.category === catId)
    if (existing) await supabase.from('budgets').update({ amount }).eq('id', existing.id)
    else await supabase.from('budgets').insert({ user_id: user.id, category: catId, amount, month: monthStr })
    load()
  }

  // ── Goal save ─────────────────────────────────────────
  const saveGoal = async () => {
    if (!gName || !gTarget) return
    await supabase.from('goals').insert({
      user_id: user.id, name: gName, target: parseFloat(gTarget),
      current: parseFloat(gCurrent) || 0, deadline: gDeadline || null, emoji: gEmoji,
    })
    load(); setShowGoalForm(false)
    setGName(''); setGTarget(''); setGCurrent(''); setGDeadline(''); setGEmoji('🎯')
  }

  const updateGoalAmount = async (id: string, current: number) => {
    await supabase.from('goals').update({ current }).eq('id', id)
    setGoals(p => p.map(g => g.id === id ? { ...g, current } : g))
  }

  // ── Recurring save ────────────────────────────────────
  const saveRec = async () => {
    if (!rAmount || !rDesc) return
    await supabase.from('recurring_transactions').insert({
      user_id: user.id, type: rType, amount: parseFloat(rAmount),
      description: rDesc, category: rCat, day_of_month: rDay, active: true,
    })
    load(); setShowRecForm(false)
    setRAmount(''); setRDesc('')
  }

  // ── CSV Import ────────────────────────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportResult('מעבד...')
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    let imported = 0, skipped = 0
    for (const line of lines.slice(1)) { // skip header
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      if (cols.length < 3) { skipped++; continue }
      const [dateStr, descStr, amountStr, typeStr, catStr] = cols
      const amt = Math.abs(parseFloat(amountStr?.replace(/[^\d.-]/g, '') || '0'))
      if (isNaN(amt) || amt === 0) { skipped++; continue }
      const txType = typeStr?.toLowerCase().includes('income') || parseFloat(amountStr) > 0 ? 'income' : 'expense'
      // Try to parse date
      let parsedDate = dateStr
      try {
        const d = new Date(dateStr)
        if (!isNaN(d.getTime())) parsedDate = format(d, 'yyyy-MM-dd')
      } catch {}
      const { error } = await supabase.from('transactions').insert({
        user_id: user.id, type: txType, amount: amt,
        description: descStr || 'יבוא CSV', category: catStr || 'other',
        date: parsedDate || format(new Date(), 'yyyy-MM-dd'),
      })
      if (!error) imported++; else skipped++
    }
    setImportResult(`✅ יובאו ${imported} עסקאות | דולגו ${skipped}`)
    load()
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── Download example CSV ──────────────────────────────
  const downloadExample = () => {
    const BOM = '\uFEFF'
    const example = `תאריך,תיאור,סכום,סוג,קטגוריה
2026-06-01,משכורת יוני,15000,income,salary
2026-06-02,סופר יוחננוף,320,expense,groceries
2026-06-03,טדי קפה,45,expense,dining
2026-06-04,נסיעות רכבת,180,expense,transport
2026-06-05,נטפליקס,60,expense,subscriptions
2026-06-08,ארוחת צהריים,220,expense,food
2026-06-10,בונוס רבעוני,3000,income,bonus
2026-06-12,שכירות,4500,expense,housing
2026-06-15,קולנוע,90,expense,entertainment
2026-06-18,ביטוח בריאות,290,expense,insurance`
    const blob = new Blob([BOM + example], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = 'shimshon-finance-example.csv'
    a.click()
  }

  // ── Export ────────────────────────────────────────────
  const exportCSV = () => {
    const BOM = '\uFEFF'
    const header = 'תאריך,תיאור,סכום,סוג,קטגוריה\n'
    const rows = txs.map(t => `${t.date},"${t.description}",${t.amount},${t.type === 'income' ? 'הכנסה' : 'הוצאה'},${getCat(t.category).label}`).join('\n')
    const blob = new Blob([BOM + header + rows], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `shimshon-finance-${format(now, 'yyyy-MM-dd')}.csv`
    a.click()
  }

  const tabs: { key: Tab; label: string; emoji: string }[] = [
    { key: 'overview', label: 'סקירה', emoji: '📊' },
    { key: 'transactions', label: 'עסקאות', emoji: '📋' },
    { key: 'budgets', label: 'תקציבים', emoji: '🎯' },
    { key: 'goals', label: 'יעדים', emoji: '🏆' },
    { key: 'recurring', label: 'קבועות', emoji: '🔄' },
    { key: 'import', label: 'ייבוא/ייצוא', emoji: '📁' },
  ]

  return (
    <div className="module-page fade-in">
      {/* Header */}
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{ color: 'var(--m-finance)' }}>₪</span> פיננסים</h1>
          <p className="module-sub">{format(now, 'MMMM yyyy', { locale: he })}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="form-input" style={{ height: 36, width: 'auto', fontSize: 13, padding: '0 10px' }}
            value={periodMonths} onChange={e => setPeriodMonths(Number(e.target.value))}>
            <option value={1}>חודש אחרון</option>
            <option value={3}>3 חודשים</option>
            <option value={6}>6 חודשים</option>
            <option value={12}>שנה</option>
          </select>
          <button className="btn-gold" onClick={() => setShowAdd(true)}>+ עסקה</button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="fin-kpi-strip">
        <div className="fin-kpi">
          <div className="fin-kpi-label">הכנסות</div>
          <div className="fin-kpi-val" style={{ color: 'var(--green)' }}>₪{income.toLocaleString()}</div>
        </div>
        <div className="fin-kpi">
          <div className="fin-kpi-label">הוצאות</div>
          <div className="fin-kpi-val" style={{ color: 'var(--red)' }}>₪{expenses.toLocaleString()}</div>
        </div>
        <div className="fin-kpi">
          <div className="fin-kpi-label">מאזן</div>
          <div className="fin-kpi-val" style={{ color: balance >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {balance >= 0 ? '+' : ''}₪{balance.toLocaleString()}
          </div>
        </div>
        <div className="fin-kpi">
          <div className="fin-kpi-label">חיסכון</div>
          <div className="fin-kpi-val" style={{ color: savingsRate >= 20 ? 'var(--green)' : savingsRate >= 0 ? 'var(--amber)' : 'var(--red)' }}>
            {savingsRate}%
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="fin-tabs-row">
        {tabs.map(t => (
          <button key={t.key} className={`fin-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <span>{t.emoji}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ──────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="fin-overview">
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ marginBottom: 16, fontSize: 15 }}>מגמה 6 חודשים</h3>
            <MiniBar data={trend6} />
          </div>
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ marginBottom: 12, fontSize: 15 }}>פירוט הוצאות</h3>
            {catBreakdown.length === 0 ? <p style={{ color: 'var(--text3)', fontSize: 13 }}>אין נתונים</p> :
              catBreakdown.slice(0, 8).map(c => {
                const pct = expenses > 0 ? (c.total / expenses) * 100 : 0
                return (
                  <div key={c.id} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span>{c.emoji} {c.label}</span>
                      <span style={{ fontWeight: 600 }}>₪{c.total.toLocaleString()} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>({pct.toFixed(0)}%)</span></span>
                    </div>
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: c.color, borderRadius: 3, transition: 'width .4s' }} />
                    </div>
                  </div>
                )
              })
            }
          </div>
          <div className="card" style={{ padding: 20, gridColumn: '1/-1' }}>
            <h3 style={{ marginBottom: 12, fontSize: 15 }}>עסקאות אחרונות</h3>
            {txs.slice(0, 8).map(t => {
              const c = getCat(t.category)
              return (
                <div key={t.id} className="tx-row">
                  <span className="tx-emoji">{c.emoji}</span>
                  <div className="tx-info">
                    <div className="tx-desc">{t.description}</div>
                    <div className="tx-meta">{format(parseISO(t.date), 'd MMM', { locale: he })} · {c.label}</div>
                  </div>
                  <div className={`tx-amount ${t.type}`}>
                    {t.type === 'expense' ? '-' : '+'}₪{t.amount.toLocaleString()}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Transactions ──────────────────────────────────── */}
      {tab === 'transactions' && (
        <div>
          <div className="fin-filters">
            <input className="form-input" style={{ flex: 1, height: 36 }} placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} />
            <select className="form-input" style={{ height: 36, width: 'auto', padding: '0 8px', fontSize: 13 }}
              value={filterType} onChange={e => setFilterType(e.target.value as any)}>
              <option value="all">הכל</option>
              <option value="income">הכנסות</option>
              <option value="expense">הוצאות</option>
            </select>
            <select className="form-input" style={{ height: 36, width: 'auto', padding: '0 8px', fontSize: 13 }}
              value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="all">כל קטגוריות</option>
              {ALL_CATS.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
            <button className="btn-ghost" style={{ height: 36, fontSize: 12 }} onClick={exportCSV}>⬇️ ייצוא CSV</button>
          </div>
          <div className="tx-list">
            {filteredTxs.length === 0 ? (
              <div className="tasks-empty2"><p>אין עסקאות</p></div>
            ) : filteredTxs.map(t => {
              const c = getCat(t.category)
              return (
                <div key={t.id} className="tx-row card" style={{ marginBottom: 6 }}>
                  <span className="tx-emoji">{c.emoji}</span>
                  <div className="tx-info">
                    <div className="tx-desc">{t.description}</div>
                    <div className="tx-meta">{format(parseISO(t.date), 'd MMM yyyy', { locale: he })} · {c.label}{t.notes ? ` · ${t.notes}` : ''}</div>
                  </div>
                  <div className={`tx-amount ${t.type}`}>
                    {t.type === 'expense' ? '-' : '+'}₪{t.amount.toLocaleString()}
                  </div>
                  <button className="sel-del" onClick={() => deleteTx(t.id)} style={{ marginRight: 8 }}>✕</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Budgets ────────────────────────────────────────── */}
      {tab === 'budgets' && (
        <div>
          <div className="card" style={{ padding: 16, marginBottom: 16, fontSize: 13, color: 'var(--text3)' }}>
            הגדר תקציב חודשי לכל קטגוריה ועקוב אחרי ההוצאות בזמן אמת
          </div>
          <div className="budgets-grid">
            {CATS.expense.map(c => {
              const spent = thisMonthTxs.filter(t => t.type === 'expense' && t.category === c.id).reduce((s, t) => s + t.amount, 0)
              const budget = monthBudgets.find(b => b.category === c.id)?.amount || 0
              const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0
              const over = budget > 0 && spent > budget
              return (
                <div key={c.id} className="budget-card card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600 }}>{c.emoji} {c.label}</span>
                    <span style={{ fontSize: 12, color: over ? 'var(--red)' : 'var(--text3)' }}>
                      ₪{spent.toLocaleString()} / {budget > 0 ? `₪${budget.toLocaleString()}` : '--'}
                    </span>
                  </div>
                  {budget > 0 && (
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: over ? 'var(--red)' : c.color, borderRadius: 3, transition: 'width .4s' }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="form-input" type="number" placeholder="תקציב ₪" defaultValue={budget || ''}
                      style={{ flex: 1, height: 32, fontSize: 13 }}
                      onBlur={e => saveBudget(c.id, e.target.value)} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Goals ──────────────────────────────────────────── */}
      {tab === 'goals' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn-gold" onClick={() => setShowGoalForm(true)}>+ יעד חדש</button>
          </div>
          {goals.length === 0 ? (
            <div className="tasks-empty2"><div style={{ fontSize: 40 }}>🏆</div><p>אין יעדים. הוסף יעד כספי ועקוב אחרי ההתקדמות!</p></div>
          ) : (
            <div className="goals-grid">
              {goals.map(g => {
                const pct = Math.min((g.current / g.target) * 100, 100)
                const remaining = g.target - g.current
                return (
                  <div key={g.id} className="goal-card card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: 28 }}>{g.emoji || '🎯'}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{g.name}</div>
                        {g.deadline && <div style={{ fontSize: 11, color: 'var(--text3)' }}>יעד: {format(new Date(g.deadline), 'd/M/yyyy')}</div>}
                      </div>
                    </div>
                    <div style={{ height: 10, background: 'var(--border)', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--amber)', borderRadius: 6, transition: 'width .6s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 10 }}>
                      <span style={{ color: 'var(--green)', fontWeight: 600 }}>₪{g.current.toLocaleString()}</span>
                      <span style={{ color: 'var(--text3)' }}>{pct.toFixed(0)}% מתוך ₪{g.target.toLocaleString()}</span>
                    </div>
                    {remaining > 0 && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>נשאר: ₪{remaining.toLocaleString()}</div>}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className="form-input" type="number" placeholder="עדכן סכום נוכחי"
                        style={{ flex: 1, height: 32, fontSize: 13 }} defaultValue={g.current}
                        onBlur={e => updateGoalAmount(g.id, parseFloat(e.target.value) || 0)} />
                      <button className="btn-ghost" style={{ color: 'var(--red)', height: 32, fontSize: 12 }}
                        onClick={async () => { await supabase.from('goals').delete().eq('id', g.id); load() }}>✕</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Recurring ──────────────────────────────────────── */}
      {tab === 'recurring' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn-gold" onClick={() => setShowRecForm(true)}>+ הוראת קבע</button>
          </div>
          {recurring.length === 0 ? (
            <div className="tasks-empty2"><div style={{ fontSize: 40 }}>🔄</div><p>אין הוראות קבע. הוסף הכנסות/הוצאות חוזרות שנכנסות לבד כל חודש.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recurring.map(r => {
                const c = getCat(r.category)
                return (
                  <div key={r.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 22 }}>{c.emoji}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{r.description}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>כל חודש בתאריך {r.day_of_month} · {c.label}</div>
                    </div>
                    <div className={`tx-amount ${r.type}`} style={{ fontSize: 15, fontWeight: 700 }}>
                      {r.type === 'expense' ? '-' : '+'}₪{r.amount.toLocaleString()}
                    </div>
                    <label className="toggle-switch" style={{ flexShrink: 0 }}>
                      <input type="checkbox" checked={r.active}
                        onChange={async () => { await supabase.from('recurring_transactions').update({ active: !r.active }).eq('id', r.id); load() }} />
                      <span className="toggle-track" />
                    </label>
                    <button className="sel-del" onClick={async () => { await supabase.from('recurring_transactions').delete().eq('id', r.id); load() }}>✕</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Import/Export ──────────────────────────────────── */}
      {tab === 'import' && (
        <div style={{ display: 'grid', gap: 16 }}>
          {/* CSV Import */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ marginBottom: 8 }}>📥 ייבוא מקובץ CSV</h3>
            <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>
              העלה קובץ CSV עם עסקאות. הפורמט הנדרש: 5 עמודות לפי הסדר:
            </p>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontFamily: 'monospace', fontSize: 12, color: 'var(--text2)' }}>
              <div style={{ color: 'var(--amber)', marginBottom: 4, fontFamily: 'inherit' }}>תאריך, תיאור, סכום, סוג, קטגוריה</div>
              <div>2026-06-01, משכורת יוני, 15000, <span style={{color:'var(--green)'}}>income</span>, salary</div>
              <div>2026-06-02, סופר, 320, <span style={{color:'var(--red)'}}>expense</span>, groceries</div>
              <div>2026-06-05, נטפליקס, 60, <span style={{color:'var(--red)'}}>expense</span>, subscriptions</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
              <b>סוג:</b> income / expense &nbsp;|&nbsp;
              <b>קטגוריות:</b> salary, freelance, bonus, food, groceries, dining, transport, housing, entertainment, health, clothing, subscriptions, education, insurance, utilities, other
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={downloadExample}>
                📄 הורד קובץ לדוגמה
              </button>
              <span style={{ color: 'var(--text3)', fontSize: 12 }}>←</span>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleImport} style={{ fontSize: 13, flex: 1 }} />
            </div>
            {importResult && (
              <div style={{ marginTop: 10, fontSize: 13, padding: '8px 12px', borderRadius: 8,
                background: importResult.includes('✅') ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)',
                color: importResult.includes('✅') ? 'var(--green)' : 'var(--red)' }}>
                {importResult}
              </div>
            )}
          </div>
          {/* Export */}
          <div className="card" style={{ padding: 24 }}>
            <h3 style={{ marginBottom: 8 }}>📤 ייצוא נתונים</h3>
            <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>ייצא את כל העסקאות שלך לקובץ CSV</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-gold" onClick={exportCSV}>⬇️ ייצוא CSV</button>
              <button className="btn-ghost" onClick={() => {
                const json = JSON.stringify(txs, null, 2)
                const blob = new Blob([json], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url
                a.download = `shimshon-finance-${format(now, 'yyyy-MM-dd')}.json`
                a.click()
              }}>⬇️ ייצוא JSON</button>
            </div>
          </div>
          {/* Open Banking */}
          <div className="card" style={{ padding: 24, border: '1px solid color-mix(in srgb, var(--amber) 40%, transparent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 28 }}>🏦</span>
              <div>
                <h3 style={{ margin: 0 }}>בנקאות פתוחה</h3>
                <span style={{ fontSize: 11, background: 'var(--amber)', color: '#000', borderRadius: 4, padding: '1px 7px', fontWeight: 700 }}>בקרוב</span>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>
              סנכרון אוטומטי של עסקאות ישירות מחשבון הבנק וכרטיס האשראי שלך — ללא הזנה ידנית.
              עסקאות יכנסו לשמשון אוטומטית ברגע שהן מתבצעות.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                { emoji: '🏦', name: 'בנק הפועלים', status: 'נתמך' },
                { emoji: '🏦', name: 'לאומי', status: 'נתמך' },
                { emoji: '🏦', name: 'דיסקונט', status: 'נתמך' },
                { emoji: '🏦', name: 'מזרחי טפחות', status: 'נתמך' },
                { emoji: '💳', name: 'ישראכרט', status: 'נתמך' },
                { emoji: '💳', name: 'כאל', status: 'נתמך' },
                { emoji: '💳', name: 'מקס (לאומי קארד)', status: 'נתמך' },
                { emoji: '💳', name: 'אמריקן אקספרס', status: 'בפיתוח' },
              ].map(b => (
                <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 13 }}>
                  <span>{b.emoji}</span>
                  <span style={{ flex: 1 }}>{b.name}</span>
                  <span style={{ fontSize: 11, color: b.status === 'נתמך' ? 'var(--green)' : 'var(--text3)' }}>● {b.status}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <b style={{ color: 'var(--text2)' }}>מה נדרש לפיתוח:</b> חיבור ל-Salt Edge API (ספק Open Banking ישראלי) + הרשאת גישה בנקאית מהמשתמש + הצפנת credentials.
              זמן פיתוח משוער: ~2 שעות עבודה.
            </div>
          </div>
        </div>
      )}

      {/* ── Add Transaction Modal ──────────────────────────── */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal-card card fade-in" style={{ maxWidth: 480 }}>
            <div className="modal-header"><h3>עסקה חדשה</h3><button className="modal-close" onClick={() => setShowAdd(false)}>✕</button></div>
            <div className="modal-form">
              <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <button className={`btn-type ${type === 'expense' ? 'expense' : ''}`} style={{ flex: 1, padding: '10px', borderRadius: 8, border: `2px solid ${type === 'expense' ? 'var(--red)' : 'var(--border)'}`, background: type === 'expense' ? 'rgba(239,68,68,.1)' : 'transparent', cursor: 'pointer', fontWeight: 600 }} onClick={() => { setType('expense'); setCat('food') }}>הוצאה</button>
                <button className={`btn-type ${type === 'income' ? 'income' : ''}`} style={{ flex: 1, padding: '10px', borderRadius: 8, border: `2px solid ${type === 'income' ? 'var(--green)' : 'var(--border)'}`, background: type === 'income' ? 'rgba(16,185,129,.1)' : 'transparent', cursor: 'pointer', fontWeight: 600 }} onClick={() => { setType('income'); setCat('salary') }}>הכנסה</button>
              </div>
              <div className="mfield"><label>סכום (₪)</label>
                <input className="form-input" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus />
              </div>
              <div className="mfield"><label>תיאור</label>
                <input className="form-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="תיאור העסקה" />
              </div>
              <div className="mfield"><label>קטגוריה</label>
                <select className="form-input" value={cat} onChange={e => setCat(e.target.value)}>
                  {CATS[type].map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                </select>
              </div>
              <div className="mfield"><label>תאריך</label>
                <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div className="mfield"><label>הערות (אופציונלי)</label>
                <input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="הערות..." />
              </div>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setShowAdd(false)}>ביטול</button>
                <button className="btn-gold" onClick={saveTx} disabled={saving}>{saving ? 'שומר...' : 'שמור'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Goal Modal ────────────────────────────────────── */}
      {showGoalForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowGoalForm(false)}>
          <div className="modal-card card fade-in" style={{ maxWidth: 440 }}>
            <div className="modal-header"><h3>יעד חדש</h3><button className="modal-close" onClick={() => setShowGoalForm(false)}>✕</button></div>
            <div className="modal-form">
              <div className="mfield"><label>אמוג'י ושם</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="form-input" style={{ width: 56 }} value={gEmoji} onChange={e => setGEmoji(e.target.value)} />
                  <input className="form-input" style={{ flex: 1 }} value={gName} onChange={e => setGName(e.target.value)} placeholder="שם היעד" autoFocus />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="mfield"><label>יעד (₪)</label><input className="form-input" type="number" value={gTarget} onChange={e => setGTarget(e.target.value)} placeholder="50000" /></div>
                <div className="mfield"><label>נוכחי (₪)</label><input className="form-input" type="number" value={gCurrent} onChange={e => setGCurrent(e.target.value)} placeholder="0" /></div>
              </div>
              <div className="mfield"><label>תאריך יעד</label><input className="form-input" type="date" value={gDeadline} onChange={e => setGDeadline(e.target.value)} /></div>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setShowGoalForm(false)}>ביטול</button>
                <button className="btn-gold" onClick={saveGoal}>שמור</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Recurring Modal ───────────────────────────────── */}
      {showRecForm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowRecForm(false)}>
          <div className="modal-card card fade-in" style={{ maxWidth: 440 }}>
            <div className="modal-header"><h3>הוראת קבע חדשה</h3><button className="modal-close" onClick={() => setShowRecForm(false)}>✕</button></div>
            <div className="modal-form">
              <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <button style={{ flex: 1, padding: '8px', borderRadius: 8, border: `2px solid ${rType === 'expense' ? 'var(--red)' : 'var(--border)'}`, background: rType === 'expense' ? 'rgba(239,68,68,.1)' : 'transparent', cursor: 'pointer' }} onClick={() => setRType('expense')}>הוצאה</button>
                <button style={{ flex: 1, padding: '8px', borderRadius: 8, border: `2px solid ${rType === 'income' ? 'var(--green)' : 'var(--border)'}`, background: rType === 'income' ? 'rgba(16,185,129,.1)' : 'transparent', cursor: 'pointer' }} onClick={() => setRType('income')}>הכנסה</button>
              </div>
              <div className="mfield"><label>תיאור</label><input className="form-input" value={rDesc} onChange={e => setRDesc(e.target.value)} placeholder="שם הוראת הקבע" autoFocus /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="mfield"><label>סכום (₪)</label><input className="form-input" type="number" value={rAmount} onChange={e => setRAmount(e.target.value)} /></div>
                <div className="mfield"><label>יום בחודש</label><input className="form-input" type="number" min={1} max={28} value={rDay} onChange={e => setRDay(Number(e.target.value))} /></div>
              </div>
              <div className="mfield"><label>קטגוריה</label>
                <select className="form-input" value={rCat} onChange={e => setRCat(e.target.value)}>
                  {CATS[rType].map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                </select>
              </div>
              <div className="modal-actions">
                <button className="btn-ghost" onClick={() => setShowRecForm(false)}>ביטול</button>
                <button className="btn-gold" onClick={saveRec}>שמור</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
