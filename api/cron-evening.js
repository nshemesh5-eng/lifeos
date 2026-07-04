// api/cron-evening.js — סיכום ערב דרך טלגרם (19:00 UTC = 21:00 Israel)
export default async function handler(req, res) {
  if (req.headers['authorization'] !== 'Bearer ' + process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' })
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  const MY_CHAT_ID = process.env.TELEGRAM_MY_CHAT_ID
  const baseUrl = 'https://lifeos-eight-inky.vercel.app'
  if (!BOT_TOKEN || !MY_CHAT_ID) return res.status(200).json({ skip: 'Telegram not configured' })
  const prompt = 'סכם את היום בקצרה — 3-4 משפטים. כלול: 1) כמה הרגלים עשיתי מתוך כמה 2) כמה קלוריות אכלתי מול היעד 3) האם אמנתי 4) הדבר הכי חשוב לעשות מחר.'
  let message = '🌙 סיכום יום'
  try {
    const r = await fetch(baseUrl + '/api/shimshon', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', parts: [{ text: prompt }] }], source: 'telegram' })
    })
    const d = await r.json()
    message = '🌙 ' + (d.text || 'לילה טוב!')
  } catch {}
  await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: MY_CHAT_ID, text: message })
  })
  res.status(200).json({ sent: true })
}