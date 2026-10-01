import { ObjectId } from 'mongodb'
import type { VercelRequest, VercelResponse } from './_lib/http.js'
import { permissionRequests, toPermissionRequest, type PermissionRecord } from './_lib/mongo.js'
import { getTelegramUser, isAdmin } from './_lib/security.js'

const permissionTypes = new Set(['Annual leave', 'Sick leave', 'Personal leave', 'Late arrival', 'Early departure', 'Other'])

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    if (request.method === 'GET') {
      if (isAdmin(request)) {
        const collection = await permissionRequests()
        const records = await collection.find({}).sort({ submittedAt: -1 }).limit(500).toArray()
        return response.status(200).json({ role: 'admin', requests: records.map(toPermissionRequest) })
      }

      const telegramUser = getTelegramUser(request)
      const clientIdHeader = request.headers['x-client-id']
      const clientId = Array.isArray(clientIdHeader) ? clientIdHeader[0] : clientIdHeader

      const conditions: Array<Record<string, unknown>> = []
      if (telegramUser?.id) {
        conditions.push({ telegramId: telegramUser.id })
      }
      if (clientId && typeof clientId === 'string' && clientId.trim().length > 0) {
        conditions.push({ telegramId: clientId.trim() })
        conditions.push({ clientId: clientId.trim() })
      }

      if (conditions.length === 0) {
        return response.status(200).json({ role: 'user', requests: [] })
      }

      const collection = await permissionRequests()
      const records = await collection
        .find({ $or: conditions })
        .sort({ submittedAt: -1 })
        .limit(100)
        .toArray()
      return response.status(200).json({ role: 'user', requests: records.map(toPermissionRequest) })
    }

    if (request.method === 'POST') {
      const telegramUser = getTelegramUser(request)
      const clientIdHeader = request.headers['x-client-id']
      const clientId = Array.isArray(clientIdHeader) ? clientIdHeader[0] : clientIdHeader

      const { name, phone, type, date, reason, username: bodyUsername } = request.body ?? {}
      if (typeof name !== 'string' || name.trim().length < 2 || name.length > 120 || typeof phone !== 'string' || phone.trim().length < 5 || phone.length > 40 || typeof type !== 'string' || !permissionTypes.has(type) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof reason !== 'string' || reason.trim().length < 2 || reason.length > 2000) {
        return response.status(400).json({ error: 'Please provide valid request details.' })
      }

      let resolvedUsername: string
      let resolvedTelegramId: string
      if (telegramUser) {
        resolvedUsername = telegramUser.username ? `@${telegramUser.username}` : 'Telegram user'
        resolvedTelegramId = telegramUser.id
      } else {
        resolvedUsername = typeof bodyUsername === 'string' && bodyUsername.trim().length > 0
          ? (bodyUsername.trim().startsWith('@') ? bodyUsername.trim() : `@${bodyUsername.trim()}`)
          : 'Browser user'
        resolvedTelegramId = clientId && typeof clientId === 'string' && clientId.trim().length > 0
          ? clientId.trim()
          : `browser-${Date.now()}`
      }

      const record: PermissionRecord = {
        name: name.trim(),
        username: resolvedUsername,
        phone: phone.trim(),
        type,
        date,
        reason: reason.trim(),
        status: 'pending',
        submittedAt: new Date().toISOString(),
        telegramId: resolvedTelegramId,
        ...(clientId && typeof clientId === 'string' ? { clientId: clientId.trim() } : {}),
      }
      const collection = await permissionRequests()
      const result = await collection.insertOne(record)
      return response.status(201).json({ request: toPermissionRequest({ ...record, _id: result.insertedId }) })
    }

    if (request.method === 'PATCH') {
      if (!isAdmin(request)) return response.status(401).json({ error: 'Admin sign-in is required.' })
      const { id, status } = request.body ?? {}
      if (typeof id !== 'string' || !ObjectId.isValid(id) || (status !== 'approved' && status !== 'rejected')) {
        return response.status(400).json({ error: 'Invalid request decision.' })
      }

      const collection = await permissionRequests()
      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id), status: 'pending' },
        { $set: { status } },
        { returnDocument: 'after' },
      )
      if (!result) return response.status(404).json({ error: 'Request was not found or was already reviewed.' })

      if (result.telegramId && !result.telegramId.startsWith('browser-')) {
        const botToken = process.env.TELEGRAM_BOT_TOKEN
        if (botToken) {
          const statusText = status === 'approved' ? '✅ ተፈቅዷል (Approved)' : '❌ አልተፈቀደም (Rejected)'
          const notificationMsg = [
            `🔔 <b>የፈቃድ ጥያቄ ውሳኔ / Request Decision</b>`,
            ``,
            `ሰላም <b>${result.name}</b>፣`,
            `ለ <b>${result.date}</b> ያቀረቡት የ<b>${result.type}</b> ፈቃድ ጥያቄ፡`,
            `ውሳኔ፡ <b>${statusText}</b>`,
            ``,
            `ዝርዝር መረጃዎችን በመተግበሪያው ውስጥ ማየት ይችላሉ።`,
          ].join('\n')

          fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: result.telegramId,
              text: notificationMsg,
              parse_mode: 'HTML',
            }),
          }).catch((err) => console.error('Telegram notification error:', err))
        }
      }

      return response.status(200).json({ request: toPermissionRequest(result) })
    }

    return response.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('Request API error:', error instanceof Error ? error.message : 'Unknown error')
    return response.status(500).json({ error: 'The request service is temporarily unavailable.' })
  }
}
