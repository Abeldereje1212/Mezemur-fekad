import { ObjectId } from 'mongodb'
import type { VercelRequest, VercelResponse } from './_lib/http.js'
import { lyricsCollection, seedRejectionsCollection, toLyricsBox, MEZMUR_CATEGORIES, type LyricsRecord, type MezmurCategory } from './_lib/mongo.js'
import { mezmurSongs } from './_lib/mezmur-seed.js'
import { isAdmin } from './_lib/security.js'

function isCategory(value: unknown): value is MezmurCategory {
  return typeof value === 'string' && (MEZMUR_CATEGORIES as readonly string[]).includes(value)
}

// Songbook songs that are neither published nor rejected yet.
async function pendingSeedSongs() {
  const [published, rejected] = await Promise.all([
    lyricsCollection().then((c) => c.distinct('seedKey', { seedKey: { $exists: true } })),
    seedRejectionsCollection().then((c) => c.distinct('seedKey')),
  ])
  const handled = new Set<string>([...published, ...rejected].filter((key): key is string => typeof key === 'string'))
  return mezmurSongs.filter((song) => !handled.has(song.seedKey))
}

function readSeedKeys(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) return null
  return value.every((key) => typeof key === 'string') ? value as string[] : null
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    if (request.method === 'GET') {
      // GET ?seed=pending — admin only, songbook songs waiting for approval
      const query = new URL(request.url ?? '/', 'http://localhost').searchParams
      if (query.get('seed') === 'pending') {
        if (!isAdmin(request)) return response.status(401).json({ error: 'Admin sign-in is required.' })
        return response.status(200).json({ pending: await pendingSeedSongs() })
      }

      // GET — public, anyone can view lyrics
      const collection = await lyricsCollection()
      const records = await collection.find({}).sort({ createdAt: 1 }).limit(500).toArray()
      return response.status(200).json({ lyrics: records.map(toLyricsBox) })
    }

    // POST — admin only, add a new lyrics box, or approve/reject songbook songs
    if (request.method === 'POST') {
      if (!isAdmin(request)) return response.status(401).json({ error: 'Admin sign-in is required.' })

      const { action } = request.body ?? {}
      if (action === 'approve-seed' || action === 'reject-seed') {
        const seedKeys = readSeedKeys(request.body?.seedKeys)
        if (!seedKeys) return response.status(400).json({ error: 'Please select at least one song.' })
        const wanted = new Set(seedKeys)
        const songs = (await pendingSeedSongs()).filter((song) => wanted.has(song.seedKey))
        if (songs.length === 0) return response.status(200).json({ boxes: [], handled: [] })

        if (action === 'reject-seed') {
          const rejectedAt = new Date().toISOString()
          const rejections = await seedRejectionsCollection()
          await rejections.bulkWrite(songs.map((song) => ({
            updateOne: { filter: { seedKey: song.seedKey }, update: { $setOnInsert: { seedKey: song.seedKey, rejectedAt } }, upsert: true },
          })))
          return response.status(200).json({ boxes: [], handled: songs.map((song) => song.seedKey) })
        }

        // Stagger createdAt by 1ms so the createdAt sort keeps the songbook order.
        const base = Date.now()
        const records: LyricsRecord[] = songs.map((song, index) => ({ ...song, createdAt: new Date(base + index).toISOString() }))
        const collection = await lyricsCollection()
        const result = await collection.insertMany(records)
        const boxes = records.map((record, index) => toLyricsBox({ ...record, _id: result.insertedIds[index] }))
        return response.status(201).json({ boxes, handled: songs.map((song) => song.seedKey) })
      }

      const { title, lyrics, category } = request.body ?? {}
      if (typeof title !== 'string' || title.trim().length < 1 || title.length > 500) {
        return response.status(400).json({ error: 'Please provide a valid song title.' })
      }
      if (typeof lyrics !== 'string' || lyrics.length > 50000) {
        return response.status(400).json({ error: 'Please provide valid lyrics content.' })
      }
      if (category !== undefined && !isCategory(category)) {
        return response.status(400).json({ error: 'Please provide a valid category.' })
      }

      const record: LyricsRecord = {
        title: title.trim(),
        lyrics: lyrics.trim(),
        ...(category ? { category } : {}),
        createdAt: new Date().toISOString(),
      }
      const collection = await lyricsCollection()
      const result = await collection.insertOne(record)
      return response.status(201).json({ box: toLyricsBox({ ...record, _id: result.insertedId }) })
    }

    // PUT — admin only, update an existing lyrics box
    if (request.method === 'PUT') {
      if (!isAdmin(request)) return response.status(401).json({ error: 'Admin sign-in is required.' })

      const { id, title, lyrics, category } = request.body ?? {}
      if (typeof id !== 'string' || !ObjectId.isValid(id)) {
        return response.status(400).json({ error: 'Invalid lyrics box ID.' })
      }
      if (typeof title !== 'string' || title.trim().length < 1 || title.length > 500) {
        return response.status(400).json({ error: 'Please provide a valid song title.' })
      }
      if (typeof lyrics !== 'string' || lyrics.length > 50000) {
        return response.status(400).json({ error: 'Please provide valid lyrics content.' })
      }
      // category: omitted = unchanged, null/'' = uncategorized, otherwise must be a known category
      if (category !== undefined && category !== null && category !== '' && !isCategory(category)) {
        return response.status(400).json({ error: 'Please provide a valid category.' })
      }

      const update = category === undefined
        ? { $set: { title: title.trim(), lyrics: lyrics.trim() } }
        : isCategory(category)
          ? { $set: { title: title.trim(), lyrics: lyrics.trim(), category } }
          : { $set: { title: title.trim(), lyrics: lyrics.trim() }, $unset: { category: '' as const } }

      const collection = await lyricsCollection()
      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        update,
        { returnDocument: 'after' },
      )
      if (!result) return response.status(404).json({ error: 'Lyrics box not found.' })
      return response.status(200).json({ box: toLyricsBox(result) })
    }

    // DELETE — admin only, remove a lyrics box
    if (request.method === 'DELETE') {
      if (!isAdmin(request)) return response.status(401).json({ error: 'Admin sign-in is required.' })

      const { id } = request.body ?? {}
      if (typeof id !== 'string' || !ObjectId.isValid(id)) {
        return response.status(400).json({ error: 'Invalid lyrics box ID.' })
      }

      const collection = await lyricsCollection()
      const deleted = await collection.findOneAndDelete({ _id: new ObjectId(id) })
      if (!deleted) return response.status(404).json({ error: 'Lyrics box not found.' })
      // A deleted songbook song should not come back as pending approval.
      if (deleted.seedKey) {
        const rejections = await seedRejectionsCollection()
        await rejections.updateOne({ seedKey: deleted.seedKey }, { $setOnInsert: { seedKey: deleted.seedKey, rejectedAt: new Date().toISOString() } }, { upsert: true })
      }
      return response.status(200).json({ ok: true })
    }

    return response.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('Lyrics API error:', error instanceof Error ? error.message : 'Unknown error')
    return response.status(500).json({ error: 'The lyrics service is temporarily unavailable.' })
  }
}
