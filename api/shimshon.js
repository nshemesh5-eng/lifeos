// שמשון AI — Gemini via SDK (supports AQ. keys) + Claude fallback + full life context
export default async function handler(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || 'https://lifeos-eight-inky.vercel.app'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const geminiKey    = process.env.VITE_GEMINI_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  const { messages = [], systemPrompt = '', context = null, source = 'app' } = req.body || {}
  const fullSystem = buildSystem(systemPrompt, context, source)
  const recent = messages.slice(-20)

  // ── 1. Gemini via @google/generative-ai SDK (supports AQ. keys) ──
  if (geminiKey) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai')
      const genAI = new GoogleGenerativeAI(geminiKey)
      
      const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b']
      
      for (const modelName of models) {
        try {
          const model = genAI.getGenerativeModel({ 
            model: modelName,
            systemInstruction: fullSystem,
            generationConfig: { temperature: 0.8, maxOutputTokens: 800 }
          })
          
          // Build history (all except last message)
          const history = recent.slice(0, -1).map(m => ({
            role: m.role === 'model' ? 'model' : 'user',
            parts: m.parts || [{ text: m.content || '' }]
          })).filter(m => m.parts[0]?.text)
          
          const lastMsg = recent[recent.length - 1]
          const userText = lastMsg?.parts?.[0]?.text || lastMsg?.content || 'שלום'
          
          const chat = model.startChat({ history })
          const result = await chat.sendMessage(userText)
          const text = result.response.text()?.trim()
          
          if (text) return res.status(200).json({ text, provider: 'gemini', model: modelName })
        } catch (modelErr) {
          if (modelErr.message?.includes('429')) continue
          if (modelErr.message?.includes('quota')) continue
          continue
        }
      }
    } catch (sdkErr) {
      // SDK not available or key issue — fall through to Claude
    }
  }

  // ── 2. Claude Haiku fallback ───────────────────────────────────────
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

  return res.status(200).json({ 
    text: 'שמשון לא זמין כרגע — בדוק שה-API key מוגדר ב-Vercel.', 
    provider: 'error' 
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
  const protPct = Math.round((todayProtein / targetProtein) * 100)
  const doneHabits = todayHabits.filter(h => h.done).length
  const pendingTasks = todayTasks.filter(t => !t.done).length

  const context = `
════════════════════════════════════
📊 CONTEXT — ${dayOfWeek}, ${date} | ${greeting}
════════════════════════════════════
👤 ${userName || 'נתנאל'} | ${greeting} טוב!

🥗 תזונה: ${todayCalories}/${targetCal} קל' (${calPct}%) | חלבון ${Math.round(todayProtein)}g/${targetProtein}g (${protPct}%)
   ${todayFood.length > 0 ? todayFood.map(f => f.food + '(' + f.calories + ')').join(', ') : 'טרם נרשם'}

💰 פיננסים: הכנסות ${(finance.income||0).toLocaleString()}₪ | הוצאות ${(finance.expenses||0).toLocaleString()}₪ | מאזן ${(finance.balance>=0?'+':'')}${(finance.balance||0).toLocaleString()}₪

🏋 כושר: ${workout.today ? '✓ אמן היום' : '✗ לא אמן'} | streak ${workout.streak||0} | חודש ${workout.monthCount||0}

📅 היום: ${todayEvents.length > 0 ? todayEvents.map(e => e.time+' '+e.title).join(' | ') : 'אין אירועים'}

✅ משימות: ${pendingTasks} פתוחות${urgentTasks.length > 0 ? ' | דחוף: '+urgentTasks.slice(0,2).map(t=>t.title).join(', ') : ''}

🔄 הרגלים: ${doneHabits}/${todayHabits.length} | ${todayHabits.map(h=>(h.done?'✓':'○')+h.name).join(' ')}
════════════════════════════════════`

  return systemBase + context + (isMobile ? '\n\nWhatsApp mode: ללא markdown, קצר, עברית.' : '')
}

const DEFAULT_SYSTEM = `אתה שמשון — ה-Life OS האישי. עוזר חכם שיודע הכל על חייו של המשתמש.
- ענה תמיד בעברית
- קצר (1-3 משפטים) אלא אם מבקשים פירוט  
- השתמש במספרים ועובדות
- אל תתחיל ב"כמובן"/"בהחלט"
- דבר כמו חבר חכם שמכיר אותך`
