export default async function handler(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || 'https://lifeos-eight-inky.vercel.app'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const geminiKey    = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  if (!geminiKey && !anthropicKey) {
    return res.status(200).json({ text: 'אין API key מוגדר', provider: 'error', debug: { hasGemini: false, hasClaude: false } })
  }

  const { messages = [], systemPrompt = '', context = null, source = 'app' } = req.body || {}
  const fullSystem = buildSystem(systemPrompt, context, source)
  const recent = messages.slice(-20)
  const errors = []

  // ── 1. Anthropic Claude ────────────────────────────────────────
  if (anthropicKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
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
      errors.push(`claude:${r.status}:${d.error?.message||''}`)
    } catch(e) { errors.push(`claude:${e.message}`) }
  }

  // ── 2. Gemini REST ─────────────────────────────────────────────
  if (geminiKey) {
    const contents = [
      { role: 'user', parts: [{ text: fullSystem }] },
      { role: 'model', parts: [{ text: 'מוכן.' }] },
      ...recent
    ]
    const models = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro']
    
    for (const model of models) {
      // Try both auth methods
      for (const method of ['param', 'header']) {
        try {
          const apiVersion = 'v1beta' // all models work with v1beta
          const url = method === 'param'
            ? `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${geminiKey}`
            : `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent`
          const headers = { 'Content-Type': 'application/json' }
          if (method === 'header') headers['x-goog-api-key'] = geminiKey

          const r = await fetch(url, {
            method: 'POST', headers,
            body: JSON.stringify({
              contents,
              generationConfig: { temperature: 0.8, maxOutputTokens: 800 }
            }),
            signal: AbortSignal.timeout(12000)
          })
          
          const rawText = await r.text()
          
          if (r.status === 429) { errors.push(`${model}:${method}:429:ratelimit`); continue }
          if (!r.ok) { errors.push(`${model}:${method}:${r.status}:${rawText.substring(0,100)}`); continue }
          
          const d = JSON.parse(rawText)
          const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
          if (text) return res.status(200).json({ text, provider: 'gemini', model })
          errors.push(`${model}:${method}:no_text`)
        } catch(e) { errors.push(`${model}:${method}:${e.message?.substring(0,50)}`) }
      }
    }
  }

  return res.status(200).json({
    text: 'שמשון עובד אבל ה-AI לא זמין כרגע.',
    provider: 'fallback',
    debug: { hasGemini: !!geminiKey, hasClaude: !!anthropicKey, errors }
  })
}

function buildSystem(base, ctx, source) {
  const isMobile = source === 'whatsapp'
  const systemBase = base || DEFAULT_SYSTEM
  if (!ctx) return systemBase

  const {
    userName='', date='', dayOfWeek='', hour=new Date().getHours(),
    todayCalories=0, todayProtein=0, targetCal=2000, targetProtein=150,
    todayFood=[], finance={}, workout={},
    todayTasks=[], urgentTasks=[], todayHabits=[],
    todayEvents=[], goals=[], todayReminders=[],
  } = ctx

  const greeting = hour < 12 ? 'בוקר' : hour < 17 ? 'צהריים' : hour < 21 ? 'ערב' : 'לילה'
  const calPct = Math.round((todayCalories / targetCal) * 100)
  const doneHabits = (todayHabits || []).filter(h => h.done).length
  const pending = (todayTasks || []).filter(t => !t.done).length
  const bal = finance?.balance ?? finance?.monthBalance ?? 0

  return systemBase + `
════════════════════════════════════
📊 CONTEXT — ${dayOfWeek}, ${date} | ${greeting} טוב!
🥗 תזונה: ${todayCalories}/${targetCal} קל' (${calPct}%) | חלבון ${Math.round(todayProtein)}g/${targetProtein}g
💰 פיננסים: ${bal >= 0 ? '+' : ''}₪${Number(bal).toLocaleString()}
🏋 כושר: ${workout?.today ? '✓ אמן' : '✗ לא אמן'} | streak ${workout?.streak || 0}
✅ משימות: ${pending} פתוחות
🔄 הרגלים: ${doneHabits}/${(todayHabits||[]).length}
════════════════════════════════════` + (isMobile ? '\nWhatsApp: ללא markdown, קצר.' : '')
}

const DEFAULT_SYSTEM = `אתה שמשון — ה-Life OS האישי. עוזר חכם שיודע הכל על חייו של המשתמש.
- ענה תמיד בעברית
- קצר (1-3 משפטים) אלא אם מבקשים פירוט
- השתמש במספרים ועובדות
- דבר כמו חבר חכם שמכיר אותך`
