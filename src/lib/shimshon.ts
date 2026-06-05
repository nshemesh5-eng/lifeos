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

const SYSTEM = `אתה שמשון — ה-Life OS האישי של המשתמש. אתה עוזר חכם, ישיר ואמיתי.

אופי:
- עברית בלבד, תמיד
- קצר וישיר — 1-3 משפטים, אלא אם מבקשים פירוט מפורש
- לא אומר "כמובן" / "בהחלט" / "שאלה מצוינת" / "בטח"
- נותן מספרים ועובדות, לא עצות כלליות
- מדבר כמו חבר חכם, לא כמו bot

יכולות:
- יודע הכל על פיננסים, אימונים, משימות, הרגלים, תזכורות, השקעות
- מנתח דפוסים ומציע תובנות מהנתונים
- עוזר לתכנן ולתעדף
- יכול לנווט למסכים (יגיד "פתח: פיננסים" וכדומה)

כשנשאל על נתונים — ענה עם המספרים מהקשר שלמעלה.
כשנשאל שאלה כללית — ענה קצר ומדויק.`

const NAV_KEYWORDS: Record<string, string[]> = {
  finance:   ['פיננסים','כסף','תקציב','הוצאות','הכנסות','עסקאות','מאזן','חשבון'],
  workout:   ['אימון','אימונים','כושר','ספורט','סטים','תרגיל','ריצה','gym'],
  tasks:     ['משימות','משימה','לעשות','טודו','todo'],
  habits:    ['הרגלים','הרגל','streak','רצף'],
  reminders: ['תזכורות','תזכורת','להזכיר','אזכור'],
  invest:    ['השקעות','השקעה','מניות','תיק','פורטפוליו'],
  nutrition: ['תזונה','אוכל','קלוריות','תפריט','לאכול','מזון'],
  calendar:  ['לוח שנה','יומן','אירוע','פגישה','תאריך'],
}

export function detectNavIntent(text: string): string | null {
  const lower = text
  for (const [page, keywords] of Object.entries(NAV_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return page
  }
  return null
}

let briefingCache: { value: string; ts: number } | null = null
const BRIEFING_TTL = 15 * 60 * 1000

async function callAPI(
  messages: Array<{role: string, parts: Array<{text: string}>}>,
  systemPrompt: string,
  context?: any
): Promise<string> {
  try {
    const res = await fetch('/api/shimshon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, systemPrompt, context })
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      if (res.status === 429) return '⏳ יותר מדי בקשות — נסה שוב בעוד רגע.'
      if (res.status === 500) return '🔧 שמשון זמנית לא זמין.'
      return `שגיאה: ${err.error || res.statusText}`
    }

    const data = await res.json()
    return data.text || '...'
  } catch (e: any) {
    return '❌ שגיאת תקשורת. בדוק חיבור אינטרנט.'
  }
}

export async function askShimshon(
  messages: ShimshonMessage[],
  context: LifeContext
): Promise<string> {
  const geminiMessages = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }))
  // Send both system prompt and context to server — Claude will use full context
  return callAPI(geminiMessages, SYSTEM, context as any)
}

export async function getDailyBriefing(context: LifeContext): Promise<string> {
  if (briefingCache && Date.now() - briefingCache.ts < BRIEFING_TTL) {
    return briefingCache.value
  }

  const ctx = buildContextString(context)
  const prompt = `${SYSTEM}\n\n${ctx}\n\nכתוב ברייפינג בוקר קצר (2 משפטים בלבד) — מה הכי חשוב היום. ישיר, עם מספרים.`

  try {
    const res = await fetch('/api/shimshon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', parts: [{ text: 'ברייפינג' }] }],
        systemPrompt: prompt
      })
    })
    if (!res.ok) return ''
    const data = await res.json()
    const text = data.text || ''
    if (text) briefingCache = { value: text, ts: Date.now() }
    return text
  } catch { return '' }
}

function buildContextString(c: LifeContext): string {
  const pending = c.todayTasks.filter(t => !t.done)
  const urgent = pending.filter(t => t.priority === 'high')
  const doneHabits = c.todayHabits.filter(h => h.done).length
  const fmt = (n: number) => '₪' + Math.round(Math.abs(n)).toLocaleString('he-IL')
  const sign = c.finance.monthBalance >= 0 ? '+' : '-'

  return `=== נתוני המשתמש ===
📅 היום: ${c.date} (${c.dayOfWeek})
✅ משימות: ${pending.length} פתוחות (${urgent.length} דחופות)${pending.length > 0 ? ' — ' + pending.slice(0,4).map(t => t.title).join(', ') : ''}
🔄 הרגלים: ${doneHabits}/${c.todayHabits.length} הושלמו${c.todayHabits.length > 0 ? ' — ' + c.todayHabits.map(h=>`${h.done?'✓':'○'} ${h.name}`).join(', ') : ''}
💰 פיננסים החודש: הכנסות ${fmt(c.finance.monthIncome)} | הוצאות ${fmt(c.finance.monthExpenses)} | מאזן ${sign}${fmt(c.finance.monthBalance)}
🏋 אימון היום: ${c.workoutToday ? '✓ בוצע' : '✗ לא בוצע'}
⏰ תזכורות: ${c.remindersToday.length > 0 ? c.remindersToday.map(r=>`${r.time} ${r.text}`).join(', ') : 'אין'}`
}
