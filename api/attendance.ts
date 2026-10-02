import { createHmac, randomBytes } from 'node:crypto'
import { ObjectId } from 'mongodb'
import type { VercelRequest, VercelResponse } from './_lib/http.js'
import {
  attendanceRecordsCollection,
  attendanceSessionsCollection,
  checkInAttemptsCollection,
  membersCollection,
  permissionRequests,
  type AttendanceRecord,
  type AttendanceSessionRecord,
  type AttendanceStatus,
  type MemberRecord,
} from './_lib/mongo.js'
import { constantTimeEqual, getTelegramUser, isAdmin, telegramAuthFailure } from './_lib/security.js'

// The check-in code changes every 30 seconds; the previous code is still accepted so a member
// who scanned just before the switch is not rejected.
const CODE_WINDOW_MS = 30_000
const MAX_FAILED_ATTEMPTS = 10
const ATTENDANCE_STATUSES = new Set<AttendanceStatus>(['present', 'absent', 'excused'])

function codeFor(secret: string, window: number) {
  const digest = createHmac('sha256', secret).update(String(window)).digest()
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0')
}

function currentCode(session: AttendanceSessionRecord) {
  const window = Math.floor(Date.now() / CODE_WINDOW_MS)
  return { code: codeFor(session.secret, window), expiresAt: new Date((window + 1) * CODE_WINDOW_MS).toISOString() }
}

function codeMatches(session: AttendanceSessionRecord, code: string) {
  const window = Math.floor(Date.now() / CODE_WINDOW_MS)
  return [window, window - 1].some((w) => constantTimeEqual(codeFor(session.secret, w), code))
}

function publicSession(session: AttendanceSessionRecord & { _id: ObjectId }) {
  return { id: session._id.toString(), title: session.title, startsAt: session.startsAt, date: session.date, status: session.status, closedAt: session.closedAt }
}

function publicMember(member: MemberRecord) {
  return { telegramId: member.telegramId, name: member.name, phone: member.phone, username: member.username, status: member.status, requestedAt: member.requestedAt }
}

function queryParams(request: VercelRequest) {
  return new URL(request.url ?? '/', 'http://localhost').searchParams
}

async function findSession(id: unknown) {
  if (typeof id !== 'string' || !ObjectId.isValid(id)) return null
  return (await attendanceSessionsCollection()).findOne({ _id: new ObjectId(id) })
}

// Approved members on leave that day according to an approved permission request.
async function excusedMemberIds(date: string, memberIds: string[]) {
  if (memberIds.length === 0) return new Set<string>()
  const requests = await permissionRequests()
  const ids = await requests.distinct('telegramId', { status: 'approved', date, telegramId: { $in: memberIds } })
  return new Set(ids.map(String))
}

