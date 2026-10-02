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

const INIT_DATA_MAX_AGE_SECONDS = 60 * 60 * 24

// Tokens pasted into hosting dashboards often pick up a trailing newline, spaces or quotes,
// which silently breaks every signature check.
export function telegramBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim().replace(/^["']|["']$/g, '').trim() || undefined
}

type InitDataProblem = 'not_configured' | 'missing' | 'malformed' | 'expired' | 'signature_mismatch'

function checkTelegramInitData(initData: string | undefined): { user: VerifiedTelegramUser } | { problem: InitDataProblem } {
  const botToken = telegramBotToken()
  if (!botToken) return { problem: 'not_configured' }
  if (!initData) return { problem: 'missing' }

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  const authDate = Number(params.get('auth_date'))
  const userText = params.get('user')
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash) || !Number.isFinite(authDate) || !userText) return { problem: 'malformed' }
  if (Math.abs(Math.floor(Date.now() / 1000) - authDate) > INIT_DATA_MAX_AGE_SECONDS) return { problem: 'expired' }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest()
  const suppliedHash = Buffer.from(hash, 'hex')
  if (suppliedHash.length !== expectedHash.length || !timingSafeEqual(suppliedHash, expectedHash)) return { problem: 'signature_mismatch' }

  try {
    const user = JSON.parse(userText) as Omit<VerifiedTelegramUser, 'id'> & { id: number | string }
    if (user.id === undefined || user.id === null) return { problem: 'malformed' }
    return { user: { ...user, id: String(user.id) } }
  } catch {
    return { problem: 'malformed' }
  }
}

export function verifyTelegramInitData(initData: string | undefined): VerifiedTelegramUser | null {
  const result = checkTelegramInitData(initData)
  return 'user' in result ? result.user : null
}

function initDataHeader(request: VercelRequest) {
  const header = request.headers['x-telegram-init-data']
  return Array.isArray(header) ? header[0] : header
}

export function getTelegramUser(request: VercelRequest) {
  return verifyTelegramInitData(initDataHeader(request))
}

export function telegramAuthFailure(request: VercelRequest) {
  const result = checkTelegramInitData(initDataHeader(request))
  const problem = 'problem' in result ? result.problem : 'malformed'
  // Logged (never the token or init data) so the cause shows up in the Vercel function logs.
  console.warn('Telegram sign-in rejected:', problem)
  switch (problem) {
    case 'not_configured':
      return { status: 503, code: 'TELEGRAM_NOT_CONFIGURED', error: 'Telegram authentication is not configured on the server.' }
    case 'missing':
      return { status: 401, code: 'TELEGRAM_DATA_MISSING', error: 'Telegram sign-in data is missing. Close this app and reopen it using the bot’s Mini App button.' }
    case 'expired':
      return { status: 401, code: 'TELEGRAM_DATA_EXPIRED', error: 'Your Telegram session is more than a day old. Close the Mini App completely and open it again from the bot.' }
    case 'signature_mismatch':
      return { status: 401, code: 'TELEGRAM_BOT_MISMATCH', error: 'Telegram sign-in could not be verified: the server’s bot token does not match the bot this app was opened from. The administrator must check TELEGRAM_BOT_TOKEN.' }
    default:
      return { status: 401, code: 'TELEGRAM_DATA_INVALID', error: 'Telegram sign-in could not be verified. Close and reopen the Mini App. If this continues, the administrator must check the bot configuration.' }
  }
}

export function constantTimeEqual(left: string, right: string) {
  return safeEqual(left, right)
}
