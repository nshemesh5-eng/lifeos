// שמשון AI v2.0 — Claude primary + full life context + smart proactive suggestions

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

  const DAILY_LIMIT = 50
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown'
  const today = new Date().toISOString().split('T')[0]
  if (!global._shimshonCounts) global._shimshonCounts = {}
  const key = today + '_' + ip
  global._shimshonCounts[key] = (global._shimshonCounts[key] || 0) + 1
  if (global._shimshonCounts[key] > DAILY_LIMIT) {
    return res.status(429).json({ text: 'הגעת ל-' + DAILY_LIMIT + ' שיחות היום.', provider: 'limit', remaining: 0 })
  }
  const remaining = DAILY_LIMIT - global._shimshonCounts[key]

  const { messages = [], systemPrompt = '', context = null, source = 'app', userId = null, authToken = null } = req.body || {}
  const recent = (messages || []).slice(-10)
  const fullSystem = buildSystem(systemPrompt, context, source)

  let aiText = null
  if (anthropicKey) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
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

  if (!aiText && geminiKey) {
    const contents = [
      { role: 'user', parts: [{ text: fullSystem + ACTION_SYSTEM }] },
      { role: 'model', parts: [{ text: 'מוכן.' }] },
      ...recent
    ]
    for (const model of ['gemini-2.0-flash', 'gemini-1.5-flash']) {
      try {
        const r = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + geminiKey,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents, generationConfig: { temperature: 0.8, maxOutputTokens: 600 } }),
            signal: AbortSignal.timeout(12000) }
        )
        const d = await r.json()
        if (r.ok) { aiText = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim(); if (aiText) break }
      } catch {}
    }
  }

  if (!aiText) return res.status(200).json({ text: 'שמשון לא זמין כרגע.', provider: 'fallback', remaining })

  let action = null
  let displayText = aiText
  const actionMatch = aiText.match(/\[\[ACTION:(.*?)\]\]/s)
  if (actionMatch) {
    try { action = JSON.parse(actionMatch[1].trim()); displayText = aiText.replace(/\[\[ACTION:.*?\]\]/s, '').trim() } catch {}
  }
  let actionResult = null
  if (action && userId && authToken && supabaseUrl && supabaseKey) {
    actionResult = await executeAction(action, userId, authToken, supabaseUrl, supabaseKey, today)
  }

  return res.status(200).json({
    text: displayText, provider: anthropicKey ? 'claude' : 'gemini',
    action: action || null, actionResult, remaining, needsRefresh: !!action
  })
}

