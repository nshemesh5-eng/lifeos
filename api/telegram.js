// api/telegram.js — שמשון Telegram Bot webhook
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).json({ ok: true })
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  const MY_CHAT_ID = process.env.TELEGRAM_MY_CHAT_ID
  const baseUrl = 'https://lifeos-eight-inky.vercel.app'
  const { message } = req.body || {}
  if (!message) return res.status(200).json({ ok: true })
  const chatId = message.chat?.id?.toString()
  const text = message.text || ''
  if (MY_CHAT_ID && chatId !== MY_CHAT_ID) {
    await sendTelegram(BOT_TOKEN, chatId, 'לא מורשה')
    return res.status(200).json({ ok: true })
  }
  let reply = 'שמשון לא זמין כרגע'
  try {
    const r = await fetch(baseUrl + '/api/shimshon', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', parts: [{ text }] }], source: 'telegram' })
    })
    const d = await r.json()
    reply = d.text || 'שגיאה'
  } catch {}
  await sendTelegram(BOT_TOKEN, chatId, reply)
  res.status(200).json({ ok: true })
}
async function sendTelegram(token, chatId, text) {
  return fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  })
}