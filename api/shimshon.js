// שמשון AI — Gemini REST with AQ. key support
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
    return res.status(500).json({ text: 'שמשון לא מוגדר — חסר API key ב-Vercel', provider: 'error' })
  }

  const { messages = [], systemPrompt = '', context = null, source = 'app' } = req.body || {}
  const fullSystem = buildSystem(systemPrompt, context, source)
  const recent = messages.slice(-20)

  // ── 1. Try Anthropic Claude (if key exists) ────────────────────
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

  // ── 2. Gemini REST — both key formats ─────────────────────────
  if (geminiKey) {
    const contents = [
      { role: 'user', parts: [{ text: fullSystem }] },
      { role: 'model', parts: [{ text: 'מוכן.' }] },
      ...recent
    ]
    const genConfig = { temperature: 0.8, maxOutputTokens: 800 }
    const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b']
    
    // Try both auth methods — AQ. keys use x-goog-api-key header, AIzaSy use ?key= param
    for (const model of models) {
      for (const authMethod of ['header', 'param']) {
        try {
          const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
          const url = authMethod === 'param' ? `${baseUrl}?key=${geminiKey}` : baseUrl
          const headers = { 'Content-Type': 'application/json' }
          if (authMethod === 'header') headers['x-goog-api-key'] = geminiKey

          const r = await fetch(url, {
            method: 'POST', headers,
            body: JSON.stringify({ contents, generationConfig: genConfig }),
            signal: AbortSignal.timeout(10000)
          })
          const d = await r.json()
          
          if (r.status === 429) break // rate limit — try next model
          if (r.status === 400 || r.status === 401 || r.status === 403) continue // try other auth
          if (!r.ok) continue
          
          const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
          if (text) return res.status(200).json({ text, provider: 'gemini', model })
        } catch { continue }
      }
    }
  }

  // ── 3. Smart fallback responses ────────────────────────────────
  const fallbacks = [
    'שמשון עובד אבל ה-AI לא זמין כרגע. בדוק את ה-API key ב-Vercel Settings → Environment Variables.',
    'ה-Gemini key לא מוגדר נכון. עבור ל-Vercel → Settings → Environment Variables → VITE_GEMINI_API_KEY.',
  ]
  return res.status(200).json({ 
    text: fallbacks[0], 
    provider: 'fallback',
    debug: { hasGemini: !!geminiKey, hasClaude: !!anthropicKey }
  })
}

function buildSystem(base, ctx, source) {
  const isMobile = source === 'whatsapp'
  const systemBase = base || DEFAULT_SYSTEM
  if (!ctx) return systemBase

  const {
    userName='', date='', dayOfWeek='', hour=new Date().getHours(),
    todayFood=[], todayCalories=0, todayProtein=0, targetCal=2000, targetProtein=150,
    finance={}, workout={}, recentWorkouts=[],
    todayTasks=[], urgentTasks=[], todayHabits=[],
    todayEvents=[], upcomingEvents=[], todayReminders=[], goals=[],
  } = ctx

  const greeting = hour < 12 ? 'בוקר' : hour < 17 ? 'צהריים' : hour < 21 ? 'ערב' : 'לילה'
  const calPct = Math.round((todayCalories / targetCal) * 100)
  const doneHabits = todayHabits.filter(h => h.done).length
  const pendingTasks = todayTasks.filter(t => !t.done).length

  return systemBase + `
════════════════════════════════════
📊 CONTEXT — ${dayOfWeek}, ${date} | ${greeting}
════════════════════════════════════
👤 ${userName || 'נתנאל'} | ${greeting} טוב!
🥗 תזונה: ${todayCalories}/${targetCal} קל' (${calPct}%) | חלבון ${Math.round(todayProtein)}g/${targetProtein}g
💰 פיננסים: +${(finance.income||0).toLocaleString()}₪ | -${(finance.expenses||0).toLocaleString()}₪ | ${(finance.balance>=0?'+':'')}${(finance.balance||0).toLocaleString()}₪
🏋 כושר: ${workout.today?'✓ אמן היום':'✗ לא אמן'} | streak ${workout.streak||0}
✅ משימות: ${pendingTasks} פתוחות${urgentTasks.length>0?' | דחוף: '+urgentTasks.slice(0,2).map(t=>t.title).join(', '):''}
🔄 הרגלים: ${doneHabits}/${todayHabits.length}
════════════════════════════════════` + (isMobile ? '\nWhatsApp: ללא markdown, קצר.' : '')
}

const DEFAULT_SYSTEM = `אתה שמשון — ה-Life OS האישי. עוזר חכם שיודע הכל על חייו של המשתמש.
- ענה תמיד בעברית
- קצר (1-3 משפטים) אלא אם מבקשים פירוט
- השתמש במספרים ועובדות
- דבר כמו חבר חכם שמכיר אותך`
