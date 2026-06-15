import twilio from 'twilio'

export default async function handler(req, res) {
  // Twilio sends POST with form data
  if (req.method === 'POST') {
    const { Body, From } = req.body || {}
    
    // Verify it's from Twilio (optional but good)
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken  = process.env.TWILIO_AUTH_TOKEN
    const fromNumber = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'
    const toNumber   = process.env.WHATSAPP_MY_NUMBER // e.g. whatsapp:+972501234567

    if (!Body || !From) {
      return res.status(200).send('<Response></Response>')
    }

    // Call Shimshon AI
    let reply = 'שמשון לא זמין כרגע'
    try {
      const shimRes = await fetch(`${process.env.VERCEL_URL || 'https://lifeos-eight-inky.vercel.app'}/api/shimshon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', parts: [{ text: Body }] }],
          source: 'whatsapp'
        })
      })
      const data = await shimRes.json()
      reply = data.text || 'שגיאה'
    } catch (e) {
      reply = 'שמשון לא זמין כרגע 😔'
    }

    // Send reply via Twilio TwiML
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message to="${From}" from="${fromNumber}">${reply}</Message>
</Response>`
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send(twiml)
  }

  res.status(200).json({ status: 'WhatsApp webhook active' })
}
