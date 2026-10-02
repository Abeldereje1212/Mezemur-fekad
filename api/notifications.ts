import type { VercelRequest, VercelResponse } from './_lib/http.js'
import { sentNotificationsCollection } from './_lib/mongo.js'
import { getTelegramUser } from './_lib/security.js'

// Member inbox: announcements the admin sent to all bot members, plus messages sent to this
// member personally. Personal messages need a verified Telegram identity.
export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' })

  try {
    const telegramUser = getTelegramUser(request)
    const targets = telegramUser ? ['all', telegramUser.id] : ['all']
    const collection = await sentNotificationsCollection()
    const records = await collection
      .find({ target: { $in: targets }, sentCount: { $gt: 0 } })
      .sort({ sentAt: -1 })
      .limit(50)
      .toArray()

    return response.status(200).json({
      notifications: records.map((record) => ({
        id: record._id.toString(),
        title: record.title,
        message: record.message,
        sentAt: record.sentAt,
        personal: record.target !== 'all',
      })),
    })
  } catch (error) {
    console.error('Notifications API error:', error instanceof Error ? error.message : 'Unknown error')
    return response.status(500).json({ error: 'Could not load notifications.' })
  }
}
