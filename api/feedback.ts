import { createHmac } from 'node:crypto'
import { ObjectId } from 'mongodb'
import type { VercelRequest, VercelResponse } from './_lib/http.js'
import { feedbackCollection } from './_lib/mongo.js'
import { adminSession, getTelegramUser } from './_lib/security.js'

const MAX_MESSAGE_LENGTH = 2000
const SUBMIT_COOLDOWN_MS = 30_000

function clientId(request: VercelRequest) {
  const header = request.headers['x-client-id']
  const value = Array.isArray(header) ? header[0] : header
  return typeof value === 'string' && value.length <= 100 ? value : undefined
}

// Feedback is always anonymous: the sender is stored only as a one-way hash,
// enough for their own history and the cooldown but not to tell who wrote it.
function senderFilter(request: VercelRequest) {
  const telegramUser = getTelegramUser(request)
  const client = clientId(request)
  const raw = telegramUser ? `tg:${telegramUser.id}` : client ? `client:${client}` : null
  if (!raw) return null
  const sender = createHmac('sha256', process.env.SESSION_SECRET || 'feedback-sender').update(raw).digest('base64url')
  // Older records still carry the raw IDs.
  const legacy = telegramUser ? { telegramId: telegramUser.id } : { clientId: client }
  return { sender, filter: { $or: [{ sender }, legacy] } }
}

// Member feedback box.
// GET: the main admin gets every message (never who sent it); everyone else gets only what they sent.
// POST: anyone sends anonymous feedback.
// PATCH { id, read } and DELETE { id }: main admin only.
export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    const collection = await feedbackCollection()
    const admin = (await adminSession(request))?.role === 'owner'

    if (request.method === 'GET') {
      if (admin) {
        const records = await collection.find().sort({ submittedAt: -1 }).limit(300).toArray()
        return response.status(200).json({
          role: 'admin',
          feedback: records.map((record) => ({ id: record._id.toString(), message: record.message, read: record.read, submittedAt: record.submittedAt })),
        })
      }
      const owner = senderFilter(request)
      if (!owner) return response.status(200).json({ role: 'user', feedback: [] })
      const records = await collection.find(owner.filter).sort({ submittedAt: -1 }).limit(20).toArray()
      return response.status(200).json({
        role: 'user',
        feedback: records.map((record) => ({ id: record._id.toString(), message: record.message, read: record.read, submittedAt: record.submittedAt })),
      })
    }

    const body = request.body ?? {}

    if (request.method === 'POST') {
      const message = typeof body.message === 'string' ? body.message.trim() : ''
      if (message.length < 2 || message.length > MAX_MESSAGE_LENGTH) return response.status(400).json({ error: 'Please write your feedback (up to 2000 characters).' })
      const owner = senderFilter(request)
      if (!owner) return response.status(400).json({ error: 'Please write your feedback (up to 2000 characters).' })

      const latest = await collection.findOne(owner.filter, { sort: { submittedAt: -1 } })
      if (latest && Date.now() - new Date(latest.submittedAt).getTime() < SUBMIT_COOLDOWN_MS) {
        return response.status(429).json({ error: 'Please wait a moment before sending more feedback.' })
      }

      const record = {
        message,
        anonymous: true,
        sender: owner.sender,
        read: false,
        submittedAt: new Date().toISOString(),
      }
      const result = await collection.insertOne(record)
      return response.status(201).json({
        feedback: { id: result.insertedId.toString(), message, read: false, submittedAt: record.submittedAt },
      })
    }

    if (!admin) return response.status(403).json({ error: 'Only the main admin can manage feedback.' })
    const id = typeof body.id === 'string' && ObjectId.isValid(body.id) ? new ObjectId(body.id) : null
    if (!id) return response.status(400).json({ error: 'Feedback not found.' })

    if (request.method === 'PATCH') {
      const result = await collection.updateOne({ _id: id }, { $set: { read: body.read !== false } })
      if (result.matchedCount === 0) return response.status(404).json({ error: 'Feedback not found.' })
      return response.status(200).json({ ok: true })
    }

    if (request.method === 'DELETE') {
      const result = await collection.deleteOne({ _id: id })
      if (result.deletedCount === 0) return response.status(404).json({ error: 'Feedback not found.' })
      return response.status(200).json({ ok: true })
    }

    return response.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('Feedback API error:', error instanceof Error ? error.message : 'Unknown error')
    return response.status(503).json({ error: 'The feedback service is temporarily unavailable.' })
  }
}
