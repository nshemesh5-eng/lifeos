// Simple in-memory rate limiter (resets per serverless instance)
const requestLog = []
const RATE_WINDOW_MS = 60_000
const RATE_LIMIT = 25 // conservative limit (free tier is 30 RPM for gemini-2.0-flash-lite)

function isRateLimited() {
  const now = Date.now()
  // Remove entries older than 1 minute
  while (requestLog.length && requestLog[0] < now - RATE_WINDOW_MS) requestLog.shift()
  if (requestLog.length >= RATE_LIMIT) return true
  requestLog.push(now)
  return false
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (isRateLimited()) {
    return res.status(429).json({ error: 'יותר מדי בקשות — המתן דקה ונסה שוב' })
  }

  const key = process.env.VITE_GEMINI_API_KEY
  if (!key) return res.status(500).json({ error: 'API key not configured' })

  const { messages = [], systemPrompt = '' } = req.body || {}

  // Build contents — keep conversation short to save tokens
  const recentMessages = messages.slice(-6) // last 6 messages max
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
            maxOutputTokens: 300,  // keep short to reduce quota usage
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
