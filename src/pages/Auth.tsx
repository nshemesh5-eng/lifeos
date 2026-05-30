import { useState } from 'react'
import { supabase } from '../lib/supabase'
import './Auth.css'

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setSuccess(''); setLoading(true)
    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setSuccess('בדוק את המייל לאישור.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError('אימייל או סיסמה שגויים')
    }
    setLoading(false)
  }

  return (
    <div className="auth-wrap">
      <div className="auth-bg-glow" />
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">ש</div>
          <div>
            <div className="auth-logo-name">שמשון</div>
            <div className="auth-logo-sub">מרכז החיים האישי</div>
          </div>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>כניסה</button>
          <button className={`auth-tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => setMode('signup')}>הרשמה</button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label>אימייל</label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
          <div className="auth-field">
            <label>סיסמה</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="לפחות 6 תווים" minLength={6} required />
          </div>
          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}
          <button className="btn-gold" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'טוען...' : mode === 'login' ? 'כניסה' : 'יצירת חשבון'}
          </button>
        </form>
      </div>
    </div>
  )
}
