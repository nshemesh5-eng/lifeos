import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import './Admin.css'

interface UserRow {
  id: string; email: string; full_name: string; display_name: string
  role: string; plan: string; is_active: boolean; last_seen: string
  created_at: string; cal_target: number; protein_target: number
}

export default function AdminPage({ user }: { user: User }) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [stats, setStats] = useState({ total:0, active:0, admins:0 })
  const [search, setSearch] = useState('')
  const [auditLog, setAuditLog] = useState<any[]>([])
  const [tab, setTab] = useState<'users'|'audit'|'stats'>('users')

  useEffect(() => { init() }, [])

  const ADMIN_EMAILS = ['n.shemesh5@gmail.com', 'netanel.shemes@gmail.com']

  const init = async () => {
    // Check by email directly (matches RLS policy using auth.jwt() ->> 'email')
    const userEmail = user.email || ''
    if (!ADMIN_EMAILS.includes(userEmail)) {
      setIsAdmin(false); setLoading(false); return
    }
    setIsAdmin(true)
    await Promise.all([loadUsers(), loadAudit()])
    setLoading(false)
  }

  const loadUsers = async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
    if (data) {
      setUsers(data)
      setStats({ total: data.length, active: data.filter(u=>u.is_active).length, admins: data.filter(u=>u.role==='admin').length })
    }
  }

  const loadAudit = async () => {
    const { data } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(50)
    if (data) setAuditLog(data)
  }

  const updateUser = async (id: string, updates: Partial<UserRow>) => {
    await supabase.from('profiles').update(updates).eq('id', id)
    setUsers(p => p.map(u => u.id===id ? {...u,...updates} : u))
  }

  if (loading) return <div className="module-page"><div className="empty-state">⏳</div></div>
  if (!isAdmin) return (
    <div className="module-page">
      <div className="empty-state">
        <div className="empty-state-icon">🔒</div>
        <p>אין לך הרשאות ניהול</p>
      </div>
    </div>
  )

  const filtered = users.filter(u =>
    (u.email||'').includes(search) || (u.full_name||'').includes(search) || (u.display_name||'').includes(search)
  )

  return (
    <div className="module-page fade-in">
      <div className="module-header">
        <div><h1 className="module-title">👑 פאנל ניהול</h1><p className="module-sub">ניהול משתמשים ומערכת</p></div>
      </div>

      {/* Stats */}
      <div className="admin-stats">
        {[{label:'סה״כ משתמשים',val:stats.total,color:'var(--blue)'},{label:'פעילים',val:stats.active,color:'var(--green)'},{label:'מנהלים',val:stats.admins,color:'var(--gold)'}].map(s=>(
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{color:s.color}}>{s.val}</div>
          </div>
        ))}
      </div>

      <div className="tab-bar" style={{marginBottom:16}}>
        {[['users','👥 משתמשים'],['audit','📋 Audit Log'],['stats','📊 נתונים']].map(([id,label])=>(
          <button key={id} className={`tab-btn ${tab===id?'active':''}`} onClick={()=>setTab(id as any)}>{label}</button>
        ))}
      </div>

      {tab==='users' && (
        <div>
          <input className="form-input" style={{marginBottom:12}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="חפש לפי מייל / שם..." />
          <div className="admin-table card">
            <table className="admin-tbl">
              <thead>
                <tr><th>משתמש</th><th>תפקיד</th><th>תוכנית</th><th>פעיל</th><th>נכנס לאחרונה</th><th>פעולות</th></tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{fontWeight:600,fontSize:13}}>{u.display_name||u.full_name||'—'}</div>
                      <div style={{fontSize:11,color:'var(--text3)'}}>{u.email}</div>
                    </td>
                    <td>
                      <select className="admin-select" value={u.role} onChange={e=>updateUser(u.id,{role:e.target.value as any})}>
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                        <option value="moderator">moderator</option>
                      </select>
                    </td>
                    <td>
                      <select className="admin-select" value={u.plan} onChange={e=>updateUser(u.id,{plan:e.target.value as any})}>
                        <option value="free">free</option>
                        <option value="pro">pro</option>
                        <option value="enterprise">enterprise</option>
                      </select>
                    </td>
                    <td>
                      <button className={`admin-toggle ${u.is_active?'on':'off'}`} onClick={()=>updateUser(u.id,{is_active:!u.is_active})}>
                        {u.is_active?'✓':'✕'}
                      </button>
                    </td>
                    <td style={{fontSize:11,color:'var(--text3)'}}>{u.last_seen ? new Date(u.last_seen).toLocaleDateString('he-IL') : '—'}</td>
                    <td>
                      <button className="btn-ghost" style={{height:28,fontSize:11,padding:'0 8px'}}
                        onClick={()=>alert(JSON.stringify({id:u.id,email:u.email,cal:u.cal_target,protein:u.protein_target},null,2))}>
                        info
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==='audit' && (
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          {auditLog.length===0 ? <div className="empty-state" style={{padding:40}}><p>אין רשומות audit עדיין</p></div> :
            <table className="admin-tbl">
              <thead><tr><th>פעולה</th><th>טבלה</th><th>פרטים</th><th>זמן</th></tr></thead>
              <tbody>
                {auditLog.map(l=>(
                  <tr key={l.id}>
                    <td><span style={{fontSize:12,fontWeight:600}}>{l.action}</span></td>
                    <td><span style={{fontSize:11,color:'var(--text3)'}}>{l.table_name||'—'}</span></td>
                    <td><span style={{fontSize:11,color:'var(--text3)'}}>{JSON.stringify(l.details||{}).substring(0,60)}</span></td>
                    <td><span style={{fontSize:11,color:'var(--text3)'}}>{new Date(l.created_at).toLocaleString('he-IL')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </div>
      )}

      {tab==='stats' && (
        <div>
          <div className="admin-stats">
            {[
              {label:'סה״כ רשומות',val:'—',color:'var(--text)'},
              {label:'API calls היום',val:'—',color:'var(--blue)'},
              {label:'שגיאות',val:'0',color:'var(--green)'},
            ].map(s=>(
              <div key={s.label} className="stat-card">
                <div className="stat-label">{s.label}</div>
                <div className="stat-value" style={{color:s.color}}>{s.val}</div>
              </div>
            ))}
          </div>
          <div className="card" style={{padding:20}}>
            <p style={{fontSize:13,color:'var(--text3)'}}>סטטיסטיקות מפורטות יתווספו בגרסה הבאה</p>
          </div>
        </div>
      )}
    </div>
  )
}
