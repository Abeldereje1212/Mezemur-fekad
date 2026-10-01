import { ObjectId } from 'mongodb'
import type { VercelRequest, VercelResponse } from './_lib/http.js'
import { lyricsCollection, toLyricsBox, MEZMUR_CATEGORIES, type LyricsRecord, type MezmurCategory } from './_lib/mongo.js'
import { isAdmin } from './_lib/security.js'

function isCategory(value: unknown): value is MezmurCategory {
  return typeof value === 'string' && (MEZMUR_CATEGORIES as readonly string[]).includes(value)
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    // GET — public, anyone can view lyrics
    if (request.method === 'GET') {
      const collection = await lyricsCollection()
      const records = await collection.find({}).sort({ createdAt: 1 }).limit(500).toArray()
      return response.status(200).json({ lyrics: records.map(toLyricsBox) })
    }

    // POST — admin only, add a new lyrics box
    if (request.method === 'POST') {
      if (!isAdmin(request)) return response.status(401).json({ error: 'Admin sign-in is required.' })

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
      const result = await collection.deleteOne({ _id: new ObjectId(id) })
      if (result.deletedCount === 0) return response.status(404).json({ error: 'Lyrics box not found.' })
      return response.status(200).json({ ok: true })
    }

    return response.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('Lyrics API error:', error instanceof Error ? error.message : 'Unknown error')
    return response.status(500).json({ error: 'The lyrics service is temporarily unavailable.' })
  }
}
