export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const key = process.env.VITE_GEMINI_API_KEY
  if (!key) return res.status(500).json({ error: 'API key not configured' })

  const { messages = [], systemPrompt = '' } = req.body || {}

  // Keep conversation short to save tokens
  const recentMessages = messages.slice(-8)
  const contents = [
    { role: 'user', parts: [{ text: systemPrompt || 'אתה שמשון, עוזר אישי בעברית.' }] },
    { role: 'model', parts: [{ text: 'מוכן.' }] },
    ...recentMessages
  ]

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 500
          }
        })
      }
    )

    const data = await response.json()

    if (!response.ok) {
      const msg = data.error?.message || 'Gemini error'
      if (response.status === 429 || msg.includes('quota')) {
        return res.status(429).json({ error: 'יותר מדי בקשות — המתן דקה ונסה שוב' })
      }
      return res.status(response.status).json({ error: msg })
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    return res.status(200).json({ text })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