async function executeAction(action, userId, authToken, sbUrl, sbKey, today) {
  const headers = { 'Content-Type': 'application/json', 'apikey': sbKey,
    'Authorization': 'Bearer ' + authToken, 'Prefer': 'return=minimal' }
  try {
    switch (action.type) {
      case 'log_food': {
        const r = await fetch(sbUrl + '/rest/v1/food_logs', { method: 'POST', headers,
          body: JSON.stringify({ user_id: userId, date: today, meal: action.meal || 'ארוחה',
            food: action.food, calories: action.calories || null, protein: action.protein || null,
            carbs: action.carbs || null, fat: action.fat || null }) })
        return r.ok ? { success: true, type: 'food_logged', food: action.food } : { success: false }
      }
      case 'complete_habit': {
        const r = await fetch(sbUrl + '/rest/v1/habit_logs?on_conflict=user_id,habit_id,date', {
          method: 'POST', headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ user_id: userId, habit_id: action.habit_id, date: today, done: true }) })
        return r.ok ? { success: true, type: 'habit_completed', name: action.habit_name } : { success: false }
      }
      case 'add_task': {
        const r = await fetch(sbUrl + '/rest/v1/tasks', { method: 'POST', headers,
          body: JSON.stringify({ user_id: userId, title: action.title,
            priority: action.priority || 'medium', done: false, created_at: new Date().toISOString() }) })
        return r.ok ? { success: true, type: 'task_added', title: action.title } : { success: false }
      }
      case 'complete_task': {
        const r = await fetch(sbUrl + '/rest/v1/tasks?id=eq.' + action.task_id,
          { method: 'PATCH', headers, body: JSON.stringify({ done: true }) })
        return r.ok ? { success: true, type: 'task_completed' } : { success: false }
      }
      case 'log_workout': {
        const r = await fetch(sbUrl + '/rest/v1/workouts', { method: 'POST', headers,
          body: JSON.stringify({ user_id: userId, date: today, name: action.name || 'אימון',
            duration: action.duration || null, type: action.workout_type || 'cardio' }) })
        return r.ok ? { success: true, type: 'workout_logged', name: action.name } : { success: false }
      }
      case 'add_reminder': {
        const r = await fetch(sbUrl + '/rest/v1/reminders', { method: 'POST', headers,
          body: JSON.stringify({ user_id: userId, title: action.title,
            time: action.time || null, repeat: action.repeat || null, active: true }) })
        return r.ok ? { success: true, type: 'reminder_added', title: action.title } : { success: false }
      }
      case 'log_mood': {
        const r = await fetch(sbUrl + '/rest/v1/mood_logs', { method: 'POST', headers,
          body: JSON.stringify({ user_id: userId, date: today,
            score: action.score, note: action.note || null }) })
        return r.ok ? { success: true, type: 'mood_logged', score: action.score } : { success: false }
      }
      case 'log_transaction': {
        const r = await fetch(sbUrl + '/rest/v1/transactions', { method: 'POST', headers,
          body: JSON.stringify({ user_id: userId, date: today, amount: action.amount,
            description: action.description, type: action.transaction_type || 'expense',
            category: action.category || 'כללי' }) })
        return r.ok ? { success: true, type: 'transaction_logged' } : { success: false }
      }
      default: return { success: false, error: 'Unknown: ' + action.type }
    }
  } catch (e) { return { success: false, error: e.message } }
}

