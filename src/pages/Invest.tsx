import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import './Invest.css'

interface Investment {
  id: string; name: string; ticker: string; category: string
  amount_invested: number; current_value: number; currency: string; updated_at: string
}

const CATS = [
  { id: 'stocks',       label: 'מניות',   color: '#3B82F6', emoji: '📊' },
  { id: 'etf',          label: 'ETF',     color: '#8B5CF6', emoji: '🏦' },
  { id: 'crypto',       label: 'קריפטו',  color: '#F59E0B', emoji: '₿'  },
  { id: 'real_estate',  label: 'נדל"ן',   color: '#10B981', emoji: '🏠' },
  { id: 'bonds',        label: 'אגח',     color: '#14B8A6', emoji: '📜' },
  { id: 'savings',      label: 'חיסכון',  color: '#F5C842', emoji: '🏧' },
  { id: 'other',        label: 'אחר',     color: '#6B7280', emoji: '💼' },
]
const getCat = (id: string) => CATS.find(c => c.id === id) || CATS[6]

export default function Invest({ user }: { user: User }) {
  const [investments, setInvestments] = useState<Investment[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string|null>(null)
  const [name, setName] = useState('')
  const [ticker, setTicker] = useState('')
  const [cat, setCat] = useState('stocks')
  const [invested, setInvested] = useState('')
  const [current, setCurrent] = useState('')
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'list'|'allocation'>('list')

  const load = useCallback(async () => {
    const { data } = await supabase.from('investments').select('*').eq('user_id', user.id).order('current_value', { ascending: false })
    setInvestments(data || [])
  }, [user.id])

  useEffect(() => { load() }, [load])

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    if (editId) {
      const { data } = await supabase.from('investments').update({
        name, ticker, category: cat, amount_invested: parseFloat(invested)||0, current_value: parseFloat(current)||0
      }).eq('id', editId).select().single()
      if (data) setInvestments(p => p.map(i => i.id === editId ? data : i).sort((a,b) => b.current_value - a.current_value))
      setEditId(null)
    } else {
      const { data } = await supabase.from('investments').insert({
        user_id: user.id, name, ticker, category: cat,
        amount_invested: parseFloat(invested)||0, current_value: parseFloat(current)||0, currency: 'ILS'
      }).select().single()
      if (data) setInvestments(p => [...p, data].sort((a,b) => b.current_value - a.current_value))
    }
    setSaving(false); setShowAdd(false)
    setName(''); setTicker(''); setInvested(''); setCurrent('')
  }

  const startEdit = (inv: Investment) => {
    setEditId(inv.id); setName(inv.name); setTicker(inv.ticker || '')
    setCat(inv.category); setInvested(String(inv.amount_invested)); setCurrent(String(inv.current_value))
    setShowAdd(true)
  }

  const remove = async (id: string) => {
    await supabase.from('investments').delete().eq('id', id)
    setInvestments(p => p.filter(i => i.id !== id))
  }

  const total = investments.reduce((s, i) => s + i.current_value, 0)
  const totalInvested = investments.reduce((s, i) => s + i.amount_invested, 0)
  const totalGain = total - totalInvested
  const gainPct = totalInvested > 0 ? ((totalGain / totalInvested) * 100).toFixed(1) : '0.0'

  // By category
  const byCat: Record<string, number> = {}
  investments.forEach(i => { byCat[i.category] = (byCat[i.category]||0) + i.current_value })

  const fmt = (n: number) => '₪' + Math.abs(Math.round(n)).toLocaleString('he-IL')
  const fmtPct = (n: number) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%'

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{ color: 'var(--m-invest)' }}>△</span> השקעות</h1>
          <p className="module-sub">{investments.length} פוזיציות</p>
        </div>
        <button className="btn-gold" onClick={() => { setEditId(null); setShowAdd(true) }}>+ השקעה</button>
      </div>

      {/* Summary */}
      <div className="invest-hero">
        <div className="invest-hero-main card">
          <div className="invest-hero-label">שווי תיק</div>
          <div className="invest-hero-value text-gold">{fmt(total)}</div>
          <div className={`invest-hero-gain ${totalGain >= 0 ? 'text-green' : 'text-red'}`}>
            {totalGain >= 0 ? '+' : ''}{fmt(totalGain)} ({gainPct}%)
          </div>
        </div>
        <div className="invest-stats">
          <div className="fin-stat card">
            <div className="fin-stat-label">השקעה מצטברת</div>
            <div className="fin-stat-value">{fmt(totalInvested)}</div>
          </div>
          <div className="fin-stat card">
            <div className="fin-stat-label">פוזיציות</div>
            <div className="fin-stat-value" style={{ color: 'var(--blue)' }}>{investments.length}</div>
          </div>
        </div>
      </div>

      {/* Allocation bar */}
      {investments.length > 0 && total > 0 && (
        <div className="card invest-alloc-card">
          <div className="invest-alloc-title">הרכב תיק</div>
          <div className="invest-alloc-bar">
            {CATS.filter(c => byCat[c.id] > 0).map(c => (
              <div key={c.id} className="invest-alloc-seg"
                style={{ width: `${(byCat[c.id]/total)*100}%`, background: c.color }}
                title={`${c.label}: ${fmt(byCat[c.id])}`} />
            ))}
          </div>
          <div className="invest-alloc-legend">
            {CATS.filter(c => byCat[c.id] > 0).map(c => (
              <div key={c.id} className="invest-alloc-item">
                <span className="invest-alloc-dot" style={{ background: c.color }} />
                <span>{c.emoji} {c.label}</span>
                <span className="text-hint">{Math.round((byCat[c.id]/total)*100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Holdings list */}
      <div className="invest-list">
        {investments.map(inv => {
          const c = getCat(inv.category)
          const gain = inv.current_value - inv.amount_invested
          const gPct = inv.amount_invested > 0 ? ((gain / inv.amount_invested) * 100) : 0
          const pctOfTotal = total > 0 ? (inv.current_value / total) * 100 : 0
          return (
            <div key={inv.id} className="invest-row card">
              <div className="invest-row-icon" style={{ background: c.color + '18', color: c.color }}>{c.emoji}</div>
              <div className="invest-row-info">
                <div className="invest-row-name">{inv.name}</div>
                <div className="invest-row-meta">
                  {inv.ticker && <span className="invest-ticker-badge">{inv.ticker}</span>}
                  <span className="invest-cat-label" style={{ color: c.color }}>{c.label}</span>
                  <span className="invest-pct-bar-wrap">
                    <span className="invest-pct-bar" style={{ width: `${pctOfTotal}%`, background: c.color }} />
                  </span>
                  <span className="text-hint" style={{ fontSize: 11 }}>{pctOfTotal.toFixed(1)}%</span>
                </div>
              </div>
              <div className="invest-row-values">
                <div className="invest-row-value">{fmt(inv.current_value)}</div>
                <div className={`invest-row-gain ${gain >= 0 ? 'text-green' : 'text-red'}`}>
                  {gain >= 0 ? '+' : ''}{fmt(gain)} ({fmtPct(gPct)})
                </div>
              </div>
              <div className="invest-row-actions">
                <button className="btn-ghost" style={{ height:30, fontSize:12 }} onClick={() => startEdit(inv)}>✏️</button>
                <button className="task-del2" onClick={() => remove(inv.id)}>✕</button>
              </div>
            </div>
          )
        })}
        {investments.length === 0 && (
          <div className="tasks-empty2">
            <div style={{ fontSize:36, marginBottom:12 }}>△</div>
            <p>הוסף את ההחזקות שלך לקבל מבט על התיק.</p>
            <button className="btn-ghost" style={{ marginTop:12 }} onClick={() => setShowAdd(true)}>הוסף ראשון</button>
          </div>
        )}
      </div>

      {/* Add/Edit modal */}
      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header">
              <h3>{editId ? 'עריכת השקעה' : 'השקעה חדשה'}</h3>
              <button className="modal-close" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <form onSubmit={save} className="modal-form">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 12 }}>
                <div className="mfield"><label>שם</label><input className="form-input" value={name} onChange={e=>setName(e.target.value)} placeholder="S&P 500 ETF, Apple..." required /></div>
                <div className="mfield"><label>טיקר</label><input className="form-input" value={ticker} onChange={e=>setTicker(e.target.value)} placeholder="SPY" /></div>
              </div>
              <div className="mfield"><label>קטגוריה</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {CATS.map(c => (
                    <button key={c.id} type="button"
                      style={{ padding: '5px 12px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
                        background: cat === c.id ? c.color + '22' : 'var(--surface2)',
                        border: `1px solid ${cat === c.id ? c.color : 'var(--border)'}`,
                        color: cat === c.id ? c.color : 'var(--text3)' }}
                      onClick={() => setCat(c.id)}>{c.emoji} {c.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="mfield"><label>עלות ₪</label><input className="form-input" type="number" value={invested} onChange={e=>setInvested(e.target.value)} placeholder="10000" /></div>
                <div className="mfield"><label>שווי נוכחי ₪</label><input className="form-input" type="number" value={current} onChange={e=>setCurrent(e.target.value)} placeholder="12000" /></div>
              </div>
              {invested && current && (
                <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderRadius: 'var(--radius)', fontSize: 13 }}>
                  רווח/הפסד: {' '}
                  <span style={{ fontWeight: 800, color: parseFloat(current) >= parseFloat(invested) ? 'var(--green)' : 'var(--red)' }}>
                    {parseFloat(current) >= parseFloat(invested) ? '+' : ''}₪{Math.round(parseFloat(current) - parseFloat(invested)).toLocaleString()} ({(((parseFloat(current)-parseFloat(invested))/parseFloat(invested))*100).toFixed(1)}%)
                  </span>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowAdd(false)}>ביטול</button>
                <button type="submit" className="btn-gold" disabled={saving}>{saving?'...':editId?'שמור':'הוסף'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
