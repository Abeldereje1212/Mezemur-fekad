import type { VercelRequest, VercelResponse } from '../_lib/http.js'
import { checkCredentials, ownerUsername } from '../_lib/admin-accounts.js'
import { issueAdminSession } from '../_lib/security.js'

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' })

  if (!ownerUsername() || !process.env.SESSION_SECRET) return response.status(503).json({ error: 'Admin authentication is not configured' })
  const { username, password } = request.body ?? {}

  try {
    const admin = await checkCredentials(username, password)
    if (!admin) return response.status(401).json({ error: 'Username or password is incorrect.' })
    issueAdminSession(response, admin)
    return response.status(200).json({ ok: true, username: admin.username, role: admin.role })
  } catch {
    return response.status(503).json({ error: 'Admin authentication is not configured' })
  }
}
