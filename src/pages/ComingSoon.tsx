import './ComingSoon.css'

const MODULES: Record<string, { label: string; icon: string; color: string; desc: string; features: string[] }> = {
  nutrition: {
    label: 'תזונה', icon: '🥗', color: 'var(--m-food)',
    desc: 'תפריט שבועי חכם, רשימת קניות אוטומטית ומעקב קלוריות.',
    features: ['תפריט שבועי מ-AI לפי העדפות', 'רשימת קניות אוטומטית', 'מעקב קלוריות ומאקרו', 'מתכונים מותאמים', 'תזכורות ארוחות']
  },
  calendar: {
    label: 'לוח שנה', icon: '📅', color: 'var(--m-calendar)',
    desc: 'חיבור ל-Google Calendar, תצוגה יומית ושבועית.',
    features: ['חיבור Google Calendar', 'תצוגה יומית ושבועית', 'הוספת אירועים', 'סנכרון דו-כיווני', 'תזכורות לפגישות']
  },
}

export default function ComingSoon({ moduleId, onNavigate }: { moduleId: string; onNavigate: (p: string) => void }) {
  const m = MODULES[moduleId]
  if (!m) return null
  return (
    <div className="cs-wrap fade-in">
      <div className="cs-icon" style={{ color: m.color, background: m.color.replace('var(--m-','rgba(').replace(')',', 0.12)') }}>
        {m.icon}
      </div>
      <h2 className="cs-title">{m.label}</h2>
      <p className="cs-desc">{m.desc}</p>
      <div className="cs-features">
        {m.features.map(f => (
          <div key={f} className="cs-feature card">
            <span style={{ color: m.color, fontWeight: 800 }}>✓</span>
            {f}
          </div>
        ))}
      </div>
      <div className="cs-badge">
        <span className="cs-badge-dot" style={{ background: m.color }} />
        בפיתוח — יהיה זמין בקרוב
      </div>
      <button className="btn-ghost" onClick={() => onNavigate('dashboard')} style={{ marginTop: 24 }}>
        ← חזרה
      </button>
    </div>
  )
}
