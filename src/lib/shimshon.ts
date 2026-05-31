const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY

export interface ShimshonMessage {
  role: 'user' | 'shimshon'
  content: string
  timestamp: Date
}

export interface LifeContext {
  date: string
  dayOfWeek: string
  todayTasks: Array<{ title: string; done: boolean; priority: string }>
  todayHabits: Array<{ name: string; done: boolean }>
  finance: { monthBalance: number; monthExpenses: number; monthIncome: number }
  workoutToday: boolean
  remindersToday: Array<{ text: string; time: string }>
}

const SYSTEM = `אתה שמשון — העוזר האישי החכם של המשתמש ב-Life OS.
אתה יודע הכל על החיים שלו: פיננסים, אימונים, משימות, הרגלים, תזכורות, השקעות.

כללים:
- עברית בלבד. תמיד.
- קצר וישיר. מקסימום 3 משפטים אלא אם מבקשים פירוט מפורש.
- לא אומר "כמובן" / "בהחלט" / "שאלה מצוינת" / "בטח"
- נותן מספרים ועובדות, לא עצות כלליות
- אם שואלים מה יש היום — תן סיכום: משימות + הרגלים + תזכורות + אימון
- אם שואלים על פיננסים — תן מספרים מדויקים
- זוכר את כל השיחה
- מזכיר דברים חשובים שהמשתמש אולי שכח`

const NAV_KEYWORDS: Record<string, string[]> = {
  finance:   ['פיננסים','כסף','תקציב','הוצאות','הכנסות','עסקאות','חיסכון','משכורת'],
  workout:   ['אימון','אימונים','כושר','ספורט','חדר כושר','סטים','חזרות','תרגיל'],
  tasks:     ['משימות','משימה','לעשות','טודו','todo'],
  habits:    ['הרגלים','הרגל','streak','רצף'],
  reminders: ['תזכורות','תזכורת','להזכיר','תזכיר'],
  invest:    ['השקעות','השקעה','תיק','מניות','קריפטו','etf'],
  nutrition: ['תזונה','אוכל','מה לאכול','קלוריות','תפריט'],
}

export function detectNavIntent(text: string): string | null {
  const lower = text.toLowerCase()
  for (const [page, keywords] of Object.entries(NAV_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return page
  }
  return null
}

export async function askShimshon(
  messages: ShimshonMessage[],
  context: LifeContext
): Promise<string> {
  if (!GEMINI_KEY) return 'שמשון לא מחובר — הגדר VITE_GEMINI_API_KEY.'

  const ctx = buildContextString(context)
  const contents = [
    { role: 'user', parts: [{ text: SYSTEM + '\n\n' + ctx }] },
    { role: 'model', parts: [{ text: 'מוכן.' }] },
    ...messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }))
  ]

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig: { temperature: 0.7, maxOutputTokens: 500 } })
      }
    )
    if (!res.ok) throw new Error('Gemini error')
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'לא הצלחתי לעבד.'
  } catch {
    return 'שגיאה בתקשורת עם שמשון.'
  }
}

export async function getDailyBriefing(context: LifeContext): Promise<string> {
  if (!GEMINI_KEY) return ''
  const ctx = buildContextString(context)
  const prompt = `${SYSTEM}\n\n${ctx}\n\nכתוב ברייפינג בוקר קצר (2 משפטים בלבד) — מה הכי חשוב היום ומה לשים לב אליו.`
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 150 }
        })
      }
    )
    if (!res.ok) throw new Error()
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  } catch { return '' }
}

function buildContextString(c: LifeContext): string {
  const pendingTasks = c.todayTasks.filter(t => !t.done)
  const urgentTasks = pendingTasks.filter(t => t.priority === 'high')
  const doneHabits = c.todayHabits.filter(h => h.done).length
  const fmt = (n: number) => '₪' + Math.round(Math.abs(n)).toLocaleString('he-IL')

  return `הקשר נוכחי:
תאריך: ${c.date} (${c.dayOfWeek})
משימות פתוחות: ${pendingTasks.length} (${urgentTasks.length} דחופות) — ${pendingTasks.slice(0,5).map(t=>`[${t.priority}] ${t.title}`).join(', ') || 'אין'}
הרגלים היום: ${doneHabits}/${c.todayHabits.length} הושלמו — ${c.todayHabits.map(h=>`${h.done?'✓':'○'} ${h.name}`).join(', ') || 'אין'}
פיננסים החודש: הכנסות ${fmt(c.finance.monthIncome)} | הוצאות ${fmt(c.finance.monthExpenses)} | מאזן ${fmt(c.finance.monthBalance)}
אימון היום: ${c.workoutToday ? 'בוצע ✓' : 'לא בוצע'}
תזכורות היום: ${c.remindersToday.map(r=>`${r.time} ${r.text}`).join(', ') || 'אין'}`
}
