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

  const contents = []
  if (systemPrompt) {
    contents.push({ role: 'user', parts: [{ text: systemPrompt }] })
    contents.push({ role: 'model', parts: [{ text: 'מובן.' }] })
  }
  for (const m of recent) {
    const role = m.role === 'model' ? 'model' : 'user'
    const text = m.parts?.[0]?.text || m.content || ''
    if (text) contents.push({ role, parts: [{ text }] })
  }

  const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b']

  for (const model of models) {
    try {
      // Google's new AQ. key format uses x-goog-api-key header
      // Old AIzaSy format uses query param
      const isNewFormat = geminiKey.startsWith('AQ.')
      const url = isNewFormat
        ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
        : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`

      const headers = { 'Content-Type': 'application/json' }
      if (isNewFormat) headers['x-goog-api-key'] = geminiKey

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.75, maxOutputTokens: 600 }
        })
      })

      const data = await response.json()

      if (response.status === 429) { continue }
      if (response.status === 401 || response.status === 403) {
        // Key doesn't work for this format — try with query param too
        const url2 = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`
        const r2 = await fetch(url2, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents, generationConfig: { temperature: 0.75, maxOutputTokens: 600 } })
        })
        const d2 = await r2.json()
        if (r2.ok) {
          const text = d2.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
          return res.status(200).json({ text, model })
        }
        continue
      }
      if (!response.ok) { continue }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
      if (text) return res.status(200).json({ text, model })

    } catch (e) { continue }
  }

  return res.status(429).json({ error: 'שמשון עמוס — נסה שוב בעוד רגע' })
}
