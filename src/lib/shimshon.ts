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

const SHIMSHON_SYSTEM = `אתה שמשון — העוזר האישי החכם של המשתמש.
אתה יודע הכל על החיים שלו: פיננסים, אימונים, תזונה, משימות, לוח שנה, הרגלים, תזכורות.

כללי תגובה:
- עברית בלבד
- קצר וישיר — מקסימום 3-4 משפטים אלא אם מבקשים פירוט
- חכם ומקצועי, לא מלאכותי
- לא אומר "כמובן" / "בהחלט" / "שאלה מצוינת"
- נותן מספרים ועובדות, לא רק עצות כלליות
- מזכיר דברים רלוונטיים ליום גם בלי לשאול
- קורא למשתמש בשמו אם ידוע

כשמשתמש שואל מה יש היום — תן סיכום קצר: משימות, אימון, פגישות, תזכורות.
כשמשתמש מבקש להוסיף משהו — אשר בקצרה ועשה.
כשיש חריגה תקציבית — ציין אותה ישירות.`

export async function askShimshon(
  messages: ShimshonMessage[],
  context: LifeContext
): Promise<string> {
  if (!GEMINI_KEY) {
    return 'שמשון לא מחובר — הגדר VITE_GEMINI_API_KEY.'
  }

  const contextStr = `
הקשר נוכחי:
תאריך: ${context.date} (${context.dayOfWeek})
משימות היום: ${context.todayTasks.length > 0
    ? context.todayTasks.map(t => `${t.done ? '✓' : '○'} ${t.title} [${t.priority}]`).join(', ')
    : 'אין'}
הרגלים: ${context.todayHabits.length > 0
    ? context.todayHabits.map(h => `${h.done ? '✓' : '○'} ${h.name}`).join(', ')
    : 'אין'}
פיננסים החודש: הכנסות ₪${context.finance.monthIncome.toLocaleString()} | הוצאות ₪${context.finance.monthExpenses.toLocaleString()} | מאזן ₪${context.finance.monthBalance.toLocaleString()}
אימון היום: ${context.workoutToday ? 'כן' : 'לא'}
תזכורות היום: ${context.remindersToday.length > 0
    ? context.remindersToday.map(r => `${r.time} ${r.text}`).join(', ')
    : 'אין'}
`

  const geminiMessages = [
    {
      role: 'user',
      parts: [{ text: SHIMSHON_SYSTEM + '\n\n' + contextStr + '\n\nשיחה:' }]
    },
    { role: 'model', parts: [{ text: 'מוכן.' }] },
    ...messages.flatMap(m => ([{
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }]))
  ]

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
        })
      }
    )

    if (!res.ok) throw new Error('Gemini error')
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'לא הצלחתי לעבד את הבקשה.'
  } catch {
    return 'שגיאה בתקשורת עם שמשון. בדוק חיבור.'
  }
}

export async function getDailyBriefing(context: LifeContext): Promise<string> {
  if (!GEMINI_KEY) return ''

  const prompt = `${SHIMSHON_SYSTEM}

הקשר:
תאריך: ${context.date} (${context.dayOfWeek})
משימות: ${context.todayTasks.map(t => `${t.done ? '✓' : '○'} ${t.title}`).join(', ') || 'אין'}
הרגלים: ${context.todayHabits.map(h => `${h.done ? '✓' : '○'} ${h.name}`).join(', ') || 'אין'}
פיננסים: הכנסות ₪${context.finance.monthIncome.toLocaleString()} | הוצאות ₪${context.finance.monthExpenses.toLocaleString()}
אימון היום: ${context.workoutToday ? 'כן' : 'לא'}
תזכורות: ${context.remindersToday.map(r => `${r.time} ${r.text}`).join(', ') || 'אין'}

כתוב ברייפינג בוקר קצר (2-3 משפטים) — מה חשוב היום, מה לשים לב אליו.`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 200 }
        })
      }
    )
    if (!res.ok) throw new Error()
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
  } catch {
    return ''
  }
}
