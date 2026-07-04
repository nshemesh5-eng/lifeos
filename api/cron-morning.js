// api/cron-morning.js — תדריך בוקר (6:00 UTC = 8:00 Israel)
export default async function handler(req, res) {
  if (req.headers['authorization'] !== 'Bearer ' + process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' })
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  const MY_CHAT_ID = process.env.TELEGRAM_MY_CHAT_ID
  if (!BOT_TOKEN || !MY_CHAT_ID) return res.status(200).json({ skip: 'not configured' })
  const prompt = 'תן לי תדריך בוקר קצר — 3-4 משפטים. כלול: הרגלים שלא עשיתי, המשימה הדחופה, יעד קלורי, משפט מוטיבציה. ספציפי עם מספרים.'
  let message = 'בוקר טוב!'
  try {
    const r = await fetch('https://lifeos-eight-inky.vercel.app/api/shimshon', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', parts: [{ text: prompt }] }], source: 'telegram' })
    })
    message = '☀️ ' + ((await r.json()).text || 'בוקר טוב!')
  } catch {}
  await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: MY_CHAT_ID, text: message })
  })
  res.status(200).json({ sent: true })
}