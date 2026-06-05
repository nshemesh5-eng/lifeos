export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const geminiKey    = process.env.VITE_GEMINI_API_KEY
  const { messages = [], systemPrompt = '', context = null } = req.body || {}
  const recent = messages.slice(-16)

  // Build full system with life context if provided
  const fullSystem = context
    ? buildSystemWithContext(systemPrompt, context)
    : (systemPrompt || DEFAULT_SYSTEM)

  // ── 1. Try Anthropic Claude Haiku ─────────────────────────────
  if (anthropicKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system: fullSystem,
          messages: recent.map(m => ({
            role: m.role === 'model' ? 'assistant' : 'user',
            content: m.parts?.[0]?.text || m.content || ''
          })).filter(m => m.content)
        })
      })
      const d = await r.json()
      if (r.ok && d.content?.[0]?.text) {
        return res.status(200).json({ text: d.content[0].text.trim(), provider: 'claude' })
      }
    } catch {}
  }

  // ── 2. Fallback: Gemini ────────────────────────────────────────
  if (!geminiKey) return res.status(500).json({ error: 'שמשון לא מוגדר — חסר API key' })

  const contents = [
    { role: 'user', parts: [{ text: fullSystem }] },
    { role: 'model', parts: [{ text: 'מוכן.' }] },
    ...recent
  ]

  const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b']
  const isNewKey = geminiKey.startsWith('AQ.')

  for (const model of models) {
    try {
      const url = isNewKey
        ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
        : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`
      const headers = { 'Content-Type': 'application/json' }
      if (isNewKey) headers['x-goog-api-key'] = geminiKey

      const r = await fetch(url, {
        method: 'POST', headers,
        body: JSON.stringify({ contents, generationConfig: { temperature: 0.75, maxOutputTokens: 800 } })
      })
      const d = await r.json()
      if (r.status === 429) continue
      if (!r.ok) continue
      const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      if (text) return res.status(200).json({ text, provider: 'gemini', model })
    } catch { continue }
  }

  return res.status(200).json({ text: 'שמשון עמוס כרגע — נסה שוב בעוד רגע.', provider: 'fallback' })
}

// ── System prompt with full life context ──────────────────────────────────
function buildSystemWithContext(base, ctx) {
  const {
    date, dayOfWeek,
    todayFood = [], todayCalories = 0, todayProtein = 0, targetCal = 2000, targetProtein = 150,
    todayTasks = [], todayHabits = [],
    finance = {},
    workout = {},
    reminders = [],
    recentWorkouts = [],
    userName = ''
  } = ctx

  const pendingTasks = todayTasks.filter(t => !t.done)
  const urgentTasks = pendingTasks.filter(t => t.priority === 'high')
  const doneHabits = todayHabits.filter(h => h.done).length
  const calPct = Math.round((todayCalories / targetCal) * 100)
  const protPct = Math.round((todayProtein / targetProtein) * 100)

  return `${base || DEFAULT_SYSTEM}

═══════════════════════════════════════
📊 נתוני חיים — עדכני לעכשיו
═══════════════════════════════════════
👤 משתמש: ${userName || 'נתנאל'} | 📅 ${dayOfWeek}, ${date}

🥗 תזונה היום:
  קלוריות: ${todayCalories}/${targetCal} (${calPct}%)
  חלבון: ${Math.round(todayProtein)}g / ${targetProtein}g (${protPct}%)
  ${todayFood.length > 0 ? 'ארוחות: ' + todayFood.map(f => `${f.food} (${f.calories}קל')`).join(', ') : 'לא נרשמו ארוחות'}

💰 פיננסים החודש:
  הכנסות: ₪${(finance.income||0).toLocaleString()}
  הוצאות: ₪${(finance.expenses||0).toLocaleString()}
  מאזן: ${finance.balance >= 0 ? '+' : ''}₪${(finance.balance||0).toLocaleString()}
  ${finance.topCategory ? 'קטגוריה גדולה: ' + finance.topCategory : ''}

🏋 כושר:
  ${workout.today ? '✓ אמן היום: ' + (workout.todayType || '') : '✗ לא אמן היום'}
  Streak: ${workout.streak || 0} ימים | חודש: ${workout.monthCount || 0} אימונים
  ${recentWorkouts.length > 0 ? 'אחרון: ' + recentWorkouts[0] : ''}

✅ משימות: ${pendingTasks.length} פתוחות (${urgentTasks.length} דחופות)
  ${urgentTasks.length > 0 ? 'דחופות: ' + urgentTasks.slice(0,3).map(t=>t.title).join(', ') : ''}

🔄 הרגלים: ${doneHabits}/${todayHabits.length} ✓
  ${todayHabits.map(h => (h.done ? '✓' : '○') + ' ' + h.name).join(' | ')}

⏰ תזכורות היום: ${reminders.length > 0 ? reminders.map(r => r.time + ' ' + r.text).join(', ') : 'אין'}
═══════════════════════════════════════`
}

const DEFAULT_SYSTEM = `אתה שמשון — ה-Life OS האישי. אתה עוזר חכם, ישיר, בעברית בלבד.
- קצר (1-3 משפטים) אלא אם מבקשים פירוט
- נותן מספרים ועובדות, לא עצות כלליות
- לא אומר "כמובן" / "בהחלט" / "שאלה מצוינת"
- מדבר כמו חבר חכם`
