export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true })
  const BOT = process.env.TELEGRAM_BOT_TOKEN
  const MY = process.env.TELEGRAM_MY_CHAT_ID
  const KEY = process.env.ANTHROPIC_API_KEY
  const { message } = req.body || {}
  if (!message?.chat?.id) return res.status(200).json({ ok: true })
  const chatId = String(message.chat.id)
  const text = message.text || ''
  if (MY && chatId !== String(MY)) return res.status(200).json({ ok: true })
  let reply = 'שמשון לא זמין'
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: 'אתה שמשון, עוזר אישי חכם. ענה תמיד בעברית, קצר וישיר.',
        messages: [{ role: 'user', content: text }]
      })
    })
    reply = (await r.json()).content?.[0]?.text || 'שגיאה'
  } catch(e) {
    reply = 'שגיאה: ' + e.message
  }
  await fetch('https://api.telegram.org/bot' + BOT + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: reply })
  })
  return res.status(200).json({ ok: true })
}
