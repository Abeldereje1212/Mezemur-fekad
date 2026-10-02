import { MongoClient, type Collection, type Document } from 'mongodb'

declare global {
  var permissionMongoClient: Promise<MongoClient> | undefined
}

export interface PermissionRecord extends Document {
  name: string
  username: string
  phone: string
  type: string
  date: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  submittedAt: string
  telegramId: string
  clientId?: string
}

export async function permissionRequests(): Promise<Collection<PermissionRecord>> {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not configured')

  globalThis.permissionMongoClient ??= new MongoClient(uri).connect()
  const client = await globalThis.permissionMongoClient
  const db = process.env.MONGODB_DB || 'birhane_hiwot'
  const collection = client.db(db).collection<PermissionRecord>('permission_requests')
  await collection.createIndex({ telegramId: 1, submittedAt: -1 })
  await collection.createIndex({ clientId: 1, submittedAt: -1 })
  await collection.createIndex({ date: 1 })
  return collection
}

export function toPermissionRequest(document: PermissionRecord & { _id: { toString(): string } }) {
  const { _id, telegramId: _telegramId, ...record } = document
  return { ...record, id: _id.toString() }
}

export const MEZMUR_CATEGORIES = ['michael', 'zewetir', 'meskel', 'lidet', 'timket'] as const
export type MezmurCategory = typeof MEZMUR_CATEGORIES[number]

export interface LyricsRecord extends Document {
  title: string
  lyrics: string
  category?: MezmurCategory
  seedKey?: string
  createdAt: string
}

export async function lyricsCollection(): Promise<Collection<LyricsRecord>> {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not configured')

  globalThis.permissionMongoClient ??= new MongoClient(uri).connect()
  const client = await globalThis.permissionMongoClient
  const db = process.env.MONGODB_DB || 'birhane_hiwot'
  const collection = client.db(db).collection<LyricsRecord>('lyrics')
  await collection.createIndex({ createdAt: 1 })
  return collection
}

// Songbook seed songs an admin rejected (or deleted after approving), so they stop showing as pending.
export interface SeedRejectionRecord extends Document {
  seedKey: string
  rejectedAt: string
}

export async function seedRejectionsCollection(): Promise<Collection<SeedRejectionRecord>> {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not configured')

  globalThis.permissionMongoClient ??= new MongoClient(uri).connect()
  const client = await globalThis.permissionMongoClient
  const db = process.env.MONGODB_DB || 'birhane_hiwot'
  const collection = client.db(db).collection<SeedRejectionRecord>('lyrics_seed_rejections')
  await collection.createIndex({ seedKey: 1 }, { unique: true })
  return collection
}

export function toLyricsBox(document: LyricsRecord & { _id: { toString(): string } }) {
  const { _id, ...record } = document
  return { ...record, id: _id.toString() }
}

export interface UserVisitRecord extends Document {
  telegramId: string
  username?: string
  firstName?: string
  lastName?: string
  lastNotifiedAt: string
  visitCount: number
}

export async function userVisitsCollection(): Promise<Collection<UserVisitRecord>> {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not configured')

  globalThis.permissionMongoClient ??= new MongoClient(uri).connect()
  const client = await globalThis.permissionMongoClient
  const db = process.env.MONGODB_DB || 'birhane_hiwot'
  const collection = client.db(db).collection<UserVisitRecord>('user_visits')
  await collection.createIndex({ telegramId: 1 }, { unique: true })
  return collection
}

export interface SentNotificationRecord extends Document {
  title?: string
  message: string
  target: 'all' | string
  targetName?: string
  sentCount: number
  failedCount: number
  sentAt: string
}

export async function sentNotificationsCollection(): Promise<Collection<SentNotificationRecord>> {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not configured')

  globalThis.permissionMongoClient ??= new MongoClient(uri).connect()
  const client = await globalThis.permissionMongoClient
  const db = process.env.MONGODB_DB || 'birhane_hiwot'
  const collection = client.db(db).collection<SentNotificationRecord>('sent_notifications')
  await collection.createIndex({ sentAt: -1 })
  return collection
}
async function attendanceDb() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not configured')

  globalThis.permissionMongoClient ??= new MongoClient(uri).connect()
  const client = await globalThis.permissionMongoClient
  return client.db(process.env.MONGODB_DB || 'birhane_hiwot')
}

export type MemberStatus = 'pending' | 'approved' | 'rejected' | 'removed'

export interface MemberRecord extends Document {
  telegramId: string
  name: string
  phone: string
  username?: string
  status: MemberStatus
  requestedAt: string
  reviewedAt?: string
}

export async function membersCollection(): Promise<Collection<MemberRecord>> {
  const collection = (await attendanceDb()).collection<MemberRecord>('members')
  await collection.createIndex({ telegramId: 1 }, { unique: true })
  return collection
}

export interface AttendanceSessionRecord extends Document {
  title: string
  startsAt: string
  // Calendar date of the session in Ethiopia (YYYY-MM-DD), used to match permission requests.
  date: string
  status: 'open' | 'closed'
  // Server-only key the rotating check-in code is derived from. Never sent to clients.
  secret: string
  createdAt: string
  closedAt?: string
}

export async function attendanceSessionsCollection(): Promise<Collection<AttendanceSessionRecord>> {
  const collection = (await attendanceDb()).collection<AttendanceSessionRecord>('attendance_sessions')
  await collection.createIndex({ startsAt: -1 })
  await collection.createIndex({ status: 1 })
  return collection
}

export type AttendanceStatus = 'present' | 'absent' | 'excused'

export interface AttendanceRecord extends Document {
  sessionId: string
  telegramId: string
  status: AttendanceStatus
  method: 'code' | 'manual' | 'auto'
  markedAt: string
}

export async function attendanceRecordsCollection(): Promise<Collection<AttendanceRecord>> {
  const collection = (await attendanceDb()).collection<AttendanceRecord>('attendance_records')
  await collection.createIndex({ sessionId: 1, telegramId: 1 }, { unique: true })
  await collection.createIndex({ telegramId: 1, markedAt: -1 })
  return collection
}

// Failed check-in code attempts per member per session, to stop guessing the code.
export interface CheckInAttemptRecord extends Document {
  sessionId: string
  telegramId: string
  failures: number
}

export async function checkInAttemptsCollection(): Promise<Collection<CheckInAttemptRecord>> {
  const collection = (await attendanceDb()).collection<CheckInAttemptRecord>('attendance_attempts')
  await collection.createIndex({ sessionId: 1, telegramId: 1 }, { unique: true })
  return collection
}