async function sessionDetail(session: AttendanceSessionRecord & { _id: ObjectId }) {
  const sessionId = session._id.toString()
  const [members, records] = await Promise.all([
    membersCollection().then((c) => c.find({ status: 'approved' }).sort({ name: 1 }).toArray()),
    attendanceRecordsCollection().then((c) => c.find({ sessionId }).toArray()),
  ])
  const byMember = new Map(records.map((record) => [record.telegramId, record]))
  const excused = session.status === 'open' ? await excusedMemberIds(session.date, members.map((m) => m.telegramId)) : new Set<string>()
  const roster = members.map((member) => {
    const record = byMember.get(member.telegramId)
    return {
      telegramId: member.telegramId,
      name: member.name,
      username: member.username,
      status: record?.status ?? null,
      method: record?.method ?? null,
      markedAt: record?.markedAt ?? null,
      // While open, show who will be excused automatically when the session closes.
      hasPermission: excused.has(member.telegramId),
    }
  })
  return {
    session: publicSession(session),
    roster,
    ...(session.status === 'open' ? currentCode(session) : {}),
  }
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    const admin = isAdmin(request)

    if (request.method === 'GET') {
      const query = queryParams(request)

      if (query.get('view') === 'admin') {
        if (!admin) return response.status(401).json({ error: 'Admin sign-in is required.' })
        const [members, sessions, records] = await Promise.all([
          membersCollection().then((c) => c.find({ status: { $ne: 'rejected' } }).sort({ requestedAt: -1 }).toArray()),
          attendanceSessionsCollection().then((c) => c.find({}).sort({ startsAt: -1 }).limit(50).toArray()),
          attendanceRecordsCollection().then((c) => c.aggregate<{ _id: { sessionId: string; status: AttendanceStatus }; count: number }>([
            { $group: { _id: { sessionId: '$sessionId', status: '$status' }, count: { $sum: 1 } } },
          ]).toArray()),
        ])
        const counts = new Map<string, Record<AttendanceStatus, number>>()
        for (const row of records) {
          const entry = counts.get(row._id.sessionId) ?? { present: 0, absent: 0, excused: 0 }
          entry[row._id.status] = row.count
          counts.set(row._id.sessionId, entry)
        }
        return response.status(200).json({
          members: members.map(publicMember),
          sessions: sessions.map((s) => ({ ...publicSession(s), counts: counts.get(s._id.toString()) ?? { present: 0, absent: 0, excused: 0 } })),
        })
      }

      if (query.get('session')) {
        if (!admin) return response.status(401).json({ error: 'Admin sign-in is required.' })
        const session = await findSession(query.get('session'))
        if (!session) return response.status(404).json({ error: 'Session not found.' })
        return response.status(200).json(await sessionDetail(session))
      }

      // Member view: own membership, open sessions and history.
      const telegramUser = getTelegramUser(request)
      if (!telegramUser) {
        const failure = telegramAuthFailure(request)
        return response.status(failure.status).json({ error: failure.error, code: failure.code })
      }
      const member = await (await membersCollection()).findOne({ telegramId: telegramUser.id })
      if (!member || member.status !== 'approved') {
        return response.status(200).json({ member: member ? publicMember(member) : null, openSessions: [], history: [] })
      }
      const [openSessions, myRecords] = await Promise.all([
        attendanceSessionsCollection().then((c) => c.find({ status: 'open' }).sort({ startsAt: -1 }).toArray()),
        attendanceRecordsCollection().then((c) => c.find({ telegramId: telegramUser.id }).sort({ markedAt: -1 }).limit(100).toArray()),
      ])
      const sessionIds = [...new Set(myRecords.map((r) => r.sessionId))].filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id))
      const historySessions = sessionIds.length > 0
        ? await (await attendanceSessionsCollection()).find({ _id: { $in: sessionIds } }).toArray()
        : []
      const sessionById = new Map(historySessions.map((s) => [s._id.toString(), s]))
      const recordBySession = new Map(myRecords.map((r) => [r.sessionId, r]))
      return response.status(200).json({
        member: publicMember(member),
        openSessions: openSessions.map((s) => ({ ...publicSession(s), checkedIn: recordBySession.get(s._id.toString())?.status === 'present' })),
        history: myRecords
          .filter((r) => sessionById.has(r.sessionId))
          .map((r) => {
            const s = sessionById.get(r.sessionId)!
            return { sessionId: r.sessionId, title: s.title, startsAt: s.startsAt, status: r.status, markedAt: r.markedAt }
          })
          .sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
      })
    }

    if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' })

    const body = request.body ?? {}
    const action = body.action

    // ---- Member actions (Telegram identity) ----
    if (action === 'join' || action === 'check-in') {
      const telegramUser = getTelegramUser(request)
      if (!telegramUser) {
        const failure = telegramAuthFailure(request)
        return response.status(failure.status).json({ error: failure.error, code: failure.code })
      }
      const members = await membersCollection()

      if (action === 'join') {
        const { name, phone } = body
        if (typeof name !== 'string' || name.trim().length < 2 || name.length > 120 || typeof phone !== 'string' || phone.trim().length < 5 || phone.length > 40) {
          return response.status(400).json({ error: 'Please enter your full name and phone number.' })
        }
        const existing = await members.findOne({ telegramId: telegramUser.id })
        if (existing?.status === 'approved') return response.status(200).json({ member: publicMember(existing) })
        const record: MemberRecord = {
          telegramId: telegramUser.id,
          name: name.trim(),
          phone: phone.trim(),
          ...(telegramUser.username ? { username: `@${telegramUser.username}` } : {}),
          status: 'pending',
          requestedAt: new Date().toISOString(),
        }
        await members.replaceOne({ telegramId: telegramUser.id }, record, { upsert: true })
        return response.status(201).json({ member: publicMember(record) })
      }

      // check-in
      const member = await members.findOne({ telegramId: telegramUser.id, status: 'approved' })
      if (!member) return response.status(403).json({ error: 'Only approved members can check in.' })
      const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '') : ''
      if (code.length !== 6) return response.status(400).json({ error: 'Enter the 6-digit code shown at the venue.' })

      const openSessions = await (await attendanceSessionsCollection()).find({ status: 'open' }).toArray()
      if (openSessions.length === 0) return response.status(400).json({ error: 'There is no open check-in right now.' })

      const attempts = await checkInAttemptsCollection()
      const blocked = await attempts.find({ telegramId: telegramUser.id, sessionId: { $in: openSessions.map((s) => s._id.toString()) }, failures: { $gte: MAX_FAILED_ATTEMPTS } }).toArray()
      const usable = openSessions.filter((s) => !blocked.some((b) => b.sessionId === s._id.toString()))
      if (usable.length === 0) return response.status(429).json({ error: 'Too many wrong codes. Ask the admin to mark you present.' })

      const session = usable.find((s) => codeMatches(s, code))
      if (!session) {
        await attempts.bulkWrite(usable.map((s) => ({
          updateOne: { filter: { sessionId: s._id.toString(), telegramId: telegramUser.id }, update: { $inc: { failures: 1 } }, upsert: true },
        })))
        return response.status(400).json({ error: 'That code is wrong or has expired. Scan the current code.' })
      }

      const records = await attendanceRecordsCollection()
      const markedAt = new Date().toISOString()
      await records.updateOne(
        { sessionId: session._id.toString(), telegramId: telegramUser.id },
        { $set: { status: 'present', method: 'code', markedAt } },
        { upsert: true },
      )
      return response.status(200).json({ ok: true, session: publicSession(session), markedAt })
    }

    // ---- Admin actions ----
    if (!admin) return response.status(401).json({ error: 'Admin sign-in is required.' })

    if (action === 'review-member') {
      const { telegramId, status } = body
      if (typeof telegramId !== 'string' || (status !== 'approved' && status !== 'rejected')) {
        return response.status(400).json({ error: 'Invalid member decision.' })
      }
      const result = await (await membersCollection()).findOneAndUpdate(
        { telegramId },
        { $set: { status, reviewedAt: new Date().toISOString() } },
        { returnDocument: 'after' },
      )
      if (!result) return response.status(404).json({ error: 'Member not found.' })
      return response.status(200).json({ member: publicMember(result) })
    }

    if (action === 'remove-member') {
      const { telegramId } = body
      if (typeof telegramId !== 'string') return response.status(400).json({ error: 'Member not found.' })
      // Past attendance records are kept for reports; the member just leaves the roster.
      const result = await (await membersCollection()).deleteOne({ telegramId })
      if (result.deletedCount === 0) return response.status(404).json({ error: 'Member not found.' })
      return response.status(200).json({ ok: true })
    }

    if (action === 'create-session') {
      const { title, date, time } = body
      if (typeof title !== 'string' || title.trim().length < 2 || title.length > 120) {
        return response.status(400).json({ error: 'Please enter a session name.' })
      }
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) {
        return response.status(400).json({ error: 'Please choose the session date and time.' })
      }
      // Ethiopia is UTC+3 all year (no daylight saving).
      const startsAt = new Date(`${date}T${time}:00+03:00`)
      if (Number.isNaN(startsAt.getTime())) return response.status(400).json({ error: 'Please choose the session date and time.' })
      const record: AttendanceSessionRecord = {
        title: title.trim(),
        startsAt: startsAt.toISOString(),
        date,
        status: 'open',
        secret: randomBytes(32).toString('hex'),
        createdAt: new Date().toISOString(),
      }
      const sessions = await attendanceSessionsCollection()
      const result = await sessions.insertOne(record)
      return response.status(201).json(await sessionDetail({ ...record, _id: result.insertedId }))
    }

    if (action === 'close-session') {
      const session = await findSession(body.sessionId)
      if (!session) return response.status(404).json({ error: 'Session not found.' })
      if (session.status === 'open') {
        const sessionId = session._id.toString()
        const [members, records] = await Promise.all([
          membersCollection().then((c) => c.find({ status: 'approved' }).toArray()),
          attendanceRecordsCollection(),
        ])
        const marked = new Set((await records.distinct('telegramId', { sessionId })).map(String))
        const unmarked = members.map((m) => m.telegramId).filter((id) => !marked.has(id))
        const excused = await excusedMemberIds(session.date, unmarked)
        const markedAt = new Date().toISOString()
        if (unmarked.length > 0) {
          await records.bulkWrite(unmarked.map((telegramId) => ({
            updateOne: {
              filter: { sessionId, telegramId },
              // $setOnInsert so a check-in that lands during closing is never overwritten.
              update: { $setOnInsert: { sessionId, telegramId, status: excused.has(telegramId) ? 'excused' : 'absent', method: 'auto', markedAt } as AttendanceRecord },
              upsert: true,
            },
          })))
        }
        await (await attendanceSessionsCollection()).updateOne({ _id: session._id }, { $set: { status: 'closed', closedAt: markedAt } })
        session.status = 'closed'
        session.closedAt = markedAt
      }
      return response.status(200).json(await sessionDetail(session))
    }

    if (action === 'reopen-session') {
      const session = await findSession(body.sessionId)
      if (!session) return response.status(404).json({ error: 'Session not found.' })
      const sessionId = session._id.toString()
      // Drop the automatic absent/excused marks so they are recalculated on the next close.
      await (await attendanceRecordsCollection()).deleteMany({ sessionId, method: 'auto' })
      await (await attendanceSessionsCollection()).updateOne({ _id: session._id }, { $set: { status: 'open' }, $unset: { closedAt: '' } })
      session.status = 'open'
      delete session.closedAt
      return response.status(200).json(await sessionDetail(session))
    }

    if (action === 'delete-session') {
      const session = await findSession(body.sessionId)
      if (!session) return response.status(404).json({ error: 'Session not found.' })
      const sessionId = session._id.toString()
      await Promise.all([
        attendanceRecordsCollection().then((c) => c.deleteMany({ sessionId })),
        checkInAttemptsCollection().then((c) => c.deleteMany({ sessionId })),
        attendanceSessionsCollection().then((c) => c.deleteOne({ _id: session._id })),
      ])
      return response.status(200).json({ ok: true })
    }

    if (action === 'mark') {
      const { sessionId, telegramId, status } = body
      const session = await findSession(sessionId)
      if (!session) return response.status(404).json({ error: 'Session not found.' })
      if (typeof telegramId !== 'string') return response.status(400).json({ error: 'Member not found.' })
      const records = await attendanceRecordsCollection()
      if (status === null) {
        await records.deleteOne({ sessionId: session._id.toString(), telegramId })
      } else if (typeof status === 'string' && ATTENDANCE_STATUSES.has(status as AttendanceStatus)) {
        await records.updateOne(
          { sessionId: session._id.toString(), telegramId },
          { $set: { status: status as AttendanceStatus, method: 'manual', markedAt: new Date().toISOString() } },
          { upsert: true },
        )
      } else {
        return response.status(400).json({ error: 'Invalid attendance status.' })
      }
      return response.status(200).json(await sessionDetail(session))
    }

    return response.status(400).json({ error: 'Unknown action.' })
  } catch (error) {
    console.error('Attendance API error:', error instanceof Error ? error.message : 'Unknown error')
    return response.status(500).json({ error: 'The attendance service is temporarily unavailable.' })
  }
}
