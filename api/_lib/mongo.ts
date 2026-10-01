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

export interface LyricsRecord extends Document {
  title: string
  lyrics: string
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