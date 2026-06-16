// שמשון AI — Claude primary + Gemini fallback + DB actions
export default async function handler(req, res) {
  const allowed = process.env.ALLOWED_ORIGIN || 'https://lifeos-eight-inky.vercel.app'
  res.setHeader('Access-Control-Allow-Origin', allowed)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const geminiKey    = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
  const supabaseUrl  = process.env.VITE_SUPABASE_URL
  const supabaseKey  = process.env.VITE_SUPABASE_ANON_KEY

  // ── Daily rate limit ────────────────────────────────────────────
  const DAILY_LIMIT = 50
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown'
  const today = new Date().toISOString().split('T')[0]
  const limitKey = `shimshon_calls_${today}_${ip}`
  if (!global._shimshonCounts) global._shimshonCounts = {}
  global._shimshonCounts[limitKey] = (global._shimshonCounts[limitKey] || 0) + 1
  if (global._shimshonCounts[limitKey] > DAILY_LIMIT) {
    return res.status(429).json({ text: `הגעת ל-${DAILY_LIMIT} שיחות היום. הlimit מתאפס בחצות.`, provider: 'limit', remaining: 0 })
  }
  const remaining = DAILY_LIMIT - global._shimshonCounts[limitKey]

  const { messages = [], systemPrompt = '', context = null, source = 'app', userId = null, authToken = null } = req.body || {}
  const recent = (messages || []).slice(-10)
  const fullSystem = buildSystem(systemPrompt, context, source)
  const lastUserMsg = recent.filter(m => m.role === 'user').slice(-1)[0]?.parts?.[0]?.text || ''

  // ── Try Claude first ────────────────────────────────────────────
  let aiText = null
  if (anthropicKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          system: fullSystem + ACTION_SYSTEM,
          messages: recent.map(m => ({
            role: m.role === 'model' ? 'assistant' : 'user',
            content: m.parts?.[0]?.text || m.content || ''
          })).filter(m => m.content)
        })
      })
      const d = await r.json()
      if (r.ok && d.content?.[0]?.text) aiText = d.content[0].text.trim()
    } catch {}
  }

  // ── Gemini fallback ─────────────────────────────────────────────
  if (!aiText && geminiKey) {
    const contents = [
      { role: 'user', parts: [{ text: fullSystem + ACTION_SYSTEM }] },
      { role: 'model', parts: [{ text: 'מוכן.' }] },
      ...recent
    ]
    for (const model of ['gemini-2.0-flash', 'gemini-1.5-flash']) {
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents, generationConfig: { temperature: 0.8, maxOutputTokens: 500 } }),
            signal: AbortSignal.timeout(12000) }
        )
        const d = await r.json()
        if (r.ok) { aiText = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim(); if (aiText) break }
      } catch {}
    }
  }

  if (!aiText) {
    return res.status(200).json({ text: 'שמשון לא זמין כרגע. נסה שוב עוד רגע.', provider: 'fallback', remaining })
  }

  // ── Parse action from AI response ──────────────────────────────
  let action = null
  let displayText = aiText

  // Check if AI returned an action JSON block
  const actionMatch = aiText.match(/\[\[ACTION:(.*?)\]\]/s)
  if (actionMatch) {
    try {
      action = JSON.parse(actionMatch[1].trim())
      displayText = aiText.replace(/\[\[ACTION:.*?\]\]/s, '').trim()
    } catch {}
  }

  // ── Execute action in Supabase ──────────────────────────────────
  let actionResult = null
  if (action && userId && authToken && supabaseUrl && supabaseKey) {
    actionResult = await executeAction(action, userId, authToken, supabaseUrl, supabaseKey, today)
  }

  return res.status(200).json({
    text: displayText,
    provider: aiText === displayText ? 'claude' : 'claude+action',
    action: action || null,
    actionResult,
    remaining,
    needsRefresh: !!action
  })
}