function buildSystem(base, ctx, source) {
  const sys = base || DEFAULT_SYSTEM
  if (!ctx) return sys
  const {
    userName='', date='', dayOfWeek='', hour=new Date().getHours(),
    todayCalories=0, todayProtein=0, targetCal=2000, targetProtein=150,
    todayFood=[], finance={}, workout={}, todayTasks=[], urgentTasks=[],
    todayHabits=[], recentMoods=[], upcomingReminders=[]
  } = ctx
  const greeting = hour < 5 ? 'לילה' : hour < 12 ? 'בוקר' : hour < 17 ? 'צהריים' : hour < 21 ? 'ערב' : 'לילה'
  const calPct = Math.round((todayCalories / targetCal) * 100)
  const bal = finance?.balance ?? finance?.monthBalance ?? 0
  const doneHabits = (todayHabits||[]).filter(h=>h.done)
  const undoneHabits = (todayHabits||[]).filter(h=>!h.done)
  const openTasks = (todayTasks||[]).filter(t=>!t.done)
  const avgMood = recentMoods?.length ? Math.round(recentMoods.reduce((s,m)=>s+m.score,0)/recentMoods.length) : null
  let insight = ''
  if (calPct < 30 && hour > 14) insight = '\u26a0\ufe0f \u05e8\u05e7 ' + calPct + '% \u05e7\u05dc\u05d5\u05e8\u05d9\u05d5\u05ea \u2014 \u05d0\u05dc \u05ea\u05e9\u05db\u05d7 \u05dc\u05d0\u05db\u05d5\u05dc!'
  if (undoneHabits.length === (todayHabits||[]).length && hour > 20) insight += '\n\u26a0\ufe0f \u05dc\u05d0 \u05e1\u05d9\u05de\u05e0\u05ea \u05d0\u05e3 \u05d4\u05e8\u05d2\u05dc \u05d4\u05d9\u05d5\u05dd!'
  if (urgentTasks?.length > 0) insight += '\n\ud83d\udd34 \u05d3\u05d7\u05d5\u05e3: ' + urgentTasks[0].title
  return sys + '\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550' +
    '\n\ud83d\udcc5 ' + dayOfWeek + ', ' + date + ' | ' + greeting + ' \u05d8\u05d5\u05d1 ' + userName + '!' +
    (insight ? '\n\ud83d\udca1 ' + insight : '') +
    '\n\ud83e\udd57 \u05ea\u05d6\u05d5\u05e0\u05d4: ' + todayCalories + '/' + targetCal + '\u05e7\u05dc (' + calPct + '%) | \u05d7\u05dc\u05d1\u05d5\u05df ' + Math.round(todayProtein) + '/' + targetProtein + 'g' +
    '\n   ' + (todayFood?.length ? '\u05d0\u05db\u05dc\u05ea: '+todayFood.slice(-3).map(f=>f.food).join(', ') : '\u05d8\u05e8\u05dd \u05e0\u05e8\u05e9\u05dd \u05d0\u05d5\u05db\u05dc') +
    '\n\ud83d\udcb0 \u05de\u05d0\u05d6\u05df: ' + (bal>=0?'+':'') + '\u20aa' + Number(bal).toLocaleString() +
    '\n\ud83c\udfd7 \u05db\u05d5\u05e9\u05e8: ' + (workout?.today?'\u2713 \u05d0\u05de\u05e0\u05ea':'\u2717 \u05dc\u05d0 \u05d0\u05de\u05e0\u05ea') + ' | streak ' + (workout?.streak||0) +
    (avgMood !== null ? '\n\ud83d\ude0a \u05de\u05e6\u05d1 \u05e8\u05d5\u05d7: '+avgMood+'/10' : '') +
    '\n\ud83d\udd04 \u05d4\u05e8\u05d2\u05dc\u05d9\u05dd: ' + doneHabits.length + '/' + (todayHabits||[]).length +
    '\n   \u2705 ' + (doneHabits.length ? doneHabits.map(h=>h.name).join(', ') : '\u05d0\u05d9\u05df \u05e2\u05d3\u05d9\u05d9\u05df') +
    '\n   \u2b1c ' + (undoneHabits.map(h=>h.name+' [id:'+h.id+']').join(' | ') || '\u05d4\u05db\u05dc \u05d4\u05d5\u05e9\u05dc\u05dd!') +
    '\n\u2705 \u05de\u05e9\u05d9\u05de\u05d5\u05ea (' + openTasks.length + '):\n   ' +
    openTasks.slice(0,5).map(t=>(t.priority==='high'?'\ud83d\udd34':'\u2022')+' '+t.title+' [id:'+t.id+']').join('\n   ') +
    '\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550' +
    (source === 'whatsapp' ? '\nWhatsApp: \u05e7\u05e6\u05e8, \u05dc\u05dc\u05d0 markdown.' : '')
}

