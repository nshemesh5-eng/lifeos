import { useState, useEffect, useRef } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import './Profile.css'

interface Profile {
  id: string; email: string; full_name: string; display_name: string
  avatar_url: string; phone: string; bio: string; timezone: string
  role: string; plan: string; is_active: boolean; onboarded: boolean
  cal_target: number; protein_target: number; workout_goal: number
  whatsapp_number: string; last_seen: string; created_at: string
}

export default function ProfilePage({ user }: { user: User }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<'personal'|'goals'|'security'|'integrations'>('personal')
  const [form, setForm] = useState<Partial<Profile>>({})
  const [avatar, setAvatar] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (data) { setProfile(data); setForm(data); setAvatar(data.avatar_url || '') }
    setLoading(false)
  }

  const save = async () => {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      full_name: form.full_name, display_name: form.display_name,
      phone: form.phone, bio: form.bio, timezone: form.timezone,
      cal_target: form.cal_target, protein_target: form.protein_target,
      workout_goal: form.workout_goal, whatsapp_number: form.whatsapp_number,
    }).eq('id', user.id)
    setSaving(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
  }

  const uploadAvatar = async (file: File) => {
    const ext = file.name.split('.').pop()
    const path = `avatars/${user.id}.${ext}`
    const { error } = await supabase.storage.from('public').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('public').getPublicUrl(path)
      await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', user.id)
      setAvatar(data.publicUrl)
    }
  }

  const changePassword = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(user.email!, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    if (!error) alert('נשלח מייל לאיפוס סיסמה')
    else alert('שגיאה: ' + error.message)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  const f = (key: keyof Profile, val: any) => setForm(p => ({...p, [key]: val}))

  if (loading) return <div className="module-page"><div className="empty-state">⏳ טוען...</div></div>

  const initials = (form.display_name || form.full_name || user.email || '?').substring(0,2).toUpperCase()
  const planColor = { free: 'var(--text3)', pro: 'var(--gold)', enterprise: 'var(--purple)' }[profile?.plan || 'free']

  return (
    <div className="module-page fade-in">
      {/* Header */}
      <div className="profile-header card">
        <div className="profile-avatar-wrap" onClick={() => fileRef.current?.click()}>
          {avatar
            ? <img src={avatar} alt="avatar" className="profile-avatar-img" />
            : <div className="profile-avatar-ph">{initials}</div>
          }
          <div className="profile-avatar-edit">📷</div>
          <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}}
            onChange={e => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
        </div>
        <div className="profile-header-info">
          <h2 className="profile-name">{form.display_name || form.full_name || user.email}</h2>
          <p className="profile-email">{user.email}</p>
          <div className="profile-badges">
            <span className="profile-badge" style={{color: planColor, borderColor: planColor}}>
              {profile?.plan === 'pro' ? '⭐ Pro' : profile?.plan === 'enterprise' ? '🏢 Enterprise' : '🆓 Free'}
            </span>
            {profile?.role === 'admin' && <span className="profile-badge admin">👑 Admin</span>}
          </div>
        </div>
        <button className="btn-ghost profile-signout" onClick={signOut}>יציאה 👋</button>
      </div>

      {/* Tabs */}
      <div className="tab-bar" style={{marginBottom:16}}>
        {([['personal','👤 פרטים'],['goals','🎯 יעדים'],['security','🔐 אבטחה'],['integrations','🔌 חיבורים']] as const).map(([id,label]) => (
          <button key={id} className={`tab-btn ${tab===id?'active':''}`} onClick={()=>setTab(id as any)}>{label}</button>
        ))}
      </div>

      {/* Personal */}
      {tab === 'personal' && (
        <div className="card profile-form">
          <div className="profile-form-grid">
            <div className="mfield">
              <label>שם מלא</label>
              <input className="form-input" value={form.full_name||''} onChange={e=>f('full_name',e.target.value)} placeholder="ישראל ישראלי" />
            </div>
            <div className="mfield">
              <label>שם תצוגה</label>
              <input className="form-input" value={form.display_name||''} onChange={e=>f('display_name',e.target.value)} placeholder="ישראל" />
            </div>
            <div className="mfield">
              <label>טלפון</label>
              <input className="form-input" value={form.phone||''} onChange={e=>f('phone',e.target.value)} placeholder="050-0000000" />
            </div>
            <div className="mfield">
              <label>אזור זמן</label>
              <select className="form-input" value={form.timezone||'Asia/Jerusalem'} onChange={e=>f('timezone',e.target.value)}>
                <option value="Asia/Jerusalem">ישראל (UTC+3)</option>
                <option value="Europe/London">לונדון (UTC+1)</option>
                <option value="America/New_York">ניו יורק (UTC-4)</option>
                <option value="America/Los_Angeles">לוס אנגלס (UTC-7)</option>
              </select>
            </div>
            <div className="mfield" style={{gridColumn:'1/-1'}}>
              <label>ביו קצרה</label>
              <textarea className="form-input" style={{height:80}} value={form.bio||''} onChange={e=>f('bio',e.target.value)} placeholder="מי אתה? מה מניע אותך?" />
            </div>
          </div>
        </div>
      )}

      {/* Goals */}
      {tab === 'goals' && (
        <div className="card profile-form">
          <p style={{fontSize:13,color:'var(--text3)',marginBottom:16}}>יעדים אלה ישמשו את שמשון כהקשר בכל שיחה</p>
          <div className="profile-form-grid">
            {[
              {key:'cal_target',label:'🍽 יעד קלוריות יומי',unit:'קל\'',default:2000},
              {key:'protein_target',label:'🥩 יעד חלבון',unit:'g',default:150},
              {key:'workout_goal',label:'🏋 אימונים בשבוע',unit:'ימים',default:4},
            ].map(({key,label,unit,default:def}) => (
              <div key={key} className="mfield">
                <label>{label}</label>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <input className="form-input" type="number" style={{flex:1}}
                    value={(form as any)[key]||def} onChange={e=>f(key as any, parseInt(e.target.value)||def)} />
                  <span style={{fontSize:13,color:'var(--text3)',flexShrink:0}}>{unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security */}
      {tab === 'security' && (
        <div className="card profile-form">
          <div className="profile-security-item">
            <div>
              <div className="profile-security-title">סיסמה</div>
              <div className="profile-security-sub">שנה את הסיסמה שלך</div>
            </div>
            <button className="btn-ghost" onClick={changePassword}>שלח קישור איפוס</button>
          </div>
          <div className="profile-security-item">
            <div>
              <div className="profile-security-title">חשבון פעיל</div>
              <div className="profile-security-sub">חשבון: {profile?.is_active ? '✅ פעיל' : '❌ מושבת'}</div>
            </div>
          </div>
          <div className="profile-security-item">
            <div>
              <div className="profile-security-title">כניסה אחרונה</div>
              <div className="profile-security-sub">{profile?.last_seen ? new Date(profile.last_seen).toLocaleString('he-IL') : 'לא ידוע'}</div>
            </div>
          </div>
          <div className="profile-security-item">
            <div>
              <div className="profile-security-title">חבר מ</div>
              <div className="profile-security-sub">{profile?.created_at ? new Date(profile.created_at).toLocaleDateString('he-IL') : ''}</div>
            </div>
          </div>
          <div style={{marginTop:20,padding:16,background:'var(--red-dim)',borderRadius:12,border:'1px solid var(--red)'}}>
            <div style={{fontWeight:700,color:'var(--red)',marginBottom:6}}>⚠️ מחיקת חשבון</div>
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>מחיקת החשבון היא בלתי הפיכה — כל הנתונים יימחקו</div>
            <button className="btn-ghost" style={{color:'var(--red)',borderColor:'var(--red)'}}
              onClick={()=>confirm('האם אתה בטוח? לא ניתן לבטל.') && alert('שלח מייל ל-support לאישור מחיקה')}>
              מחק חשבון
            </button>
          </div>
        </div>
      )}

      {/* Integrations */}
      {tab === 'integrations' && (
        <div className="card profile-form">
          <div className="profile-security-item">
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <span style={{fontSize:24}}>💬</span>
              <div>
                <div className="profile-security-title">WhatsApp</div>
                <div className="profile-security-sub">חיבור שמשון ל-WhatsApp שלך</div>
              </div>
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input className="form-input" style={{width:150}} value={form.whatsapp_number||''} 
                onChange={e=>f('whatsapp_number',e.target.value)} placeholder="+972501234567" />
              <span style={{fontSize:11,color:form.whatsapp_number?'var(--green)':'var(--text3)'}}>
                {form.whatsapp_number?'✓':''}
              </span>
            </div>
          </div>
          <div className="profile-security-item">
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <span style={{fontSize:24}}>📅</span>
              <div>
                <div className="profile-security-title">Google Calendar</div>
                <div className="profile-security-sub">סנכרון דו-כיווני עם הלוח שנה</div>
              </div>
            </div>
            <span style={{color:'var(--green)',fontSize:12,fontWeight:600}}>✓ מחובר</span>
          </div>
          <div className="profile-security-item">
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <span style={{fontSize:24}}>🤖</span>
              <div>
                <div className="profile-security-title">Gemini AI</div>
                <div className="profile-security-sub">שמשון מופעל על Gemini</div>
              </div>
            </div>
            <span style={{color:'var(--green)',fontSize:12,fontWeight:600}}>✓ פעיל</span>
          </div>
        </div>
      )}

      {/* Save button */}
      {(tab === 'personal' || tab === 'goals' || tab === 'integrations') && (
        <button className="btn-gold profile-save" onClick={save} disabled={saving}>
          {saving ? '⏳ שומר...' : saved ? '✅ נשמר!' : '💾 שמור שינויים'}
        </button>
      )}
    </div>
  )
}