// ── Execute DB action ───────────────────────────────────────────
async function executeAction(action, userId, authToken, sbUrl, sbKey, today) {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': sbKey,
    'Authorization': `Bearer ${authToken}`,
    'Prefer': 'return=minimal'
  }

  try {
    switch (action.type) {
      case 'log_food': {
        // INSERT into food_logs
        const body = {
          user_id: userId,
          date: today,
          meal: action.meal || 'ארוחה',
          food: action.food,
          calories: action.calories || null,
          protein: action.protein || null,
          carbs: action.carbs || null,
          fat: action.fat || null,
        }
        const r = await fetch(`${sbUrl}/rest/v1/food_logs`, {
          method: 'POST', headers, body: JSON.stringify(body)
        })
        return r.ok ? { success: true, type: 'food_logged', food: action.food } : { success: false, status: r.status }
      }

      case 'complete_habit': {
        // UPSERT into habit_logs
        const body = {
          user_id: userId,
          habit_id: action.habit_id,
          date: today,
          done: true
        }
        const r = await fetch(`${sbUrl}/rest/v1/habit_logs?on_conflict=user_id,habit_id,date`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(body)
        })
        return r.ok ? { success: true, type: 'habit_completed', name: action.habit_name } : { success: false, status: r.status }
      }

      case 'add_task': {
        const body = {
          user_id: userId,
          title: action.title,
          priority: action.priority || 'medium',
          done: false,
          created_at: new Date().toISOString()
        }
        const r = await fetch(`${sbUrl}/rest/v1/tasks`, {
          method: 'POST', headers, body: JSON.stringify(body)
        })
        return r.ok ? { success: true, type: 'task_added', title: action.title } : { success: false, status: r.status }
      }

      case 'complete_task': {
        const r = await fetch(`${sbUrl}/rest/v1/tasks?id=eq.${action.task_id}`, {
          method: 'PATCH', headers, body: JSON.stringify({ done: true })
        })
        return r.ok ? { success: true, type: 'task_completed' } : { success: false, status: r.status }
      }

      case 'log_workout': {
        const body = {
          user_id: userId,
          date: today,
          name: action.name || 'אימון',
          duration: action.duration || null,
          type: action.workout_type || 'cardio'
        }
        const r = await fetch(`${sbUrl}/rest/v1/workouts`, {
          method: 'POST', headers, body: JSON.stringify(body)
        })
        return r.ok ? { success: true, type: 'workout_logged', name: action.name } : { success: false, status: r.status }
      }

      default:
        return { success: false, error: 'Unknown action type: ' + action.type }
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// ── System prompt builder ───────────────────────────────────────
function buildSystem(base, ctx, source) {
  const isMobile = source === 'whatsapp'
  const sys = base || DEFAULT_SYSTEM
  if (!ctx) return sys

  const {
    userName='', date='', dayOfWeek='', hour=new Date().getHours(),
    todayCalories=0, todayProtein=0, targetCal=2000, targetProtein=150,
    todayFood=[], finance={}, workout={},
    todayTasks=[], urgentTasks=[], todayHabits=[]
  } = ctx

  const greeting = hour < 12 ? 'בוקר' : hour < 17 ? 'צהריים' : hour < 21 ? 'ערב' : 'לילה'
  const calPct = Math.round((todayCalories / targetCal) * 100)
  const bal = finance?.balance ?? finance?.monthBalance ?? 0

  return sys + `
════════════════════════════════════
📊 ${dayOfWeek}, ${date} | ${greeting} טוב ${userName}!
🥗 תזונה: ${todayCalories}/${targetCal}קל (${calPct}%) | חלבון ${Math.round(todayProtein)}/${targetProtein}g
   ${todayFood?.length ? todayFood.map(f=>f.food+'('+f.calories+'קל)').join(', ') : 'טרם נרשם אוכל היום'}
💰 מאזן: ${bal>=0?'+':''}₪${Number(bal).toLocaleString()}
🏋 כושר: ${workout?.today?'✓ אמן':'✗ לא אמן'} | streak ${workout?.streak||0}
🔄 הרגלים: ${(todayHabits||[]).filter(h=>h.done).length}/${(todayHabits||[]).length}
   ${(todayHabits||[]).map(h=>(h.done?'✅':'⬜')+' '+h.name+' [id:'+h.id+']').join(' | ')}
✅ משימות פתוחות (${(todayTasks||[]).filter(t=>!t.done).length}):
   ${(todayTasks||[]).filter(t=>!t.done).slice(0,5).map(t=>'• '+t.title+' [id:'+t.id+']').join('\n   ')}
════════════════════════════════════` + (isMobile ? '\nWhatsApp: ללא markdown, קצר.' : '')
}

const ACTION_SYSTEM = `

כאשר המשתמש מדווח על פעולה שצריך לשמור ב-DB, ענה בתשובה רגילה ואז הוסף בסוף:
[[ACTION:{"type":"ACTION_TYPE",...}]]

סוגי פעולות:
- רישום אוכל: [[ACTION:{"type":"log_food","food":"עוף עם אורז","meal":"ארוחת צהריים","calories":450,"protein":35}]]
- סימון הרגל: [[ACTION:{"type":"complete_habit","habit_id":"ID_מה_context","habit_name":"שם ההרגל"}]]
- הוספת משימה: [[ACTION:{"type":"add_task","title":"שם המשימה","priority":"medium"}]]
- סיום משימה: [[ACTION:{"type":"complete_task","task_id":"ID_מה_context"}]]
- רישום אימון: [[ACTION:{"type":"log_workout","name":"ריצה","duration":30,"workout_type":"cardio"}]]

כשהמשתמש אומר "אכלתי X" → log_food
כשאומר "עשיתי ריצה/מדיטציה/הרגל X" → complete_habit עם ה-id הנכון מה-context
כשאומר "סיימתי משימה X" → complete_task עם ה-id
כשאומר "אמן היום" → log_workout
חשוב: ה-IDs נמצאים ב-context בין הסוגריים המרובעים [id:...]`

const DEFAULT_SYSTEM = `אתה שמשון — מערכת Life OS אישית של המשתמש.
אתה מחובר ישירות לבסיס הנתונים שלו ב-Supabase ויש לך גישה מלאה לנתוניו בזמן אמת.
אתה יכול:
- לקרוא: הרגלים, משימות, תזונה, פיננסים, אימונים, תזכורות — הכל נמצא ב-context
- לכתוב: כשמשתמש מדווח על פעולה, השתמש ב-[[ACTION:...]] כדי לשמור לDB

כללים:
- ענה תמיד בעברית
- קצר (1-3 משפטים) אלא אם מבקשים פירוט
- דבר כמו חבר חכם שמכיר אותך
- אל תתחיל ב"כמובן"/"בהחלט"
- אל תאמר "אני לא יכול לגשת לDB" — אתה כן יכול, הנתונים ב-context
- אל תאמר "אתה צריך MyFitnessPal" — המשתמש כבר בנה את המערכת שלו`
