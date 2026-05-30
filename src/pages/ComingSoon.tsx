import './ComingSoon.css'

interface Props {
  module: string
  icon: string
  color: string
  description: string
  features: string[]
}

const MODULE_INFO: Record<string, Props> = {
  finance:   { module: 'פיננסים', icon: '₪', color: 'var(--m-finance)', description: 'מעקב הכנסות, הוצאות, תקציבים, הוראות קבע וייבוא כרטיס אשראי.', features: ['מאזן חודשי ושנתי', 'הוראות קבע אוטומטיות', 'ייבוא פירוט אשראי עם AI', 'תקציבים לפי קטגוריה', 'יעדי חיסכון'] },
  workout:   { module: 'אימונים', icon: '◈', color: 'var(--m-workout)', description: 'לוג אימון בזמן אמת עם מעקב סטים, חזרות ומשקל.', features: ['לוג אימון בזמן אמת', 'סטים × חזרות × משקל', 'היסטוריית אימונים', 'גרפי התקדמות', 'תוכניות אימון'] },
  nutrition: { module: 'תזונה', icon: '◉', color: 'var(--m-food)', description: 'תפריט שבועי, רשימת קניות ומעקב קלוריות.', features: ['תפריט שבועי מ-AI', 'רשימת קניות אוטומטית', 'מעקב קלוריות ומאקרו', 'מתכונים מותאמים', 'תזכורות אכילה'] },
  calendar:  { module: 'לוח שנה', icon: '▦', color: 'var(--m-calendar)', description: 'חיבור ל-Google Calendar עם תצוגה יומית ושבועית.', features: ['חיבור Google Calendar', 'תצוגה יומית / שבועית', 'הוספת אירועים', 'סנכרון דו-כיווני', 'תזכורות לפגישות'] },
  tasks:     { module: 'משימות', icon: '☰', color: 'var(--m-tasks)', description: 'ניהול משימות עם פילטרים לפי תחום ועדיפות.', features: ['עבודה / אישי / בריאות', 'עדיפויות ותאריכי יעד', 'Kanban ורשימה', 'חיפוש וסינון', 'שמשון מוסיף דרך צ׳אט'] },
  habits:    { module: 'הרגלים', icon: '◎', color: 'var(--m-habits)', description: 'מעקב הרגלים יומי עם streak ולוח שנה חזותי.', features: ['מעקב יומי', 'Streak ורצף', 'לוח שנה חזותי', 'הרגלים מותאמים', 'סטטיסטיקות'] },
  invest:    { module: 'השקעות', icon: '△', color: 'var(--m-invest)', description: 'מעקב אחר תיק ההשקעות ותזכורת לבדיקות תקופתיות.', features: ['מעקב תיק', 'ביצועים לפי תקופה', 'התפלגות נכסים', 'תזכורת בדיקה חודשית', 'היסטוריה'] },
  reminders: { module: 'תזכורות', icon: '◷', color: 'var(--m-remind)', description: 'תזכורות אישיות חוזרות — תפילין, הורים, בדיקות.', features: ['תזכורות חוזרות', 'תזמון גמיש', 'שמשון מתזכר בצ׳אט', 'WhatsApp (בקרוב)', 'קטגוריות'] },
}

export default function ComingSoon({ moduleId, onNavigate }: { moduleId: string; onNavigate: (p: string) => void }) {
  const info = MODULE_INFO[moduleId]
  if (!info) return null

  return (
    <div className="coming-soon fade-in">
      <div className="cs-icon" style={{ color: info.color, background: info.color + '15' }}>
        {info.icon}
      </div>
      <h2 className="cs-title">{info.module}</h2>
      <p className="cs-desc">{info.description}</p>

      <div className="cs-features">
        {info.features.map(f => (
          <div key={f} className="cs-feature">
            <span className="cs-check" style={{ color: info.color }}>✓</span>
            {f}
          </div>
        ))}
      </div>

      <div className="cs-badge">
        <span className="cs-badge-dot" style={{ background: info.color }} />
        מודול זה בפיתוח — יהיה זמין בקרוב
      </div>

      <button className="btn-ghost" onClick={() => onNavigate('dashboard')} style={{ marginTop: 24 }}>
        ← חזרה למבט על
      </button>
    </div>
  )
}
