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
}

export async function permissionRequests(): Promise<Collection<PermissionRecord>> {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not configured')

  globalThis.permissionMongoClient ??= new MongoClient(uri).connect()
  const client = await globalThis.permissionMongoClient
  const db = process.env.MONGODB_DB || 'birhane_hiwot'
  const collection = client.db(db).collection<PermissionRecord>('permission_requests')
  await collection.createIndex({ telegramId: 1, submittedAt: -1 })
  await collection.createIndex({ date: 1 })
  return collection
}

export function toPermissionRequest(document: PermissionRecord & { _id: { toString(): string } }) {
  const { _id, telegramId: _telegramId, ...record } = document
  return { ...record, id: _id.toString() }
}