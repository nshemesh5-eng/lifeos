import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { User } from '@supabase/supabase-js'
import './Invest.css'

interface Investment { id: string; user_id: string; name: string; ticker: string; category: string; amount_invested: number; current_value: number; currency: string }

const CATS = [
  { id: 'stocks', label: 'מניות', color: '#3B82F6', emoji: '📊' },
  { id: 'etf', label: 'ETF', color: '#8B5CF6', emoji: '🏦' },
  { id: 'crypto', label: 'קריפטו', color: '#F59E0B', emoji: '₿' },
  { id: 'real_estate', label: 'נדל"ן', color: '#10B981', emoji: '🏠' },
  { id: 'other', label: 'אחר', color: '#6B7280', emoji: '💼' },
]

export default function Invest({ user }: { user: User }) {
  const [investments, setInvestments] = useState<Investment[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [ticker, setTicker] = useState('')
  const [cat, setCat] = useState('stocks')
  const [invested, setInvested] = useState('')
  const [current, setCurrent] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('investments').select('*').eq('user_id', user.id)
    setInvestments(data || [])
  }, [user.id])

  useEffect(() => { load() }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const { data, error } = await supabase.from('investments').insert({
      user_id: user.id, name, ticker, category: cat,
      amount_invested: parseFloat(invested) || 0, current_value: parseFloat(current) || 0, currency: 'ILS'
    }).select().single()
    if (!error && data) setInvestments(p => [...p, data])
    setSaving(false); setShowAdd(false); setName(''); setTicker(''); setInvested(''); setCurrent('')
  }

  const remove = async (id: string) => {
    await supabase.from('investments').delete().eq('id', id)
    setInvestments(p => p.filter(i => i.id !== id))
  }

  const totalInvested = investments.reduce((s, i) => s + i.amount_invested, 0)
  const totalCurrent = investments.reduce((s, i) => s + i.current_value, 0)
  const totalGain = totalCurrent - totalInvested
  const gainPct = totalInvested > 0 ? ((totalGain / totalInvested) * 100).toFixed(1) : '0.0'
  const fmt = (n: number) => '₪' + Math.abs(Math.round(n)).toLocaleString('he-IL')

  const byCat: Record<string, number> = {}
  investments.forEach(i => { byCat[i.category] = (byCat[i.category] || 0) + i.current_value })

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div>
          <h1 className="module-title"><span style={{ color: 'var(--m-invest)' }}>△</span> השקעות</h1>
          <p className="module-sub">{investments.length} פוזיציות</p>
        </div>
        <button className="btn-gold" onClick={() => setShowAdd(true)}>+ השקעה</button>
      </div>

      {/* Summary */}
      <div className="invest-summary">
        <div className="invest-stat card">
          <div className="invest-stat-label">שווי תיק</div>
          <div className="invest-stat-value text-gold">{fmt(totalCurrent)}</div>
        </div>
        <div className="invest-stat card">
          <div className="invest-stat-label">השקעה מצטברת</div>
          <div className="invest-stat-value">{fmt(totalInvested)}</div>
        </div>
        <div className="invest-stat card">
          <div className="invest-stat-label">רווח / הפסד</div>
          <div className={`invest-stat-value ${totalGain >= 0 ? 'text-green' : 'text-red'}`}>
            {totalGain >= 0 ? '+' : ''}{fmt(totalGain)} ({gainPct}%)
          </div>
        </div>
      </div>

      {/* Allocation */}
      {investments.length > 0 && (
        <div className="card invest-alloc">
          <div className="invest-alloc-title">הרכב תיק</div>
          <div className="invest-alloc-bar">
            {CATS.filter(c => byCat[c.id] > 0).map(c => (
              <div key={c.id} className="invest-alloc-segment"
                style={{ width: `${(byCat[c.id]/totalCurrent)*100}%`, background: c.color }}
                title={`${c.label}: ${fmt(byCat[c.id])}`} />
            ))}
          </div>
          <div className="invest-alloc-legend">
            {CATS.filter(c => byCat[c.id] > 0).map(c => (
              <div key={c.id} className="invest-alloc-item">
                <span className="invest-alloc-dot" style={{ background: c.color }} />
                <span>{c.emoji} {c.label}</span>
                <span className="text-hint">{Math.round((byCat[c.id]/totalCurrent)*100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Holdings */}
      <div className="invest-list">
        {investments.map(inv => {
          const catInfo = CATS.find(c => c.id === inv.category) || CATS[4]
          const gain = inv.current_value - inv.amount_invested
          const gainPct2 = inv.amount_invested > 0 ? ((gain / inv.amount_invested) * 100).toFixed(1) : '0.0'
          return (
            <div key={inv.id} className="invest-row card">
              <div className="invest-row-left">
                <div className="invest-cat-icon" style={{ background: catInfo.color + '18', color: catInfo.color }}>{catInfo.emoji}</div>
                <div>
                  <div className="invest-name">{inv.name}</div>
                  {inv.ticker && <div className="invest-ticker">{inv.ticker} · {catInfo.label}</div>}
                </div>
              </div>
              <div className="invest-row-right">
                <div className="invest-value">{fmt(inv.current_value)}</div>
                <div className={`invest-gain ${gain >= 0 ? 'text-green' : 'text-red'}`}>
                  {gain >= 0 ? '+' : ''}{fmt(gain)} ({gainPct2}%)
                </div>
              </div>
              <button className="task-del" onClick={() => remove(inv.id)}>✕</button>
            </div>
          )
        })}
        {investments.length === 0 && <p className="text-hint" style={{ fontSize: 14, textAlign: 'center', padding: '32px 0' }}>הוסף את ההחזקות שלך.</p>}
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal-card card fade-in">
            <div className="modal-header"><h3>השקעה חדשה</h3><button className="modal-close" onClick={() => setShowAdd(false)}>✕</button></div>
            <form onSubmit={add} className="modal-form">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="mfield"><label>שם</label><input className="form-input" value={name} onChange={e=>setName(e.target.value)} placeholder="S&P 500 ETF" required /></div>
                <div className="mfield"><label>טיקר (אופציונלי)</label><input className="form-input" value={ticker} onChange={e=>setTicker(e.target.value)} placeholder="SPY" /></div>
              </div>
              <div className="mfield"><label>קטגוריה</label>
                <select className="form-input" value={cat} onChange={e=>setCat(e.target.value)}>
                  {CATS.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="mfield"><label>עלות ₪</label><input className="form-input" type="number" value={invested} onChange={e=>setInvested(e.target.value)} placeholder="10000" /></div>
                <div className="mfield"><label>שווי נוכחי ₪</label><input className="form-input" type="number" value={current} onChange={e=>setCurrent(e.target.value)} placeholder="12000" /></div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowAdd(false)}>ביטול</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving?'...':'הוסף'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
