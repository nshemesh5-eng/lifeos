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
- אם שואלים על פיננסים — תן מספרים מדויקים`

const NAV_KEYWORDS: Record<string, string[]> = {
  finance:   ['פיננסים','כסף','תקציב','הוצאות','הכנסות','עסקאות'],
  workout:   ['אימון','אימונים','כושר','ספורט','סטים','תרגיל'],
  tasks:     ['משימות','משימה','לעשות'],
  habits:    ['הרגלים','הרגל','streak'],
  reminders: ['תזכורות','תזכורת'],
  invest:    ['השקעות','השקעה','מניות'],
  nutrition: ['תזונה','אוכל','קלוריות','תפריט'],
  calendar:  ['לוח שנה','יומן','אירוע'],
}

export function detectNavIntent(text: string): string | null {
  const lower = text.toLowerCase()
  for (const [page, keywords] of Object.entries(NAV_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return page
  }
  return null
}

async function callGemini(messages: Array<{role: string, parts: Array<{text: string}>}>, systemPrompt: string): Promise<string> {
  // Call via our server-side API route (no CORS/allowlist issues)
  try {
    const res = await fetch('/api/shimshon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, systemPrompt })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('Shimshon API error:', err)
      return `שגיאה: ${err.error || res.statusText}`
    }
    const data = await res.json()
    return data.text || 'לא הצלחתי לעבד.'
  } catch (e) {
    console.error('Shimshon fetch error:', e)
    return 'שגיאה בתקשורת עם שמשון.'
  }
}

export async function askShimshon(messages: ShimshonMessage[], context: LifeContext): Promise<string> {
  const ctx = buildContextString(context)
  const geminiMessages = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }))
  return callGemini(geminiMessages, SYSTEM + '\n\n' + ctx)
}

export async function getDailyBriefing(context: LifeContext): Promise<string> {
  const ctx = buildContextString(context)
  const prompt = `${SYSTEM}\n\n${ctx}\n\nכתוב ברייפינג בוקר קצר (2 משפטים בלבד) — מה הכי חשוב היום ומה לשים לב אליו.`
  try {
    const res = await fetch('/api/shimshon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', parts: [{ text: 'ברייפינג בוקר' }] }],
        systemPrompt: prompt
      })
    })
    if (!res.ok) return ''
    const data = await res.json()
    return data.text || ''
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
