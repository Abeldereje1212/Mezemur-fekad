// Inserts the songs from mezmur-data.mjs into the lyrics collection.
// Safe to re-run: songs whose seedKey is already in the database are skipped.
// Usage: npm run seed:mezmur   (reads MONGODB_URI / MONGODB_DB from .env.local)
import { MongoClient } from 'mongodb'
import { mezmurSongs } from './mezmur-data.mjs'

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('MONGODB_URI is not configured.')
  process.exit(1)
}

const client = new MongoClient(uri)
try {
  await client.connect()
  const collection = client.db(process.env.MONGODB_DB || 'birhane_hiwot').collection('lyrics')
  const existing = new Set(
    (await collection.find({ seedKey: { $exists: true } }, { projection: { seedKey: 1 } }).toArray()).map((doc) => doc.seedKey),
  )

  // Stagger createdAt by 1ms so the API's createdAt sort keeps the songbook order.
  const base = Date.now()
  const records = mezmurSongs
    .filter((song) => !existing.has(song.seedKey))
    .map((song, index) => ({ ...song, createdAt: new Date(base + index).toISOString() }))

  if (records.length > 0) await collection.insertMany(records)
  console.log(`Inserted ${records.length} songs, skipped ${mezmurSongs.length - records.length} already present.`)
} finally {
  await client.close()
}
