export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const geminiKey = process.env.VITE_GEMINI_API_KEY

  const { messages = [], systemPrompt = '' } = req.body || {}
  const recentMessages = messages.slice(-12)

  // ── Try Claude first (better, smarter, higher limits) ──
  if (anthropicKey) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system: systemPrompt || 'אתה שמשון, עוזר אישי חכם בעברית.',
          messages: recentMessages.map(m => ({
            role: m.role === 'model' ? 'assistant' : m.role,
            content: m.parts?.[0]?.text || m.content || ''
          }))
        })
      })

      const data = await response.json()
      if (response.ok) {
        const text = data.content?.[0]?.text?.trim() || ''
        return res.status(200).json({ text, provider: 'claude' })
      }
    } catch (e) {
      // Fall through to Gemini
    }
  }

  // ── Fallback: Gemini ────────────────────────────────────
  if (!geminiKey) return res.status(500).json({ error: 'לא הוגדר מפתח AI' })

  const contents = [
    { role: 'user', parts: [{ text: systemPrompt || 'אתה שמשון, עוזר אישי בעברית.' }] },
    { role: 'model', parts: [{ text: 'מוכן.' }] },
    ...recentMessages
  ]

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 600 }
        })
      }
    )

    const data = await response.json()
    if (!response.ok) {
      const msg = data.error?.message || 'שגיאה'
      if (response.status === 429) return res.status(429).json({ error: 'יותר מדי בקשות — המתן דקה' })
      return res.status(response.status).json({ error: msg })
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    return res.status(200).json({ text, provider: 'gemini' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
