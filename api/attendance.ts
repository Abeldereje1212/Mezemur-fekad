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
import { constantTimeEqual, getTelegramUser, isAdmin, signScopedToken, telegramAuthFailure, verifyScopedToken } from './_lib/security.js'
import { buildXlsx } from './_lib/xlsx.js'

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

// ---- Reports ----

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const EXPORT_LINK_TTL_SECONDS = 5 * 60

interface ReportRange { from: string | null; to: string | null }

function readRange(from: unknown, to: unknown): ReportRange | null {
  const clean = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)
  const range = { from: clean(from), to: clean(to) }
  if ((range.from && !DATE_PATTERN.test(range.from)) || (range.to && !DATE_PATTERN.test(range.to))) return null
  if (range.from && range.to && range.from > range.to) return null
  return range
}

// Share of sessions attended, ignoring excused ones; null when nothing counts yet.
function attendanceRate(present: number, absent: number) {
  return present + absent > 0 ? Math.round((present * 100) / (present + absent)) : null
}

async function buildReport(range: ReportRange) {
  const dateFilter = range.from || range.to
    ? { date: { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) } }
    : {}
  const sessions = await (await attendanceSessionsCollection()).find(dateFilter).sort({ startsAt: 1 }).limit(1000).toArray()
  const sessionIds = sessions.map((s) => s._id.toString())
  const records = sessionIds.length > 0
    ? await (await attendanceRecordsCollection()).find({ sessionId: { $in: sessionIds } }).toArray()
    : []
  const recordedIds = [...new Set(records.map((r) => r.telegramId))]
  const members = await (await membersCollection()).find({ $or: [{ status: 'approved' }, { telegramId: { $in: recordedIds } }] }).toArray()
  const memberById = new Map(members.map((m) => [m.telegramId, m]))

  const blank = () => ({ present: 0, absent: 0, excused: 0 })
  const bySession = new Map(sessionIds.map((id) => [id, blank()]))
  const byMember = new Map<string, Record<AttendanceStatus, number>>()
  for (const record of records) {
    bySession.get(record.sessionId)![record.status]++
    const counts = byMember.get(record.telegramId) ?? blank()
    counts[record.status]++
    byMember.set(record.telegramId, counts)
  }

  const memberIds = [...new Set([...members.filter((m) => m.status === 'approved').map((m) => m.telegramId), ...recordedIds])]
  const memberStats = memberIds.map((telegramId) => {
    const member = memberById.get(telegramId)
    const counts = byMember.get(telegramId) ?? blank()
    return {
      telegramId,
      name: member?.name ?? 'Unknown member',
      phone: member?.phone ?? '',
      username: member?.username ?? '',
      active: member?.status === 'approved',
      ...counts,
      rate: attendanceRate(counts.present, counts.absent),
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  const sessionStats = sessions.map((s) => {
    const counts = bySession.get(s._id.toString())!
    return { ...publicSession(s), ...counts, rate: attendanceRate(counts.present, counts.absent) }
  })

  const totals = records.reduce((sum, r) => { sum[r.status]++; return sum }, blank())
  return {
    range,
    totals: { sessions: sessions.length, ...totals, rate: attendanceRate(totals.present, totals.absent) },
    sessions: sessionStats,
    members: memberStats,
    records,
    memberById,
  }
}

const exportLabels = {
  en: {
    members: 'Members', sessions: 'Sessions', details: 'Details',
    name: 'Name', username: 'Username', phone: 'Phone', memberStatus: 'Member status', active: 'Active', removed: 'Removed',
    present: 'Present', absent: 'Absent', excused: 'Excused', marked: 'Sessions marked', rate: 'Attendance %',
    date: 'Date', time: 'Start time', session: 'Session', state: 'Status', open: 'Open', closed: 'Closed',
    member: 'Member', how: 'How marked', checkIn: 'Marked at', code: 'QR / code', manual: 'Admin', auto: 'Automatic (on close)',
  },
  am: {
    members: 'አባላት', sessions: 'ፕሮግራሞች', details: 'ዝርዝር',
    name: 'ስም', username: 'የቴሌግራም ስም', phone: 'ስልክ', memberStatus: 'የአባል ሁኔታ', active: 'ንቁ', removed: 'የተወገደ',
    present: 'ተገኝቷል', absent: 'ቀርቷል', excused: 'በፈቃድ', marked: 'የተመዘገቡ ፕሮግራሞች', rate: 'የመገኘት %',
    date: 'ቀን', time: 'መጀመሪያ ሰዓት', session: 'ፕሮግራም', state: 'ሁኔታ', open: 'ክፍት', closed: 'ተዘግቷል',
    member: 'አባል', how: 'የተመዘገበበት መንገድ', checkIn: 'የተመዘገበበት ሰዓት', code: 'QR / ኮድ', manual: 'አስተዳዳሪ', auto: 'በራስ ሰር (ሲዘጋ)',
  },
}

function ethiopiaDateTime(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Addis_Ababa', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

async function buildReportWorkbook(range: ReportRange, language: 'en' | 'am') {
  const L = exportLabels[language]
  const report = await buildReport(range)
  const statusLabel = (s: AttendanceStatus) => L[s]
  const sessionById = new Map(report.sessions.map((s) => [s.id, s]))

  const membersSheet = {
    name: L.members,
    widths: [26, 18, 16, 14, 10, 10, 10, 16, 14],
    rows: [
      [L.name, L.username, L.phone, L.memberStatus, L.present, L.absent, L.excused, L.marked, L.rate],
      ...report.members.map((m) => [m.name, m.username, m.phone, m.active ? L.active : L.removed, m.present, m.absent, m.excused, m.present + m.absent + m.excused, m.rate]),
    ],
  }
  const sessionsSheet = {
    name: L.sessions,
    widths: [12, 11, 30, 11, 10, 10, 10, 14],
    rows: [
      [L.date, L.time, L.session, L.state, L.present, L.absent, L.excused, L.rate],
      ...report.sessions.map((s) => [s.date, ethiopiaDateTime(s.startsAt).time, s.title, s.status === 'open' ? L.open : L.closed, s.present, s.absent, s.excused, s.rate]),
    ],
  }
  const detailRows = report.records
    .map((r) => ({ r, s: sessionById.get(r.sessionId)!, m: report.memberById.get(r.telegramId) }))
    .sort((a, b) => a.s.startsAt.localeCompare(b.s.startsAt) || (a.m?.name ?? '').localeCompare(b.m?.name ?? ''))
    .map(({ r, s, m }) => {
      const marked = ethiopiaDateTime(r.markedAt)
      return [s.date, s.title, m?.name ?? 'Unknown member', m?.phone ?? '', statusLabel(r.status), L[r.method], `${marked.date} ${marked.time}`]
    })
  const detailsSheet = {
    name: L.details,
    widths: [12, 30, 26, 16, 12, 20, 18],
    rows: [[L.date, L.session, L.member, L.phone, L.state, L.how, L.checkIn], ...detailRows],
  }
  return buildXlsx([membersSheet, sessionsSheet, detailsSheet])
}

function requestOrigin(request: VercelRequest) {
  const header = (name: string) => {
    const value = request.headers[name]
    return (Array.isArray(value) ? value[0] : value)?.split(',')[0].trim()
  }
  const host = header('x-forwarded-host') ?? header('host') ?? 'localhost'
  const proto = header('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  try {
    const admin = isAdmin(request)

    if (request.method === 'GET') {
      const query = queryParams(request)

      // Excel download via a short-lived signed link (works in Telegram's downloader, which sends no cookies).
      if (query.get('view') === 'export') {
        const payload = verifyScopedToken('attendance-export', query.get('token'))
        if (!payload) return response.status(401).json({ error: 'This download link has expired. Export again.' })
        const { from, to, lang } = JSON.parse(payload) as ReportRange & { lang: 'en' | 'am' }
        const bytes = await buildReportWorkbook({ from, to }, lang === 'am' ? 'am' : 'en')
        const fileName = `attendance_${from ?? 'start'}_${to ?? 'today'}.xlsx`
        response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
        response.setHeader('Cache-Control', 'no-store')
        response.statusCode = 200
        response.end(Buffer.from(bytes))
        return
      }

      if (query.get('view') === 'report') {
        if (!admin) return response.status(401).json({ error: 'Admin sign-in is required.' })
        const range = readRange(query.get('from'), query.get('to'))
        if (!range) return response.status(400).json({ error: 'Please choose a valid date range.' })
        const { records: _records, memberById: _memberById, ...report } = await buildReport(range)
        return response.status(200).json(report)
      }

      if (query.get('view') === 'admin') {
        if (!admin) return response.status(401).json({ error: 'Admin sign-in is required.' })
        const [members, sessions, records] = await Promise.all([
          membersCollection().then((c) => c.find({ status: { $in: ['pending', 'approved'] } }).sort({ requestedAt: -1 }).toArray()),
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
        // A removed member can join again, so they see the join form like a newcomer.
        const visible = member && member.status !== 'removed' ? publicMember(member) : null
        return response.status(200).json({ member: visible, openSessions: [], history: [] })
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
      // Soft remove: they leave the roster, but their name stays on past attendance in reports.
      const result = await (await membersCollection()).updateOne({ telegramId }, { $set: { status: 'removed', reviewedAt: new Date().toISOString() } })
      if (result.matchedCount === 0) return response.status(404).json({ error: 'Member not found.' })
      return response.status(200).json({ ok: true })
    }

    if (action === 'export-link') {
      const range = readRange(body.from, body.to)
      if (!range) return response.status(400).json({ error: 'Please choose a valid date range.' })
      const lang = body.lang === 'am' ? 'am' : 'en'
      const token = signScopedToken('attendance-export', JSON.stringify({ ...range, lang }), EXPORT_LINK_TTL_SECONDS)
      return response.status(200).json({
        url: `${requestOrigin(request)}/api/attendance?view=export&token=${encodeURIComponent(token)}`,
        fileName: `attendance_${range.from ?? 'start'}_${range.to ?? 'today'}.xlsx`,
      })
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
