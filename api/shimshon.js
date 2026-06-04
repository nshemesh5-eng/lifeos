export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const geminiKey = process.env.VITE_GEMINI_API_KEY
  if (!geminiKey) return res.status(500).json({ error: 'API key not configured' })

  const { messages = [], systemPrompt = '' } = req.body || {}
  const recent = messages.slice(-12)

  // Build contents — system as first user message, then conversation
  const contents = []
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] })
    contents.push({ role: 'model', parts: [{ text: 'מובן. אני מוכן לעזור.' }] })
  }
  for (const m of recent) {
    const role = m.role === 'model' ? 'model' : 'user'
    const text = m.parts?.[0]?.text || m.content || ''
    if (text) contents.push({ role, parts: [{ text }] })
  }

  // Try multiple models in order
  const models = [
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b',
  ]

  for (const model of models) {
    try {
      // Support both old AIzaSy... and new AQ.Ab... key formats
      const url = geminiKey.startsWith('AQ.')
        ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
        : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`

      const headers = { 'Content-Type': 'application/json' }
      if (geminiKey.startsWith('AQ.')) {
        headers['x-goog-api-key'] = geminiKey
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 600 }
        })
      })

      const data = await response.json()

      if (response.status === 429) {
        continue // try next model
      }

      if (!response.ok) {
        const msg = data.error?.message || 'Gemini error'
        if (msg.includes('not found') || msg.includes('deprecated')) continue
        return res.status(400).json({ error: msg })
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
      return res.status(200).json({ text, model })

    } catch (e) {
      continue
    }
  }

  return res.status(429).json({ error: 'כל המודלים עמוסים כרגע — נסה שוב בעוד רגע' })
}
