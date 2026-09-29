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
      if (!telegramUser) return response.status(401).json({ error: 'Open this app in Telegram to view your requests.' })
      const collection = await permissionRequests()
      const records = await collection.find({ telegramId: telegramUser.id }).sort({ submittedAt: -1 }).limit(100).toArray()
      return response.status(200).json({ role: 'user', requests: records.map(toPermissionRequest) })
    }

    if (request.method === 'POST') {
      const telegramUser = getTelegramUser(request)
      if (!telegramUser) return response.status(401).json({ error: 'Open this app in Telegram to submit a request.' })

      const { name, username, phone, type, date, reason } = request.body ?? {}
      if (typeof name !== 'string' || name.trim().length < 2 || name.length > 120 || typeof username !== 'string' || username.trim().length > 120 || typeof phone !== 'string' || phone.trim().length < 5 || phone.length > 40 || typeof type !== 'string' || !permissionTypes.has(type) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof reason !== 'string' || reason.trim().length < 2 || reason.length > 2000) {
        return response.status(400).json({ error: 'Please provide valid request details.' })
      }

      const record: PermissionRecord = {
        name: name.trim(),
        username: telegramUser.username ? `@${telegramUser.username}` : username.trim().replace(/^@/, '') ? `@${username.trim().replace(/^@/, '')}` : 'Telegram user',
        phone: phone.trim(),
        type,
        date,
        reason: reason.trim(),
        status: 'pending',
        submittedAt: new Date().toISOString(),
        telegramId: telegramUser.id,
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
      return response.status(200).json({ request: toPermissionRequest(result) })
    }

    return response.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('Request API error:', error instanceof Error ? error.message : 'Unknown error')
    return response.status(500).json({ error: 'The request service is temporarily unavailable.' })
  }
}