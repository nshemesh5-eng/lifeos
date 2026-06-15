// Vercel Cron Job — runs daily at 6:00 UTC = 8:00 Israel (summer) / 9:00 (winter)
// Add to vercel.json: { "path": "/api/cron-morning", "schedule": "0 6 * * *" }

export default async function handler(req, res) {
  // Verify it's a cron call from Vercel
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const baseUrl = 'https://lifeos-eight-inky.vercel.app'
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
  const twilioSid   = process.env.TWILIO_ACCOUNT_SID
  const twilioToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber  = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'
  const toNumber    = process.env.WHATSAPP_MY_NUMBER

  if (!twilioSid || !toNumber) {
    return res.status(200).json({ skip: 'WhatsApp not configured' })
  }

  // Build morning briefing
  const prompt = `תן לי תדריך בוקר קצר וחד לתחילת היום — 3-4 משפטים בלבד.
כלול: 1) מאזן חודשי 2) יעד קלוריות היום 3) האם אמנתי אתמול 4) דבר אחד חשוב לעשות היום.
סיים עם משפט מוטיבציה אחד. היה ספציפי עם מספרים.`

  let message = '☀️ בוקר טוב! שמשון כאן 👋'
  try {
    const shimRes = await fetch(`${baseUrl}/api/shimshon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', parts: [{ text: prompt }] }],
        source: 'whatsapp'
      })
    })
    const data = await shimRes.json()
    message = `☀️ ${data.text || 'בוקר טוב!'}`
  } catch {}

  // Send via Twilio
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`
  const params = new URLSearchParams({
    From: fromNumber,
    To: toNumber,
    Body: message
  })

  const twilioRes = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  })

  const result = await twilioRes.json()
  res.status(200).json({ sent: !!result.sid, sid: result.sid })
}
