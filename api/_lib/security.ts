import { createHmac, timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from './http.js'

const SESSION_COOKIE = 'bh_admin_session'
const SESSION_DURATION_SECONDS = 60 * 60 * 12

function safeEqual(left: string, right: string) {
  const leftDigest = createHmac('sha256', 'constant-time-compare').update(left).digest()
  const rightDigest = createHmac('sha256', 'constant-time-compare').update(right).digest()
  return timingSafeEqual(leftDigest, rightDigest) && left.length === right.length
}

function cookieValue(request: VercelRequest, name: string) {
  const cookieHeader = request.headers.cookie ?? ''
  const cookie = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return cookie?.slice(name.length + 1)
}

export function isAdmin(request: VercelRequest) {
  const secret = process.env.SESSION_SECRET
  const token = cookieValue(request, SESSION_COOKIE)
  if (!secret || !token) return false

  const [expiresText, signature, extra] = token.split('.')
  if (!expiresText || !signature || extra) return false
  const expires = Number(expiresText)
  if (!Number.isSafeInteger(expires) || expires <= Math.floor(Date.now() / 1000)) return false
  const expected = createHmac('sha256', secret).update(expiresText).digest('base64url')
  return safeEqual(signature, expected)
}

export function issueAdminSession(response: VercelResponse) {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters')
  const expires = Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS
  const expiresText = String(expires)
  const signature = createHmac('sha256', secret).update(expiresText).digest('base64url')
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1' ? '; Secure' : ''
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${expiresText}.${signature}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_SECONDS}${secure}`)
}

export function clearAdminSession(response: VercelResponse) {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1' ? '; Secure' : ''
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`)
}

export interface VerifiedTelegramUser {
  id: string
  username?: string
  first_name?: string
  last_name?: string
}

export function verifyTelegramInitData(initData: string | undefined): VerifiedTelegramUser | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken || !initData) return null

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  const authDate = Number(params.get('auth_date'))
  const userText = params.get('user')
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash) || !Number.isFinite(authDate) || !userText) return null
  if (Math.abs(Math.floor(Date.now() / 1000) - authDate) > 60 * 60 * 24) return null

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest()
  const suppliedHash = Buffer.from(hash, 'hex')
  if (suppliedHash.length !== expectedHash.length || !timingSafeEqual(suppliedHash, expectedHash)) return null

  try {
    const user = JSON.parse(userText) as Omit<VerifiedTelegramUser, 'id'> & { id: number | string }
    if (user.id === undefined || user.id === null) return null
    return { ...user, id: String(user.id) }
  } catch {
    return null
  }
}

export function getTelegramUser(request: VercelRequest) {
  const header = request.headers['x-telegram-init-data']
  return verifyTelegramInitData(Array.isArray(header) ? header[0] : header)
}

export function telegramAuthFailure(request: VercelRequest) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return { status: 503, code: 'TELEGRAM_NOT_CONFIGURED', error: 'Telegram authentication is not configured on the server.' }
  }
  const header = request.headers['x-telegram-init-data']
  if (!(Array.isArray(header) ? header[0] : header)) {
    return { status: 401, code: 'TELEGRAM_DATA_MISSING', error: 'Telegram sign-in data is missing. Close this app and reopen it using the bot’s Mini App button.' }
  }
  return { status: 401, code: 'TELEGRAM_DATA_INVALID', error: 'Telegram sign-in could not be verified. Close and reopen the Mini App. If this continues, the administrator must check the bot configuration.' }
}

export function constantTimeEqual(left: string, right: string) {
  return safeEqual(left, right)
}
