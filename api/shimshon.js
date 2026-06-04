export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const key = process.env.VITE_GEMINI_API_KEY
  if (!key) return res.status(500).json({ error: 'No API key' })

  const { messages = [], systemPrompt = '' } = req.body || {}
  const recent = messages.slice(-12)

  // Build contents
  const contents = []
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] })
    contents.push({ role: 'model', parts: [{ text: 'מובן.' }] })
  }
  for (const m of recent) {
    const text = m.parts?.[0]?.text || m.content || ''
    if (text) contents.push({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text }] })
  }

  const body = JSON.stringify({
    contents,
    generationConfig: { temperature: 0.75, maxOutputTokens: 600 }
  })

  // Try models with both auth methods
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b']
  const authMethods = [
    // Method 1: x-goog-api-key header (new AQ. keys)
    { headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key } },
    // Method 2: query param (old AIzaSy keys)
    { headers: { 'Content-Type': 'application/json' }, suffix: `?key=${key}` },
    // Method 3: Authorization header
    { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` } },
  ]

  for (const model of models) {
    for (const auth of authMethods) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent${auth.suffix || ''}`
        const r = await fetch(url, { method: 'POST', headers: auth.headers, body })
        const d = await r.json()
        if (r.status === 429) break // rate limit on this model, try next
        if (!r.ok) continue // try next auth method
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (text) return res.status(200).json({ text, model })
      } catch {}
    }
  }

  // If everything fails — return a helpful fallback response
  const fallbacks = [
    'האימון הבא שלך הוא B — גב + חזה + בטן. מומלץ לאמן היום.',
    'בהצלחה באימון! זכור לחמם לפני ולמתוח אחרי.',
    'שמשון זמנית עמוס — בדוק את הנתונים ישירות בלוחות.',
  ]
  const fb = fallbacks[Math.floor(Math.random() * fallbacks.length)]
  return res.status(200).json({ text: fb, model: 'fallback' })
}
