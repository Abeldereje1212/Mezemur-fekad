import type { VercelRequest, VercelResponse } from '../_lib/http.js'
import { clearAdminSession } from '../_lib/security.js'

export default function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' })
  clearAdminSession(response)
  return response.status(200).json({ ok: true })
}