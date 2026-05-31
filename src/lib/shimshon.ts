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
- קצר וישיר. מקסימום 3 משפטים אלא אם מבקשים פירוט.
- לא אומר "כמובן" / "בהחלט" / "שאלה מצוינת"
- נותן מספרים ועובדות, לא עצות כלליות
- אם שואלים מה יש היום — תן סיכום: משימות + הרגלים + תזכורות + אימון
- אם שואלים על פיננסים — תן מספרים מדויקים`

const NAV_KEYWORDS: Record<string, string[]> = {
  finance:   ['פיננסים','כסף','תקציב','הוצאות','הכנסות','עסקאות','מאזן'],
  workout:   ['אימון','אימונים','כושר','ספורט','סטים','תרגיל','ריצה'],
  tasks:     ['משימות','משימה','לעשות','טודו'],
  habits:    ['הרגלים','הרגל','streak','רצף'],
  reminders: ['תזכורות','תזכורת','להזכיר'],
  invest:    ['השקעות','השקעה','מניות','תיק'],
  nutrition: ['תזונה','אוכל','קלוריות','תפריט','לאכול'],
  calendar:  ['לוח שנה','יומן','אירוע','פגישה'],
}

export function detectNavIntent(text: string): string | null {
  const lower = text
  for (const [page, keywords] of Object.entries(NAV_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return page
  }
  return null
}

// Simple in-memory cache for briefing (avoid re-fetching on every render)
let briefingCache: { value: string; ts: number } | null = null
const BRIEFING_TTL = 10 * 60 * 1000 // 10 minutes

// Retry with exponential backoff for 429
async function fetchWithRetry(body: object, retries = 2): Promise<Response> {
  let delay = 3000
  for (let i = 0; i <= retries; i++) {
    const res = await fetch('/api/shimshon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (res.status !== 429 || i === retries) return res
    await new Promise(r => setTimeout(r, delay))
    delay *= 2
  }
  throw new Error('Too many retries')
}

async function callAPI(messages: Array<{role: string, parts: Array<{text: string}>}>, systemPrompt: string): Promise<string> {
  try {
    const res = await fetchWithRetry({ messages, systemPrompt })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      if (res.status === 429) return 'הגעתי למגבלת הבקשות הרגעית. נסה שוב בעוד דקה.'
      return `שגיאה: ${err.error || res.statusText}`
    }
    const data = await res.json()
    return data.text || 'לא הצלחתי לעבד.'
  } catch (e: any) {
    return 'שגיאה בתקשורת עם שמשון.'
  }
}

export async function askShimshon(messages: ShimshonMessage[], context: LifeContext): Promise<string> {
  const ctx = buildContextString(context)
  const geminiMessages = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }))
  return callAPI(geminiMessages, SYSTEM + '\n\n' + ctx)
}

export async function getDailyBriefing(context: LifeContext): Promise<string> {
  // Return cached briefing if fresh
  if (briefingCache && Date.now() - briefingCache.ts < BRIEFING_TTL) {
    return briefingCache.value
  }

  const ctx = buildContextString(context)
  const prompt = `${SYSTEM}\n\n${ctx}\n\nכתוב ברייפינג בוקר קצר (2 משפטים בלבד) — מה הכי חשוב היום.`

  try {
    const res = await fetchWithRetry({
      messages: [{ role: 'user', parts: [{ text: 'ברייפינג' }] }],
      systemPrompt: prompt
    })
    if (!res.ok) return ''
    const data = await res.json()
    const text = data.text || ''
    briefingCache = { value: text, ts: Date.now() }
    return text
  } catch { return '' }
}

function buildContextString(c: LifeContext): string {
  const pendingTasks = c.todayTasks.filter(t => !t.done)
  const urgentTasks = pendingTasks.filter(t => t.priority === 'high')
  const doneHabits = c.todayHabits.filter(h => h.done).length
  const fmt = (n: number) => '₪' + Math.round(Math.abs(n)).toLocaleString('he-IL')

  return `הקשר:
תאריך: ${c.date} (${c.dayOfWeek})
משימות פתוחות: ${pendingTasks.length} (${urgentTasks.length} דחופות) — ${pendingTasks.slice(0,5).map(t=>`[${t.priority}] ${t.title}`).join(', ') || 'אין'}
הרגלים: ${doneHabits}/${c.todayHabits.length} הושלמו — ${c.todayHabits.map(h=>`${h.done?'✓':'○'} ${h.name}`).join(', ') || 'אין'}
פיננסים החודש: הכנסות ${fmt(c.finance.monthIncome)} | הוצאות ${fmt(c.finance.monthExpenses)} | מאזן ${c.finance.monthBalance >= 0 ? '+' : ''}${fmt(c.finance.monthBalance)}
אימון היום: ${c.workoutToday ? 'בוצע ✓' : 'לא בוצע'}
תזכורות: ${c.remindersToday.map(r=>`${r.time} ${r.text}`).join(', ') || 'אין'}`
}
