// Vercel Cron Job — runs daily at 19:00 UTC = 21:00 Israel (summer)
// Add to vercel.json: { "path": "/api/cron-evening", "schedule": "0 19 * * *" }

export default async function handler(req, res) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const baseUrl   = 'https://lifeos-eight-inky.vercel.app'
  const twilioSid   = process.env.TWILIO_ACCOUNT_SID
  const twilioToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber  = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'
  const toNumber    = process.env.WHATSAPP_MY_NUMBER

  if (!twilioSid || !toNumber) {
    return res.status(200).json({ skip: 'WhatsApp not configured' })
  }

  const prompt = `סכם את היום בקצרה — 3 משפטים.
כלול: 1) כמה קלוריות אכלתי היום מול היעד 2) האם אמנתי 3) כמה הרגלים סיימתי.
בסוף — מה הדבר הכי חשוב לעשות מחר בבוקר.`

  let message = '🌙 סיכום יום מאת שמשון'
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
    message = `🌙 ${data.text || 'לילה טוב!'}`
  } catch {}

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`
  const params = new URLSearchParams({ From: fromNumber, To: toNumber, Body: message })

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