const ACTION_SYSTEM = `

\u05db\u05e9\u05de\u05e9\u05ea\u05de\u05e9 \u05de\u05d3\u05d5\u05d5\u05d7 \u05e2\u05dc \u05e4\u05e2\u05d5\u05dc\u05d4, \u05d1\u05e6\u05e2 \u05d0\u05d5\u05ea\u05d4 \u05d5\u05e2\u05e0\u05d4 + \u05d4\u05d5\u05e1\u05e3 [[ACTION:{...}]] \u05d1\u05e1\u05d5\u05e3:

\u05e4\u05e2\u05d5\u05dc\u05d5\u05ea:
\u2022 \u05d0\u05d5\u05db\u05dc: [[ACTION:{"type":"log_food","food":"\u05e9\u05dd","meal":"\u05d0\u05e8\u05d5\u05d7\u05ea \u05e6\u05d4\u05e8\u05d9\u05d9\u05dd","calories":400,"protein":30}]]
\u2022 \u05d4\u05e8\u05d2\u05dc: [[ACTION:{"type":"complete_habit","habit_id":"ID","habit_name":"\u05e9\u05dd"}]]
\u2022 \u05de\u05e9\u05d9\u05de\u05d4: [[ACTION:{"type":"add_task","title":"\u05e9\u05dd","priority":"high"}]]
\u2022 \u05e1\u05d9\u05d5\u05dd \u05de\u05e9\u05d9\u05de\u05d4: [[ACTION:{"type":"complete_task","task_id":"ID"}]]
\u2022 \u05d0\u05d9\u05de\u05d5\u05df: [[ACTION:{"type":"log_workout","name":"\u05e8\u05d9\u05e6\u05d4","duration":30,"workout_type":"cardio"}]]
\u2022 \u05ea\u05d6\u05db\u05d5\u05e8\u05ea: [[ACTION:{"type":"add_reminder","title":"\u05e9\u05ea\u05d4 \u05de\u05d9\u05dd","time":"10:00","repeat":"daily"}]]
\u2022 \u05de\u05e6\u05d1 \u05e8\u05d5\u05d7: [[ACTION:{"type":"log_mood","score":7,"note":"\u05ea\u05d9\u05d0\u05d5\u05e8"}]]
\u2022 \u05d4\u05d5\u05e6\u05d0\u05d4: [[ACTION:{"type":"log_transaction","amount":50,"description":"\u05d0\u05e8\u05d5\u05d7\u05d4","transaction_type":"expense","category":"\u05d0\u05d5\u05db\u05dc"}]]

\u05d8\u05e8\u05d9\u05d2\u05e8\u05d9\u05dd:
"\u05d0\u05db\u05dc\u05ea\u05d9 X" \u2192 log_food | "\u05e2\u05e9\u05d9\u05ea\u05d9 [\u05d4\u05e8\u05d2\u05dc]" \u2192 complete_habit
"\u05e1\u05d9\u05d9\u05de\u05ea\u05d9 [\u05de\u05e9\u05d9\u05de\u05d4]" \u2192 complete_task | "\u05d0\u05de\u05e0\u05ea\u05d9" \u2192 log_workout
"\u05ea\u05d6\u05db\u05d9\u05e8 \u05dc\u05d9" \u2192 add_reminder | "\u05de\u05e6\u05d1 \u05e8\u05d5\u05d7 X/10" \u2192 log_mood
"\u05e9\u05d9\u05dc\u05de\u05ea\u05d9/\u05e7\u05e0\u05d9\u05ea\u05d9 X \u05d1-Y" \u2192 log_transaction`

const DEFAULT_SYSTEM = `\u05d0\u05ea\u05d4 \u05e9\u05de\u05e9\u05d5\u05df \u2014 \u05de\u05e2\u05e8\u05db\u05ea Life OS \u05d0\u05d9\u05e9\u05d9\u05ea \u05de\u05d7\u05d5\u05d1\u05e8\u05ea \u05dc-Supabase \u05d1\u05d6\u05de\u05df \u05d0\u05de\u05ea.

\u05d9\u05db\u05d5\u05dc\u05d5\u05ea: \u05e7\u05e8\u05d9\u05d0\u05d4, \u05db\u05ea\u05d9\u05d1\u05d4, \u05e0\u05d9\u05ea\u05d5\u05d7, \u05d4\u05e6\u05e2\u05d5\u05ea.

\u05db\u05dc\u05dc\u05d9\u05dd: \u05e2\u05e0\u05d4 \u05d1\u05e2\u05d1\u05e8\u05d9\u05ea, \u05e7\u05e6\u05e8 \u05d5\u05de\u05d3\u05d5\u05d9\u05e7, \u05d3\u05d1\u05e8 \u05db\u05de\u05d5 \u05d7\u05d1\u05e8 \u05e9\u05de\u05db\u05d9\u05e8 \u05d0\u05d5\u05ea\u05da.`
