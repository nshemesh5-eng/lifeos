import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages, systemPrompt } = req.body
  const key = process.env.VITE_GEMINI_API_KEY

  if (!key) return res.status(500).json({ error: 'No Gemini API key configured' })

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: systemPrompt }] },
            { role: 'model', parts: [{ text: 'מוכן.' }] },
            ...messages
          ],
          generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
        })
      }
    )

    const data = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Gemini error' })
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.json({ text })
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}
