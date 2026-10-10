import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { MongoClient, type Collection, type Document } from 'mongodb'

// Admin sign-in accounts. The owner is the account named by ADMIN_USERNAME: it always exists,
// starts with ADMIN_PASSWORD, and is the only account that can create or remove other admins.
// Once the owner changes their password in the dashboard, the stored hash replaces ADMIN_PASSWORD.

export type AdminRole = 'owner' | 'admin'

export interface AdminAccountRecord extends Document {
  username: string
  passwordHash?: string
  role: AdminRole
  // Bumped on every password change so sessions issued before it stop working.
  sessionVersion: number
  createdAt: string
  createdBy?: string
  updatedAt?: string
}

export interface AdminIdentity {
  username: string
  role: AdminRole
  sessionVersion: number
}

export const MIN_PASSWORD_LENGTH = 6
const USERNAME_PATTERN = /^[a-z0-9_.-]{3,32}$/

export function normalizeUsername(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function isValidUsername(username: string) {
  return USERNAME_PATTERN.test(username)
}

export function isValidPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= MIN_PASSWORD_LENGTH && value.length <= 128
}

export function ownerUsername() {
  return normalizeUsername(process.env.ADMIN_USERNAME)
}

function databaseConfigured() {
  return Boolean(process.env.MONGODB_URI)
}

export async function adminAccountsCollection(): Promise<Collection<AdminAccountRecord>> {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not configured')

  globalThis.permissionMongoClient ??= new MongoClient(uri).connect()
  const client = await globalThis.permissionMongoClient
  const collection = client.db(process.env.MONGODB_DB || 'birhane_hiwot').collection<AdminAccountRecord>('admin_accounts')
  await collection.createIndex({ username: 1 }, { unique: true })
  return collection
}

function scryptAsync(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key))
  })
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await scryptAsync(password, salt)
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, saltHex, keyHex] = stored.split(':')
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false
  const expected = Buffer.from(keyHex, 'hex')
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'))
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function envPasswordMatches(password: string) {
  const expected = process.env.ADMIN_PASSWORD
  if (!expected) return false
  const left = Buffer.from(password)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

// Looks up who a session belongs to. Returns null when the account no longer exists.
export async function findAdmin(username: string): Promise<AdminIdentity | null> {
  const owner = ownerUsername()
  if (!databaseConfigured()) {
    return owner && username === owner ? { username, role: 'owner', sessionVersion: 0 } : null
  }
  const record = await (await adminAccountsCollection()).findOne({ username })
  if (owner && username === owner) return { username, role: 'owner', sessionVersion: record?.sessionVersion ?? 0 }
  if (!record || record.role !== 'admin') return null
  return { username, role: 'admin', sessionVersion: record.sessionVersion }
}

export async function checkCredentials(usernameInput: unknown, password: unknown): Promise<AdminIdentity | null> {
  const username = normalizeUsername(usernameInput)
  if (!username || typeof password !== 'string' || !password) return null
  const owner = ownerUsername()

  const record = databaseConfigured() ? await (await adminAccountsCollection()).findOne({ username }) : null
  if (owner && username === owner) {
    const valid = record?.passwordHash ? await verifyPassword(password, record.passwordHash) : envPasswordMatches(password)
    return valid ? { username, role: 'owner', sessionVersion: record?.sessionVersion ?? 0 } : null
  }
  if (!record || record.role !== 'admin' || !record.passwordHash) return null
  return await verifyPassword(password, record.passwordHash) ? { username, role: 'admin', sessionVersion: record.sessionVersion } : null
}

export async function setPassword(username: string, password: string, role: AdminRole) {
  const collection = await adminAccountsCollection()
  const now = new Date().toISOString()
  await collection.updateOne(
    { username },
    {
      $set: { passwordHash: await hashPassword(password), updatedAt: now, role },
      $inc: { sessionVersion: 1 },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  )
}
