import type { VercelRequest, VercelResponse } from '../_lib/http.js'
import { userVisitsCollection, sentNotificationsCollection } from '../_lib/mongo.js'
import { isAdmin, telegramBotToken } from '../_lib/security.js'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

interface SendResult {
  ok: boolean
  // The member can never receive messages again (blocked the bot, deleted account, chat gone).
  unreachable: boolean
  description?: string
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<SendResult> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error_code?: number; description?: string }
  if (data.ok) return { ok: true, unreachable: false }
  const description = data.description ?? ''
  const unreachable = data.error_code === 403 || /chat not found|user is deactivated/i.test(description)
  return { ok: false, unreachable, description }
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!isAdmin(request)) {
    return response.status(401).json({ error: 'Admin sign-in is required.' })
  }

  const botToken = telegramBotToken()
  if (!botToken) {
    return response.status(503).json({ error: 'TELEGRAM_BOT_TOKEN is not configured on the server.' })
  }

  try {
    if (request.method === 'GET') {
      const visits = await userVisitsCollection()
      const users = await visits.find({}).sort({ lastNotifiedAt: -1 }).limit(200).toArray()
      const historyCol = await sentNotificationsCollection()
      const history = await historyCol.find({}).sort({ sentAt: -1 }).limit(30).toArray()
      const totalSubscribers = await visits.countDocuments()

      return response.status(200).json({
        users: users.map((u) => ({
          telegramId: u.telegramId,
          username: u.username,
          firstName: u.firstName,
          lastName: u.lastName,
          lastNotifiedAt: u.lastNotifiedAt,
          visitCount: u.visitCount || 1,
        })),
        history: history.map((h) => ({
          id: h._id?.toString(),
          title: h.title,
          message: h.message,
          target: h.target,
          targetName: h.targetName,
          sentCount: h.sentCount,
          failedCount: h.failedCount,
          sentAt: h.sentAt,
        })),
        totalSubscribers,
      })
    }

    if (request.method === 'POST') {
      const { target = 'all', targetName, title, message } = request.body ?? {}

      if (typeof message !== 'string' || message.trim().length === 0 || message.length > 4000) {
        return response.status(400).json({ error: 'Please enter a valid message (1-4000 characters).' })
      }

      const formatted = title && typeof title === 'string' && title.trim().length > 0
        ? `📢 <b>${escapeHtml(title.trim())}</b>\n\n${escapeHtml(message.trim())}`
        : escapeHtml(message.trim())

      let sentCount = 0
      let failedCount = 0
      const unreachableIds: string[] = []
      const visits = await userVisitsCollection()

      if (target === 'all') {
        const users = await visits.find({}).toArray()

        for (const user of users) {
          if (!user.telegramId) continue
          try {
            const result = await sendTelegramMessage(botToken, user.telegramId, formatted)
            if (result.ok) {
              sentCount++
            } else {
              failedCount++
              if (result.unreachable) unreachableIds.push(user.telegramId)
            }
          } catch {
            failedCount++
          }
        }
      } else {
        // Specific target chat_id
        let result: SendResult
        try {
          result = await sendTelegramMessage(botToken, String(target), formatted)
        } catch {
          return response.status(500).json({ error: 'Failed to contact Telegram API.' })
        }
        if (!result.ok) {
          if (result.unreachable) {
            await visits.deleteOne({ telegramId: String(target) })
            return response.status(400).json({ error: 'This member blocked the bot or deleted their account, so they were removed from the list.', removedCount: 1 })
          }
          return response.status(400).json({ error: result.description || 'Could not deliver message to this user.' })
        }
        sentCount = 1
      }

      // Members who blocked the bot will never receive messages again; drop them so they stop counting as failures.
      // They are added back automatically if they open the Mini App again.
      const removedCount = unreachableIds.length > 0
        ? (await visits.deleteMany({ telegramId: { $in: unreachableIds } })).deletedCount
        : 0

      // Record in sent notifications history
      const historyCol = await sentNotificationsCollection()
      await historyCol.insertOne({
        title: title && typeof title === 'string' && title.trim().length > 0 ? title.trim() : undefined,
        message: message.trim(),
        target: String(target),
        targetName: targetName ? String(targetName) : (target === 'all' ? 'All bot members' : String(target)),
        sentCount,
        failedCount,
        sentAt: new Date().toISOString(),
      })

      return response.status(200).json({ ok: true, sentCount, failedCount, removedCount })
    }

    return response.status(405).json({ error: 'Method not allowed' })
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown server error'
    return response.status(500).json({ error: errorMsg })
  }
}
