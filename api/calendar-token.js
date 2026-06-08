// Google Calendar OAuth token refresh — keeps calendar connected permanently
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || 'https://lifeos-eight-inky.vercel.app')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const clientId = process.env.VITE_GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientSecret) {
    return res.status(200).json({ error: 'no_secret', message: 'GOOGLE_CLIENT_SECRET not configured' })
  }

  const { refresh_token } = req.body || {}
  if (!refresh_token) return res.status(400).json({ error: 'missing refresh_token' })

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token,
        grant_type: 'refresh_token',
      })
    })
    const d = await r.json()
    if (d.access_token) {
      return res.status(200).json({ access_token: d.access_token, expires_in: d.expires_in })
    }
    return res.status(400).json({ error: d.error, message: d.error_description })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
