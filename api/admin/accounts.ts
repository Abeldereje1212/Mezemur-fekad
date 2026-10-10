import type { VercelRequest, VercelResponse } from '../_lib/http.js'
import {
  adminAccountsCollection, checkCredentials, isValidPassword, isValidUsername, MIN_PASSWORD_LENGTH,
  normalizeUsername, ownerUsername, setPassword,
} from '../_lib/admin-accounts.js'
import { adminSession, issueAdminSession } from '../_lib/security.js'

// Admin account management.
// GET: who is signed in, plus the account list for the owner.
// POST action 'change-password': any admin changes their own password.
// POST action 'create' / 'reset' and DELETE: owner only.
export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    const admin = await adminSession(request)
    if (!admin) return response.status(401).json({ error: 'Admin sign-in is required.' })
    const isOwner = admin.role === 'owner'

    if (request.method === 'GET') {
      if (!isOwner) return response.status(200).json({ me: { username: admin.username, role: admin.role }, accounts: [] })
      const records = await (await adminAccountsCollection()).find({ role: 'admin' }).sort({ createdAt: 1 }).toArray()
      return response.status(200).json({
        me: { username: admin.username, role: admin.role },
        accounts: records.map((record) => ({ username: record.username, createdAt: record.createdAt, createdBy: record.createdBy, updatedAt: record.updatedAt })),
      })
    }

    const body = request.body ?? {}

    if (request.method === 'POST' && body.action === 'change-password') {
      if (!await checkCredentials(admin.username, body.currentPassword)) return response.status(400).json({ error: 'Current password is incorrect.' })
      if (!isValidPassword(body.newPassword)) return response.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` })
      await setPassword(admin.username, body.newPassword, admin.role)
      // Old sessions are now invalid; keep this device signed in with a fresh one.
      const updated = await checkCredentials(admin.username, body.newPassword)
      if (updated) issueAdminSession(response, updated)
      return response.status(200).json({ ok: true })
    }

    if (!isOwner) return response.status(403).json({ error: 'Only the main admin can manage accounts.' })

    if (request.method === 'POST' && (body.action === 'create' || body.action === 'reset')) {
      const username = normalizeUsername(body.username)
      if (!isValidUsername(username)) return response.status(400).json({ error: 'Username must be 3–32 letters, numbers, dots, dashes or underscores.' })
      if (username === ownerUsername()) return response.status(400).json({ error: 'That username belongs to the main admin.' })
      if (!isValidPassword(body.password)) return response.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` })

      const collection = await adminAccountsCollection()
      const existing = await collection.findOne({ username })
      if (body.action === 'create' && existing) return response.status(409).json({ error: 'That username is already taken.' })
      if (body.action === 'reset' && !existing) return response.status(404).json({ error: 'Account not found.' })

      await setPassword(username, body.password, 'admin')
      if (body.action === 'create') await collection.updateOne({ username }, { $set: { createdBy: admin.username } })
      return response.status(200).json({ ok: true })
    }

    if (request.method === 'DELETE') {
      const username = normalizeUsername(body.username)
      if (!username || username === ownerUsername()) return response.status(400).json({ error: 'Account not found.' })
      const result = await (await adminAccountsCollection()).deleteOne({ username, role: 'admin' })
      if (result.deletedCount === 0) return response.status(404).json({ error: 'Account not found.' })
      return response.status(200).json({ ok: true })
    }

    return response.status(405).json({ error: 'Method not allowed' })
  } catch {
    return response.status(503).json({ error: 'The account service is temporarily unavailable.' })
  }
}
