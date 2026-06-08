// שמשון AI — Gemini primary + Claude fallback + full life context + rate limiting
export default async function handler(req, res) {
  const origin = req.headers.origin || req.headers.referer || ''
  const allowed = process.env.ALLOWED_ORIGIN || 'https://lifeos-eight-inky.vercel.app'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const geminiKey    = process.env.VITE_GEMINI_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!geminiKey && !anthropicKey) return res.status(500).json({ error: 'No AI key configured' })

  const { messages = [], systemPrompt = '', context = null, source = 'app' } = req.body || {}

  // Build full system prompt with life context
  const fullSystem = buildSystem(systemPrompt, context, source)
  const recent = messages.slice(-20)

  // ── 1. Try Gemini (free 3 months, primary) ────────────────────
  if (geminiKey) {
    const contents = [
      { role:'user', parts:[{ text: fullSystem }] },
      { role:'model', parts:[{ text:'מוכן לעזור.' }] },
      ...recent
    ]

    const models = ['gemini-2.0-flash','gemini-1.5-flash','gemini-1.5-flash-8b']
    const isNewKey = geminiKey.startsWith('AQ.')

    for (const model of models) {
      try {
        const url = isNewKey
          ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
          : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`
        const headers = { 'Content-Type':'application/json' }
        if (isNewKey) headers['x-goog-api-key'] = geminiKey

        const r = await fetch(url, {
          method:'POST', headers,
          body: JSON.stringify({
            contents,
            generationConfig: { temperature:0.8, maxOutputTokens:800, topP:0.95 },
            safetySettings: [
              { category:'HARM_CATEGORY_HARASSMENT', threshold:'BLOCK_ONLY_HIGH' },
              { category:'HARM_CATEGORY_HATE_SPEECH', threshold:'BLOCK_ONLY_HIGH' },
            ]
          })
        })
        const d = await r.json()
        if (r.status === 429) continue
        if (!r.ok) continue
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (text) return res.status(200).json({ text, provider:'gemini', model })
      } catch { continue }
    }
  }

  // ── 2. Claude Haiku fallback ───────────────────────────────────
  if (anthropicKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers: { 'Content-Type':'application/json', 'x-api-key':anthropicKey, 'anthropic-version':'2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system: fullSystem,
          messages: recent.map(m => ({
            role: m.role==='model' ? 'assistant' : 'user',
            content: m.parts?.[0]?.text || m.content || ''
          })).filter(m=>m.content)
        })
      })
      const d = await r.json()
      if (r.ok && d.content?.[0]?.text) {
        return res.status(200).json({ text: d.content[0].text.trim(), provider:'claude' })
      }
    } catch {}
  }

  return res.status(200).json({ text:'שמשון עמוס כרגע — נסה שוב בעוד רגע.', provider:'fallback' })
}

// ── Build comprehensive system prompt ─────────────────────────────────────
function buildSystem(base, ctx, source) {
  const isMobile = source === 'whatsapp' || source === 'mobile'
  const systemBase = base || DEFAULT_SYSTEM

  if (!ctx) return systemBase

  const {
    userName='', date='', dayOfWeek='', hour=new Date().getHours(),
    // Nutrition
    todayFood=[], todayCalories=0, todayProtein=0, targetCal=2000, targetProtein=150,
    // Finance
    finance={},
    // Workout
    workout={}, recentWorkouts=[],
    // Tasks
    todayTasks=[], urgentTasks=[],
    // Habits
    todayHabits=[],
    // Calendar
    todayEvents=[], upcomingEvents=[],
    // Reminders
    todayReminders=[],
    // Goals
    goals=[],
    // User profile
    profile={},
  } = ctx

  const greeting = hour < 12 ? 'בוקר' : hour < 17 ? 'צהריים' : hour < 21 ? 'ערב' : 'לילה'
  const calPct = Math.round((todayCalories / targetCal) * 100)
  const protPct = Math.round((todayProtein / targetProtein) * 100)
  const doneHabits = todayHabits.filter(h=>h.done).length
  const pendingTasks = todayTasks.filter(t=>!t.done).length

  const context = `
════════════════════════════════════════════
📊 CONTEXT — ${dayOfWeek}, ${date} | ${greeting}
════════════════════════════════════════════
👤 ${userName || 'המשתמש'} | ${greeting} טוב!

🥗 תזונה היום:
  ${todayCalories}/${targetCal} קל' (${calPct}%) | ${Math.round(todayProtein)}g/${targetProtein}g חלבון (${protPct}%)
  ${todayFood.length > 0 
    ? todayFood.map(f=>`${f.meal}: ${f.food} (${f.calories}קל')`).join(' | ')
    : 'טרם נרשמו ארוחות'}

💰 פיננסים חודש נוכחי:
  הכנסות ${(finance.income||0).toLocaleString()}₪ | הוצאות ${(finance.expenses||0).toLocaleString()}₪
  מאזן: ${finance.balance>=0?'+':''}${(finance.balance||0).toLocaleString()}₪
  ${finance.topCategory ? `קטגוריה גדולה: ${finance.topCategory}` : ''}

🏋 כושר:
  ${workout.today ? `✓ אמן היום (${workout.todayType||''})` : '✗ לא אמן היום'}
  Streak: ${workout.streak||0} ימים | חודש: ${workout.monthCount||0} אימונים
  ${recentWorkouts[0] ? `אחרון: ${recentWorkouts[0]}` : ''}

📅 לוח שנה היום:
  ${todayEvents.length > 0 ? todayEvents.map(e=>`${e.time} ${e.title}`).join(' | ') : 'אין אירועים היום'}
  ${upcomingEvents.length > 0 ? `קרוב: ${upcomingEvents[0].title} (${upcomingEvents[0].date})` : ''}

✅ משימות: ${pendingTasks} פתוחות
  ${urgentTasks.length > 0 ? `דחוף: ${urgentTasks.slice(0,3).map(t=>t.title).join(', ')}` : 'אין דחופות'}

🔄 הרגלים: ${doneHabits}/${todayHabits.length} ✓
  ${todayHabits.map(h=>(h.done?'✓':'○')+' '+h.name).join(' | ')}

⏰ תזכורות: ${todayReminders.length > 0 ? todayReminders.map(r=>r.time+' '+r.text).join(', ') : 'אין'}

🎯 יעדים פעילים: ${goals.length > 0 ? goals.map(g=>g.title).join(', ') : 'אין יעדים פעילים'}
════════════════════════════════════════════`

  return systemBase + context + (isMobile ? '\n\nהפלט הוא WhatsApp — ללא markdown, ללא כוכביות, ללא רשימות מסובכות. פשוט ועברית.' : '')
}

const DEFAULT_SYSTEM = `אתה שמשון — ה-Life OS האישי. עוזר חכם שיודע הכל על חייו של המשתמש.

כללים:
- ענה תמיד בעברית
- קצר וישיר (1-3 משפטים) אלא אם מבקשים פירוט
- השתמש במספרים ועובדות, לא עצות כלליות
- אל תתחיל ב"כמובן" / "בהחלט" / "שאלה מצוינת"
- דבר כמו חבר חכם שמכיר אותך
- כשאתה מנתח — ציין מה טוב ומה צריך שיפור
- בניית לוז: שאל על העדפות ואז הצע תוכנית ספציפית עם שעות`
