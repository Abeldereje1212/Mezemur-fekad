import type { VercelRequest, VercelResponse } from '../_lib/http.js'
import { userVisitsCollection, sentNotificationsCollection } from '../_lib/mongo.js'
import { isAdmin } from '../_lib/security.js'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!isAdmin(request)) {
    return response.status(401).json({ error: 'Admin sign-in is required.' })
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
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

      if (target === 'all') {
        const visits = await userVisitsCollection()
        const users = await visits.find({}).toArray()

        for (const user of users) {
          if (!user.telegramId) continue
          try {
            const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: user.telegramId,
                text: formatted,
                parse_mode: 'HTML',
              }),
            })
            const data = (await res.json().catch(() => ({}))) as { ok?: boolean }
            if (data.ok) {
              sentCount++
            } else {
              failedCount++
            }
          } catch {
            failedCount++
          }
        }
      } else {
        // Specific target chat_id
        try {
          const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: target,
              text: formatted,
              parse_mode: 'HTML',
            }),
          })
          const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string }
          if (data.ok) {
            sentCount = 1
          } else {
            failedCount = 1
            return response.status(400).json({ error: data.description || 'Could not deliver message to this user.' })
          }
        } catch {
          return response.status(500).json({ error: 'Failed to contact Telegram API.' })
        }
      }

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

      return response.status(200).json({ ok: true, sentCount, failedCount })
    }

    return response.status(405).json({ error: 'Method not allowed' })
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown server error'
    return response.status(500).json({ error: errorMsg })
  }
}
