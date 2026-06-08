// WhatsApp Bot — Shimshon מהנייד
export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).send('🤖 Shimshon WhatsApp Bot — Active')
  if (req.method !== 'POST') return res.status(405).end()

  // Twilio webhook validation
  const twilioSig = req.headers['x-twilio-signature']
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken  = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886'

  const body = req.body || {}
  const userMsg  = (body.Body || '').trim()
  const fromNum  = body.From || ''

  if (!userMsg) return res.status(200).end()

  // Find user by WhatsApp number
  let userName = 'שמשון'
  let userContext = null
  
  try {
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'https://lifeos-eight-inky.vercel.app'
    
    // Call Shimshon
    const aiRes = await fetch(`${baseUrl}/api/shimshon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'whatsapp',
        messages: [{ role:'user', parts:[{ text: userMsg }] }],
        systemPrompt: `אתה שמשון — עוזר חיים אישי בוואטסאפ. 
ענה קצר בעברית (1-2 משפטים). 
ללא markdown, ללא כוכביות.
אם שואלים על אוכל — ציין קלוריות וחלבון.
אם שואלים על כסף — ציין מספרים.
אם שואלים על לוח זמנים — תן תוכנית ספציפית.`,
        context: userContext,
      })
    })
    const aiData = await aiRes.json()
    const reply = aiData.text || 'שמשון עמוס כרגע 🔄'

    // Send WhatsApp reply via Twilio
    if (accountSid && authToken) {
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ From: fromNumber, To: fromNum, Body: reply })
      })
    }

    // TwiML response
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>${
      reply.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    }</Body></Message></Response>`)
  } catch(e) {
    res.setHeader('Content-Type', 'text/xml')
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>שגיאה — נסה שוב</Body></Message></Response>`)
  }
}
