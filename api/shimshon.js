// שמשון AI — Claude primary + Gemini fallback
// הגבלות: 50 שיחות ליום per user, max 500 tokens per response

export default async function handler(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || 'https://lifeos-eight-inky.vercel.app'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const geminiKey    = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY

  if (!anthropicKey && !geminiKey) {
    return res.status(200).json({ text: 'שמשון לא מוגדר — חסר API key', provider: 'error' })
  }

  // ── Daily rate limit (50 calls/day per IP) ──────────────────────
  const DAILY_LIMIT = 50
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown'
  const today = new Date().toISOString().split('T')[0]
  const limitKey = `shimshon_calls_${today}_${ip}`

  // Simple in-memory counter (resets on cold start — good enough for daily limit)
  if (!global._shimshonCounts) global._shimshonCounts = {}
  global._shimshonCounts[limitKey] = (global._shimshonCounts[limitKey] || 0) + 1
  const callCount = global._shimshonCounts[limitKey]

  if (callCount > DAILY_LIMIT) {
    return res.status(429).json({
      text: `הגעת למגבלת ${DAILY_LIMIT} שיחות ליום עם שמשון. הלמיט מתאפס בחצות. 🕛`,
      provider: 'limit',
      remaining: 0
    })
  }

  const { messages = [], systemPrompt = '', context = null, source = 'app' } = req.body || {}
  const recent = (messages || []).slice(-10)  // max 10 הודעות אחרונות
  const fullSystem = buildSystem(systemPrompt, context, source)
  const remaining = DAILY_LIMIT - callCount

  // ── 1. Claude Haiku (primary) ───────────────────────────────────
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
          max_tokens: 500,  // ~$0.002 per call → $5 = 2,500 calls
          system: fullSystem,
          messages: recent.map(m => ({
            role: m.role === 'model' ? 'assistant' : 'user',
            content: m.parts?.[0]?.text || m.content || ''
          })).filter(m => m.content)
        })
      })
      const d = await r.json()
      if (r.ok && d.content?.[0]?.text) {
        return res.status(200).json({
          text: d.content[0].text.trim(),
          provider: 'claude',
          remaining
        })
      }
    } catch (e) {}
  }

  // ── 2. Gemini fallback ──────────────────────────────────────────
  if (geminiKey) {
    const contents = [
      { role: 'user', parts: [{ text: fullSystem }] },
      { role: 'model', parts: [{ text: 'מוכן.' }] },
      ...recent
    ]
    for (const model of ['gemini-2.0-flash', 'gemini-1.5-flash']) {
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              generationConfig: { temperature: 0.8, maxOutputTokens: 500 }
            }),
            signal: AbortSignal.timeout(12000)
          }
        )
        const d = await r.json()
        if (r.ok) {
          const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
          if (text) return res.status(200).json({ text, provider: 'gemini', model, remaining })
        }
      } catch {}
    }
  }

  return res.status(200).json({
    text: 'שמשון לא זמין כרגע. נסה שוב עוד רגע.',
    provider: 'fallback',
    remaining
  })
}

function buildSystem(base, ctx, source) {
  const isMobile = source === 'whatsapp'
  const sys = base || DEFAULT_SYSTEM
  if (!ctx) return sys

  const {
    userName='', date='', dayOfWeek='', hour=new Date().getHours(),
    todayCalories=0, todayProtein=0, targetCal=2000, targetProtein=150,
    finance={}, workout={}, todayTasks=[], urgentTasks=[], todayHabits=[]
  } = ctx

  const greeting = hour < 12 ? 'בוקר' : hour < 17 ? 'צהריים' : hour < 21 ? 'ערב' : 'לילה'
  const calPct = Math.round((todayCalories / targetCal) * 100)
  const bal = finance?.balance ?? finance?.monthBalance ?? 0

  return sys + `
════════════════════════════════════
📊 ${dayOfWeek}, ${date} | ${greeting} טוב ${userName}!
🥗 תזונה: ${todayCalories}/${targetCal}קל (${calPct}%) | חלבון ${Math.round(todayProtein)}/${targetProtein}g
💰 מאזן חודשי: ${bal>=0?'+':''}₪${Number(bal).toLocaleString()}
🏋 כושר: ${workout?.today?'✓ אמן':'✗ לא אמן'} | streak ${workout?.streak||0}
✅ משימות: ${(todayTasks||[]).filter(t=>!t.done).length} פתוחות${urgentTasks?.length?' | דחוף: '+urgentTasks.slice(0,2).map(t=>t.title).join(', '):''}
🔄 הרגלים: ${(todayHabits||[]).filter(h=>h.done).length}/${(todayHabits||[]).length}
   ${(todayHabits||[]).map(h=>(h.done?'✅':'⬜')+' '+h.name).join(' | ')}
✅ משימות פתוחות:
   ${(todayTasks||[]).slice(0,5).map(t=>'• '+t.title+(t.priority==='high'?' 🔴':'')).join('\n   ')}${(todayTasks||[]).length>5?'\n   ...ועוד '+((todayTasks||[]).length-5):''}
════════════════════════════════════` + (isMobile ? '\nWhatsApp: ללא markdown, קצר.' : '')
}

const DEFAULT_SYSTEM = `אתה שמשון — ה-Life OS האישי של המשתמש. עוזר חכם שמכיר את חייו לעומק.
כללים:
- ענה תמיד בעברית
- קצר (1-3 משפטים) אלא אם מבקשים פירוט
- השתמש במספרים ועובדות מה-context
- דבר כמו חבר חכם שמכיר אותך — לא כמו רובוט
- אל תתחיל ב"כמובן" / "בהחלט" / "אשמח"`
