import type { VercelRequest, VercelResponse } from '../_lib/http.js'
import { constantTimeEqual, issueAdminSession } from '../_lib/security.js'

export default function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' })

  const expectedUsername = process.env.ADMIN_USERNAME
  const expectedPassword = process.env.ADMIN_PASSWORD
  const { username, password } = request.body ?? {}
  if (!expectedUsername || !expectedPassword) return response.status(503).json({ error: 'Admin authentication is not configured' })
  if (typeof username !== 'string' || typeof password !== 'string' || !constantTimeEqual(username.trim(), expectedUsername) || !constantTimeEqual(password, expectedPassword)) {
    return response.status(401).json({ error: 'Username or password is incorrect.' })
  }

  try {
    issueAdminSession(response)
    return response.status(200).json({ ok: true })
  } catch {
    return response.status(503).json({ error: 'Admin authentication is not configured' })
  }
}