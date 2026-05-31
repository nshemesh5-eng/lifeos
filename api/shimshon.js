export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const key = process.env.VITE_GEMINI_API_KEY
  if (!key) {
    return res.status(500).json({ error: 'No Gemini API key configured' })
  }

  const { messages, systemPrompt } = req.body || {}

  try {
    const contents = [
      { role: 'user', parts: [{ text: systemPrompt || 'אתה שמשון, עוזר אישי בעברית.' }] },
      { role: 'model', parts: [{ text: 'מוכן.' }] },
      ...(messages || [])
    ]

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
        })
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error('Gemini error:', data)
      return res.status(response.status).json({ error: data.error?.message || 'Gemini error', raw: data })
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(200).json({ text })
  } catch (e) {
    console.error('Handler error:', e)
    return res.status(500).json({ error: e.message })
  }
}
