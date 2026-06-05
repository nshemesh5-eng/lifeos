// WhatsApp Bot via Twilio — receives messages and responds with Shimshon AI
export default async function handler(req, res) {
  // Twilio sends POST with form data
  if (req.method === 'GET') {
    // Health check
    return res.status(200).send('Shimshon WhatsApp Bot OK')
  }
  if (req.method !== 'POST') return res.status(405).end()

  const twilioToken = process.env.TWILIO_AUTH_TOKEN
  const accountSid  = process.env.TWILIO_ACCOUNT_SID
  const fromNumber  = process.env.TWILIO_WHATSAPP_FROM // whatsapp:+14155238886

  const body = req.body || {}
  const userMessage = body.Body || ''
  const from = body.From || '' // whatsapp:+972XXXXXXXXX

  if (!userMessage) return res.status(200).end()

  console.log(`WhatsApp from ${from}: ${userMessage}`)

  // Call Shimshon AI
  let reply = ''
  try {
    const shimshonRes = await fetch(`${process.env.VERCEL_URL || 'https://lifeos-eight-inky.vercel.app'}/api/shimshon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', parts: [{ text: userMessage }] }],
        systemPrompt: `אתה שמשון — עוזר חיים אישי חכם בוואטסאפ. 
ענה קצר וישיר בעברית. 
אם מדברים על אוכל — ציין קלוריות וחלבון. 
אם מדברים על כסף — ציין מספרים. 
אם מדברים על אימון — ציין פרטים. 
הודעה ב-WhatsApp — חד משמעי, אין markdown, אין כוכביות.`
      })
    })
    const data = await shimshonRes.json()
    reply = data.text || 'שמשון לא זמין כרגע'
  } catch {
    reply = 'שגיאה בשמשון — נסה שוב'
  }

  // Respond via Twilio TwiML
  res.setHeader('Content-Type', 'text/xml')
  return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message><Body>${reply.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</Body></Message>
</Response>`)
}
