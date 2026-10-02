import type { VercelRequest, VercelResponse } from './_lib/http.js'
import { userVisitsCollection } from './_lib/mongo.js'
import { getTelegramUser, telegramBotToken } from './_lib/security.js'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Cooldown between welcome messages (2 hours in milliseconds) to prevent spamming on rapid reloads
const NOTIFICATION_COOLDOWN_MS = 2 * 60 * 60 * 1000

export default async function handler(request: VercelRequest, response: VercelResponse) {
  // Allow POST or GET for versatility
  if (request.method !== 'POST' && request.method !== 'GET') {
    return response.status(405).json({ error: 'Method not allowed' })
  }

  const telegramUser = getTelegramUser(request)
  if (!telegramUser) {
    // If not opened inside Telegram (e.g. standard browser), return gracefully
    return response.status(200).json({ notified: false, reason: 'not_telegram' })
  }

  const botToken = telegramBotToken()
  if (!botToken) {
    return response.status(200).json({ notified: false, reason: 'bot_token_missing' })
  }

  try {
    const visits = await userVisitsCollection()
    const existing = await visits.findOne({ telegramId: telegramUser.id })

    const now = Date.now()
    if (existing?.lastNotifiedAt) {
      const lastTime = new Date(existing.lastNotifiedAt).getTime()
      if (now - lastTime < NOTIFICATION_COOLDOWN_MS) {
        // Increment visit count without re-sending notification
        await visits.updateOne(
          { telegramId: telegramUser.id },
          { $inc: { visitCount: 1 } },
        )
        return response.status(200).json({ notified: false, reason: 'cooldown' })
      }
    }

    const firstName = escapeHtml(telegramUser.first_name || telegramUser.username || 'ወዳጃችን')
    const welcomeText = [
      `👋 <b>ሰላም ${firstName}!</b>`,
      '',
      `እንኳን ወደ <b>ብርሃነ ሕይወት ሰንበት ት/ቤት</b> የፈቃድ መጠየቂያ መተግበሪያ በደህና መጡ።`,
      '',
      `✨ <b>በዚህ መተግበሪያ፦</b>`,
      `• የፈቃድ ጥያቄዎን በቀላሉ ማቅረብ ይችላሉ`,
      `• የጥያቄዎን ሁኔታ (ጸድቋል / ውድቅ ተደርጓል) መከታተል ይችላሉ`,
      `• መዝሙሮችን እና ግጥሞችን ማግኘት ይችላሉ`,
      '',
      `🙏 <i>መልካም የሰንበት ት/ቤት አገልግሎት ጊዜ ይሁንልዎ!</i>`,
    ].join('\n')

    const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramUser.id,
        text: welcomeText,
        parse_mode: 'HTML',
      }),
    })

    const tgResult = (await tgResponse.json().catch(() => ({}))) as { ok?: boolean; description?: string }

    if (tgResult.ok) {
      await visits.updateOne(
        { telegramId: telegramUser.id },
        {
          $set: {
            username: telegramUser.username,
            firstName: telegramUser.first_name,
            lastName: telegramUser.last_name,
            lastNotifiedAt: new Date().toISOString(),
          },
          $inc: { visitCount: 1 },
        },
        { upsert: true },
      )
      return response.status(200).json({ notified: true })
    } else {
      // User might have blocked the bot or not started it yet
      return response.status(200).json({
        notified: false,
        reason: tgResult.description || 'telegram_send_failed',
      })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return response.status(500).json({ error: message })
  }
}
