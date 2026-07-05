// api/telegram.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true })
  const BOT = process.env.TELEGRAM_BOT_TOKEN
  const MY = process.env.TELEGRAM_MY_CHAT_ID
  const KEY = process.env.ANTHROPIC_API_KEY
  const { message } = req.body || {}
  if (!message) return res.status(200).json({ ok: true })
  const chatId = String(message.chat?.id || '')
  const text = message.text || ''
  if (MY && chatId !== MY) { await send(BOT, chatId, 'לא מורשה'); return res.status(200).json({ ok: true }) }
  let reply = 'שמשון לא זמין'
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500,
        system: 'אתה שמשון, עוזר אישי חכם. ענה תמיד בעברית, קצר וישיר כחבר.',
        messages: [{ role: 'user', content: text }] })
    })
    const d = await r.json()
    reply = d.content?.[0]?.text || ('error: ' + (d.error?.message || JSON.stringify(d)))
  } catch(e) { reply = 'שגיאה: ' + e.message }
  await send(BOT, chatId, reply)
  return res.status(200).json({ ok: true })
}
async function send(token, chatId, text) {
  try {
    await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    })
  } catch {}
}