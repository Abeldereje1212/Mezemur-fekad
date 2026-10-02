import { useCallback, useEffect, useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import { Check, ClipboardCheck, Maximize2, Minus, QrCode, RotateCcw, ScanLine, Trash2, UserPlus, Users, X } from 'lucide-react'
import QrScanner from './QrScanner'

type Language = 'en' | 'am'
type AttendanceStatus = 'present' | 'absent' | 'excused'
type MemberStatus = 'pending' | 'approved' | 'rejected'

interface Member {
  telegramId: string
  name: string
  phone: string
  username?: string
  status: MemberStatus
  requestedAt: string
}

interface Session {
  id: string
  title: string
  startsAt: string
  date: string
  status: 'open' | 'closed'
  closedAt?: string
  counts?: Record<AttendanceStatus, number>
}

interface RosterRow {
  telegramId: string
  name: string
  username?: string
  status: AttendanceStatus | null
  method: 'code' | 'manual' | 'auto' | null
  markedAt: string | null
  hasPermission: boolean
}

interface SessionDetail {
  session: Session
  roster: RosterRow[]
  code?: string
  expiresAt?: string
}

interface MemberView {
  member: Member | null
  openSessions: (Session & { checkedIn: boolean })[]
  history: { sessionId: string; title: string; startsAt: string; status: AttendanceStatus; markedAt: string }[]
}

interface ScannerWebApp {
  showScanQrPopup?: (params: { text?: string }, callback: (text: string) => boolean | void) => void
  closeScanQrPopup?: () => void
}

interface AttendanceProps {
  language: Language
  isAdmin: boolean
  defaultName: string
  headers: () => Record<string, string>
  notify: (message: string) => void
}

const am: Record<string, string> = {
  'Attendance': 'ክትትል', 'ATTENDANCE': 'ክትትል',
  'Check in with the code shown at rehearsal.': 'በልምምድ ቦታ በሚታየው ኮድ ይመዝገቡ።',
  'Run check-in and keep every member accounted for.': 'የመገኘት ምዝገባ ያካሂዱ እና የሁሉንም አባላት ሁኔታ ይከታተሉ።',
  'Sessions': 'ፕሮግራሞች', 'Members': 'አባላት',
  'Open this app from the Telegram bot to use attendance.': 'ክትትልን ለመጠቀም መተግበሪያውን ከቴሌግራም ቦቱ ይክፈቱ።',
  'Join the attendance list': 'የክትትል ዝርዝሩን ይቀላቀሉ',
  'The admin will approve you before you can check in.': 'ከመመዝገብዎ በፊት አስተዳዳሪው ያጸድቅዎታል።',
  'Full name': 'ሙሉ ስም', 'Phone number': 'ስልክ ቁጥር', 'Send join request': 'የመቀላቀል ጥያቄ ላክ',
  'Your join request is waiting for admin approval.': 'የመቀላቀል ጥያቄዎ የአስተዳዳሪ ይሁንታ እየጠበቀ ነው።',
  'Your previous join request was not approved. You can send a new one.': 'ያለፈው የመቀላቀል ጥያቄዎ አልጸደቀም። አዲስ መላክ ይችላሉ።',
  'Join request sent.': 'የመቀላቀል ጥያቄ ተልኳል።',
  'No check-in is open right now.': 'አሁን ክፍት የሆነ ምዝገባ የለም።',
  'Scan QR code': 'QR ኮድ ይቃኙ', 'or enter the 6-digit code': 'ወይም ባለ 6 አሃዝ ኮዱን ያስገቡ', 'Check in': 'ተመዝገብ',
  "You're checked in": 'ተመዝግበዋል', 'Scan the check-in QR code': 'የምዝገባ QR ኮዱን ይቃኙ',
  'Starting camera…': 'ካሜራ በመክፈት ላይ…', 'Close scanner': 'ስካነሩን ዝጋ', 'Use Telegram scanner': 'የቴሌግራም ስካነር ተጠቀም',
  'Point the camera at the QR code on the screen.': 'ካሜራውን በስክሪኑ ላይ ወዳለው QR ኮድ ያዙሩ።',
  'Camera access was blocked. Allow the camera for Telegram, or enter the code below.': 'የካሜራ ፈቃድ ተከልክሏል። ለቴሌግራም ካሜራ ይፍቀዱ ወይም ኮዱን ከታች ያስገቡ።',
  'The camera is not available here. Enter the code below.': 'ካሜራ እዚህ አይገኝም። ኮዱን ከታች ያስገቡ።',
  'My attendance': 'የእኔ መገኘት', 'No attendance yet.': 'ገና የመገኘት መዝገብ የለም።',
  'Present': 'ተገኝቷል', 'Absent': 'ቀርቷል', 'Excused': 'በፈቃድ',
  'New session': 'አዲስ ፕሮግራም', 'Session name': 'የፕሮግራሙ ስም', 'Date': 'ቀን', 'Start time': 'መጀመሪያ ሰዓት',
  'Start check-in': 'ምዝገባ ጀምር', 'Choir rehearsal': 'የመዝሙር ልምምድ',
  'Recent sessions': 'የቅርብ ጊዜ ፕሮግራሞች', 'No sessions yet.': 'ገና ፕሮግራም የለም።',
  'Start a session to show the check-in QR code.': 'የምዝገባ QR ኮዱን ለማሳየት ፕሮግራም ይጀምሩ።',
  'Select a session to see its check-in.': 'ምዝገባውን ለማየት ፕሮግራም ይምረጡ።',
  'Open': 'ክፍት', 'Closed': 'ተዘግቷል', 'Close check-in': 'ምዝገባ ዝጋ', 'Reopen': 'እንደገና ክፈት', 'Delete': 'ሰርዝ',
  'Full screen': 'ሙሉ ገጽ', 'Exit full screen': 'ከሙሉ ገጽ ውጣ',
  'Code changes in': 'ኮዱ የሚቀየረው በ', 'checked in': 'ተመዝግበዋል',
  'Not marked': 'አልተመዘገበም', 'Has approved permission': 'የጸደቀ ፈቃድ አለው',
  'Closing marks everyone not checked in as Absent, or Excused if they have an approved permission for this date.': 'ሲዘጋ ያልተመዘገቡት እንደቀሩ ይመዘገባሉ፤ ለዚህ ቀን የጸደቀ ፈቃድ ያላቸው በፈቃድ ይመዘገባሉ።',
  'Delete this session and all its attendance?': 'ይህ ፕሮግራም እና መዝገቦቹ ይሰረዙ?',
  'Remove this member from the attendance list?': 'ይህ አባል ከክትትል ዝርዝሩ ይወገድ?',
  'Waiting for approval': 'ይሁንታ የሚጠብቁ', 'Approved members': 'የጸደቁ አባላት',
  'No one is waiting.': 'የሚጠብቅ የለም።', 'No approved members yet.': 'ገና የጸደቀ አባል የለም።',
  'Approve': 'አጽድቅ', 'Reject': 'ውድቅ አድርግ', 'Remove': 'አስወግድ', 'Clear mark': 'ምልክት አጽዳ',
  'No approved members yet. Approve members in the Members tab.': 'ገና የጸደቀ አባል የለም። በአባላት ክፍል ያጽድቁ።',
  // Server messages
  'Please enter your full name and phone number.': 'እባክዎ ሙሉ ስምዎን እና ስልክ ቁጥርዎን ያስገቡ።',
  'Only approved members can check in.': 'መመዝገብ የሚችሉት የጸደቁ አባላት ብቻ ናቸው።',
  'Enter the 6-digit code shown at the venue.': 'በቦታው የሚታየውን ባለ 6 አሃዝ ኮድ ያስገቡ።',
  'There is no open check-in right now.': 'አሁን ክፍት የሆነ ምዝገባ የለም።',
  'Too many wrong codes. Ask the admin to mark you present.': 'በጣም ብዙ የተሳሳቱ ኮዶች። አስተዳዳሪው እንዲመዘግብዎ ይጠይቁ።',
  'That code is wrong or has expired. Scan the current code.': 'ኮዱ የተሳሳተ ወይም ጊዜው ያለፈበት ነው። የአሁኑን ኮድ ይቃኙ።',
  'Please enter a session name.': 'እባክዎ የፕሮግራሙን ስም ያስገቡ።',
  'Please choose the session date and time.': 'እባክዎ የፕሮግራሙን ቀን እና ሰዓት ይምረጡ።',
  'The attendance service is temporarily unavailable.': 'የክትትል አገልግሎቱ ለጊዜው አይገኝም።',
  'Admin sign-in is required.': 'የአስተዳዳሪ መግቢያ ያስፈልጋል።',
}

const statusLabel: Record<AttendanceStatus, string> = { present: 'Present', absent: 'Absent', excused: 'Excused' }
const statusClass: Record<AttendanceStatus, string> = { present: 'status-approved', absent: 'status-rejected', excused: 'status-pending' }

function todayInEthiopia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Addis_Ababa' }).format(new Date())
}

function nowTimeInEthiopia() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Addis_Ababa', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
}

async function api<T>(url: string, init: RequestInit, headers: Record<string, string>): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...headers, ...(init.headers as Record<string, string> | undefined) } })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((result as { error?: string }).error || 'The attendance service is temporarily unavailable.')
  return result as T
}

export default function Attendance({ language, isAdmin, defaultName, headers, notify }: AttendanceProps) {
  const tx = useCallback((text: string) => (language === 'am' ? am[text] ?? text : text), [language])
  const formatDateTime = useCallback((value: string) => new Intl.DateTimeFormat(language === 'am' ? 'am-ET' : 'en', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value)), [language])

  return (
    <div className="page-content attendance-content">
      <section className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> BIRHANE HIWOT</div>
          <h1>{tx('Attendance')}<span className="heading-period">.</span></h1>
          <p>{tx(isAdmin ? 'Run check-in and keep every member accounted for.' : 'Check in with the code shown at rehearsal.')}</p>
        </div>
      </section>
      {isAdmin
        ? <AdminAttendance tx={tx} formatDateTime={formatDateTime} headers={headers} notify={notify} />
        : <MemberAttendance tx={tx} formatDateTime={formatDateTime} headers={headers} notify={notify} defaultName={defaultName} />}
    </div>
  )
}

interface SectionProps {
  tx: (text: string) => string
  formatDateTime: (value: string) => string
  headers: () => Record<string, string>
  notify: (message: string) => void
}

function StatusPill({ status, tx }: { status: AttendanceStatus; tx: (text: string) => string }) {
  return <span className={`status-badge ${statusClass[status]}`}><span />{tx(statusLabel[status])}</span>
}

// ---------------------------------------------------------------- Member

function MemberAttendance({ tx, formatDateTime, headers, notify, defaultName }: SectionProps & { defaultName: string }) {
  const inTelegram = Boolean(headers()['x-telegram-init-data'])
  const [view, setView] = useState<MemberView | null>(null)
  const [loading, setLoading] = useState(inTelegram)
  const [name, setName] = useState(defaultName)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      setView(await api<MemberView>('/api/attendance', { method: 'GET' }, headers()))
    } catch (error) {
      notify(tx(error instanceof Error ? error.message : 'The attendance service is temporarily unavailable.'))
    } finally {
      setLoading(false)
    }
  }, [headers, notify, tx])

  useEffect(() => {
    if (!inTelegram) return
    void load()
    // Keep the open-session list fresh so members see check-in as soon as the admin starts it.
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 15_000)
    return () => window.clearInterval(interval)
  }, [inTelegram, load])

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      await api('/api/attendance', { method: 'POST', body: JSON.stringify({ action: 'join', name, phone }) }, headers())
      notify(tx('Join request sent.'))
      await load()
    } catch (error) {
      notify(tx(error instanceof Error ? error.message : 'The attendance service is temporarily unavailable.'))
    } finally {
      setBusy(false)
    }
  }

  async function checkIn(value: string) {
    const digits = value.replace(/\D/g, '')
    if (digits.length !== 6) {
      notify(tx('Enter the 6-digit code shown at the venue.'))
      return
    }
    setBusy(true)
    try {
      await api('/api/attendance', { method: 'POST', body: JSON.stringify({ action: 'check-in', code: digits }) }, headers())
      setCode('')
      notify(`✅ ${tx("You're checked in")}`)
      await load()
    } catch (error) {
      notify(tx(error instanceof Error ? error.message : 'The attendance service is temporarily unavailable.'))
    } finally {
      setBusy(false)
    }
  }

  // Accepts the text read from a check-in QR code ("FEKAD-CHECKIN:123456") and checks in with it.
  function handleScanned(text: string) {
    const match = text.match(/(\d{6})/)
    if (!match) return false
    setScannerOpen(false)
    void checkIn(match[1])
    return true
  }

  const telegramScanner = (window.Telegram?.WebApp as unknown as ScannerWebApp | undefined)?.showScanQrPopup

  // Telegram's own full-screen scanner; used when the in-page camera cannot start.
  function telegramScan() {
    const webApp = window.Telegram?.WebApp as unknown as ScannerWebApp | undefined
    setScannerOpen(false)
    if (!webApp?.showScanQrPopup) {
      notify(tx('or enter the 6-digit code'))
      return
    }
    try {
      webApp.showScanQrPopup({ text: tx('Scan the check-in QR code') }, handleScanned)
    } catch {
      notify(tx('or enter the 6-digit code'))
    }
  }

  if (!inTelegram) return <section className="form-panel att-panel"><p className="empty-copy">{tx('Open this app from the Telegram bot to use attendance.')}</p></section>
  if (loading && !view) return <p className="empty-copy">…</p>

  const member = view?.member
  if (!member || member.status === 'rejected') {
    return (
      <section className="form-panel att-panel">
        <div className="panel-heading"><div><div className="eyebrow">{tx('ATTENDANCE')}</div><h2>{tx('Join the attendance list')}</h2></div><UserPlus size={18} className="att-heading-icon" /></div>
        <p className="panel-description">{tx(member?.status === 'rejected' ? 'Your previous join request was not approved. You can send a new one.' : 'The admin will approve you before you can check in.')}</p>
        <form className="request-form" onSubmit={join}>
          <label className="field"><span>{tx('Full name')}</span><input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} /></label>
          <label className="field"><span>{tx('Phone number')}</span><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+251 9XX XXX XXX" required minLength={5} maxLength={40} /></label>
          <div className="form-footer"><span /><button className="submit-button" type="submit" disabled={busy}>{tx('Send join request')}</button></div>
        </form>
      </section>
    )
  }

  if (member.status === 'pending') {
    return <section className="form-panel att-panel att-waiting"><span className="status-badge status-pending"><span />{tx('Waiting for approval')}</span><p>{tx('Your join request is waiting for admin approval.')}</p></section>
  }

  const history = view?.history ?? []
  const presentCount = history.filter((h) => h.status === 'present').length
  const countedCount = history.filter((h) => h.status !== 'excused').length

  return (
    <div className="att-member-layout">
      <section className="form-panel att-panel">
        <div className="panel-heading"><div><div className="eyebrow">{tx('ATTENDANCE')}</div><h2>{tx('Check in')}</h2></div><QrCode size={18} className="att-heading-icon" /></div>
        {(view?.openSessions.length ?? 0) === 0 && <p className="empty-copy">{tx('No check-in is open right now.')}</p>}
        {view?.openSessions.map((session) => (
          <div className="att-checkin" key={session.id}>
            <div className="att-checkin-title"><strong>{session.title}</strong><span>{formatDateTime(session.startsAt)}</span></div>
            {session.checkedIn ? (
              <div className="att-done"><Check size={18} /> {tx("You're checked in")}</div>
            ) : (
              <>
                {scannerOpen
                  ? <QrScanner tx={tx} onResult={handleScanned} onClose={() => setScannerOpen(false)} fallback={telegramScanner ? { label: tx('Use Telegram scanner'), onClick: telegramScan } : undefined} />
                  : <button type="button" className="submit-button att-scan" onClick={() => setScannerOpen(true)} disabled={busy}><ScanLine size={17} /> {tx('Scan QR code')}</button>}
                <form className="att-code-form" onSubmit={(e) => { e.preventDefault(); void checkIn(code) }}>
                  <label className="field"><span>{tx('or enter the 6-digit code')}</span><input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" className="att-code-input" /></label>
                  <button type="submit" className="submit-button" disabled={busy || code.length !== 6}>{tx('Check in')}</button>
                </form>
              </>
            )}
          </div>
        ))}
      </section>

      <section className="form-panel att-panel">
        <div className="panel-heading"><div><div className="eyebrow">{tx('ATTENDANCE')}</div><h2>{tx('My attendance')}</h2></div>
          {countedCount > 0 && <span className="att-rate">{Math.round((presentCount / countedCount) * 100)}%</span>}
        </div>
        {history.length === 0 && <p className="empty-copy">{tx('No attendance yet.')}</p>}
        <ul className="att-history">
          {history.map((item) => (
            <li key={item.sessionId}><div><strong>{item.title}</strong><span>{formatDateTime(item.startsAt)}</span></div><StatusPill status={item.status} tx={tx} /></li>
          ))}
        </ul>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- Admin

function AdminAttendance({ tx, formatDateTime, headers, notify }: SectionProps) {
  const [tab, setTab] = useState<'sessions' | 'members'>('sessions')
  const [members, setMembers] = useState<Member[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [title, setTitle] = useState(() => tx('Choir rehearsal'))
  const [date, setDate] = useState(todayInEthiopia)
  const [time, setTime] = useState(nowTimeInEthiopia)
  const [busy, setBusy] = useState(false)

  const fail = useCallback((error: unknown) => notify(tx(error instanceof Error ? error.message : 'The attendance service is temporarily unavailable.')), [notify, tx])

  const loadOverview = useCallback(async () => {
    try {
      const result = await api<{ members: Member[]; sessions: Session[] }>('/api/attendance?view=admin', { method: 'GET' }, headers())
      setMembers(result.members)
      setSessions(result.sessions)
    } catch (error) {
      fail(error)
    }
  }, [fail, headers])

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await api<SessionDetail>(`/api/attendance?session=${encodeURIComponent(id)}`, { method: 'GET' }, headers()))
    } catch (error) {
      fail(error)
    }
  }, [fail, headers])

  useEffect(() => { void loadOverview() }, [loadOverview])

  useEffect(() => { if (selectedId) void loadDetail(selectedId) }, [selectedId, loadDetail])

  // While the selected session is open, refresh its code and roster every few seconds.
  const selectedOpen = Boolean(selectedId) && detail?.session.id === selectedId && detail.session.status === 'open'
  useEffect(() => {
    if (!selectedId || !selectedOpen) return
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void loadDetail(selectedId) }, 4_000)
    return () => window.clearInterval(interval)
  }, [selectedId, selectedOpen, loadDetail])

  async function post<T>(body: Record<string, unknown>) {
    setBusy(true)
    try {
      return await api<T>('/api/attendance', { method: 'POST', body: JSON.stringify(body) }, headers())
    } catch (error) {
      fail(error)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await post<SessionDetail>({ action: 'create-session', title, date, time })
    if (!result) return
    setDetail(result)
    setSelectedId(result.session.id)
    void loadOverview()
  }

  async function sessionAction(action: 'close-session' | 'reopen-session') {
    if (!detail) return
    const result = await post<SessionDetail>({ action, sessionId: detail.session.id })
    if (result) {
      setDetail(result)
      void loadOverview()
    }
  }

  async function deleteSession() {
    if (!detail || !window.confirm(tx('Delete this session and all its attendance?'))) return
    const result = await post({ action: 'delete-session', sessionId: detail.session.id })
    if (result) {
      setSelectedId(null)
      setDetail(null)
      void loadOverview()
    }
  }

  async function mark(telegramId: string, status: AttendanceStatus | null) {
    if (!detail) return
    const result = await post<SessionDetail>({ action: 'mark', sessionId: detail.session.id, telegramId, status })
    if (result) {
      setDetail(result)
      void loadOverview()
    }
  }

  async function reviewMember(telegramId: string, status: 'approved' | 'rejected') {
    const result = await post({ action: 'review-member', telegramId, status })
    if (result) void loadOverview()
  }

  async function removeMember(telegramId: string) {
    if (!window.confirm(tx('Remove this member from the attendance list?'))) return
    const result = await post({ action: 'remove-member', telegramId })
    if (result) void loadOverview()
  }

  const pending = members.filter((m) => m.status === 'pending')
  const approved = members.filter((m) => m.status === 'approved')

  return (
    <>
      <div className="mezmur-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'sessions'} className={tab === 'sessions' ? 'mezmur-tab active' : 'mezmur-tab'} onClick={() => setTab('sessions')}><ClipboardCheck size={14} /> {tx('Sessions')}</button>
        <button type="button" role="tab" aria-selected={tab === 'members'} className={tab === 'members' ? 'mezmur-tab active' : 'mezmur-tab'} onClick={() => setTab('members')}><Users size={14} /> {tx('Members')}{pending.length > 0 && <span className="mezmur-tab-count att-pending-count">{pending.length}</span>}</button>
      </div>

      {tab === 'members' ? (
        <div className="att-admin-grid">
          <section className="form-panel att-panel">
            <div className="panel-heading"><h2>{tx('Waiting for approval')}</h2><span className="panel-index">{pending.length}</span></div>
            {pending.length === 0 && <p className="empty-copy">{tx('No one is waiting.')}</p>}
            <ul className="att-member-list">
              {pending.map((m) => (
                <li key={m.telegramId}>
                  <div><strong>{m.name}</strong><span>{[m.username, m.phone].filter(Boolean).join(' · ')}</span></div>
                  <div className="review-actions">
                    <button type="button" className="approve-button" disabled={busy} onClick={() => reviewMember(m.telegramId, 'approved')} title={tx('Approve')} aria-label={`${tx('Approve')} ${m.name}`}><Check size={16} /></button>
                    <button type="button" className="reject-button" disabled={busy} onClick={() => reviewMember(m.telegramId, 'rejected')} title={tx('Reject')} aria-label={`${tx('Reject')} ${m.name}`}><X size={16} /></button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="form-panel att-panel">
            <div className="panel-heading"><h2>{tx('Approved members')}</h2><span className="panel-index">{approved.length}</span></div>
            {approved.length === 0 && <p className="empty-copy">{tx('No approved members yet.')}</p>}
            <ul className="att-member-list">
              {approved.map((m) => (
                <li key={m.telegramId}>
                  <div><strong>{m.name}</strong><span>{[m.username, m.phone].filter(Boolean).join(' · ')}</span></div>
                  <button type="button" className="remove-lyrics-button" disabled={busy} onClick={() => removeMember(m.telegramId)} title={tx('Remove')} aria-label={`${tx('Remove')} ${m.name}`}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <div className="att-admin-grid">
          <div className="att-side">
            <section className="form-panel att-panel">
              <div className="panel-heading"><h2>{tx('New session')}</h2></div>
              <form className="request-form att-new-form" onSubmit={createSession}>
                <label className="field"><span>{tx('Session name')}</span><input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={120} /></label>
                <div className="field-pair">
                  <label className="field"><span>{tx('Date')}</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
                  <label className="field"><span>{tx('Start time')}</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></label>
                </div>
                <button type="submit" className="submit-button" disabled={busy}><QrCode size={15} /> {tx('Start check-in')}</button>
              </form>
            </section>
            <section className="form-panel att-panel">
              <div className="panel-heading"><h2>{tx('Recent sessions')}</h2></div>
              {sessions.length === 0 && <p className="empty-copy">{tx('No sessions yet.')}</p>}
              <ul className="att-session-list">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <button type="button" className={selectedId === s.id ? 'att-session active' : 'att-session'} onClick={() => setSelectedId(s.id)}>
                      <span className="att-session-main"><strong>{s.title}</strong><span>{formatDateTime(s.startsAt)}</span></span>
                      <span className="att-session-meta">
                        <span className={s.status === 'open' ? 'att-open-dot' : 'att-closed-dot'}>{tx(s.status === 'open' ? 'Open' : 'Closed')}</span>
                        <span>{s.counts?.present ?? 0}/{s.counts?.absent ?? 0}/{s.counts?.excused ?? 0}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="form-panel att-panel att-detail">
            {!detail || detail.session.id !== selectedId
              ? <p className="empty-copy">{tx(sessions.length === 0 ? 'Start a session to show the check-in QR code.' : 'Select a session to see its check-in.')}</p>
              : <SessionPanel detail={detail} tx={tx} formatDateTime={formatDateTime} busy={busy} onMark={mark} onClose={() => sessionAction('close-session')} onReopen={() => sessionAction('reopen-session')} onDelete={deleteSession} />}
          </section>
        </div>
      )}
    </>
  )
}

interface SessionPanelProps {
  detail: SessionDetail
  tx: (text: string) => string
  formatDateTime: (value: string) => string
  busy: boolean
  onMark: (telegramId: string, status: AttendanceStatus | null) => void
  onClose: () => void
  onReopen: () => void
  onDelete: () => void
}

function SessionPanel({ detail, tx, formatDateTime, busy, onMark, onClose, onReopen, onDelete }: SessionPanelProps) {
  const { session, roster, code, expiresAt } = detail
  const [qr, setQr] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [fullScreen, setFullScreen] = useState(false)
  const isOpen = session.status === 'open'

  useEffect(() => {
    if (!code) return
    let active = true
    QRCode.toDataURL(`FEKAD-CHECKIN:${code}`, { width: 520, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => { if (active) setQr(url) })
      .catch(() => { if (active) setQr('') })
    return () => { active = false }
  }, [code])

  useEffect(() => {
    if (!isOpen) return
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(tick)
  }, [isOpen])

  const secondsLeft = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000)) : 0
  const presentCount = roster.filter((r) => r.status === 'present').length

  return (
    <>
      <div className="panel-heading att-detail-head">
        <div>
          <div className="eyebrow">{formatDateTime(session.startsAt)}</div>
          <h2>{session.title}</h2>
        </div>
        <span className={isOpen ? 'att-open-dot' : 'att-closed-dot'}>{tx(isOpen ? 'Open' : 'Closed')}</span>
      </div>

      {isOpen && code && (
        <div className={fullScreen ? 'att-qr-box att-fullscreen' : 'att-qr-box'}>
          {qr && <img src={qr} alt={`QR ${code}`} className="att-qr" />}
          <div className="att-code" aria-live="polite">{code.slice(0, 3)} {code.slice(3)}</div>
          <div className="att-timer"><span style={{ width: `${(secondsLeft / 30) * 100}%` }} /></div>
          <div className="att-qr-caption">{tx('Code changes in')} {secondsLeft}s · {presentCount}/{roster.length} {tx('checked in')}</div>
          <button type="button" className="export-button seed-toggle" onClick={() => setFullScreen((v) => !v)}><Maximize2 size={14} /> {tx(fullScreen ? 'Exit full screen' : 'Full screen')}</button>
        </div>
      )}

      <div className="att-session-actions">
        {isOpen
          ? <button type="button" className="submit-button" disabled={busy} onClick={onClose}><Check size={15} /> {tx('Close check-in')}</button>
          : <button type="button" className="export-button seed-toggle" disabled={busy} onClick={onReopen}><RotateCcw size={14} /> {tx('Reopen')}</button>}
        <button type="button" className="reject-seed-button" disabled={busy} onClick={onDelete}><Trash2 size={14} /> {tx('Delete')}</button>
      </div>
      {isOpen && <p className="panel-description">{tx('Closing marks everyone not checked in as Absent, or Excused if they have an approved permission for this date.')}</p>}

      {roster.length === 0 && <p className="empty-copy">{tx('No approved members yet. Approve members in the Members tab.')}</p>}
      <ul className="att-roster">
        {roster.map((row) => (
          <li key={row.telegramId}>
            <div className="att-roster-name">
              <strong>{row.name}</strong>
              <span>
                {row.status ? tx(statusLabel[row.status]) : tx('Not marked')}
                {row.markedAt && row.status === 'present' ? ` · ${new Date(row.markedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
                {row.hasPermission && !row.status ? ` · ${tx('Has approved permission')}` : ''}
              </span>
            </div>
            <div className="att-mark-buttons" role="group" aria-label={row.name}>
              {(['present', 'absent', 'excused'] as AttendanceStatus[]).map((status) => (
                <button key={status} type="button" disabled={busy} className={row.status === status ? `att-mark active att-${status}` : 'att-mark'} onClick={() => onMark(row.telegramId, row.status === status ? null : status)} title={row.status === status ? tx('Clear mark') : tx(statusLabel[status])}>
                  {status === 'present' ? <Check size={14} /> : status === 'absent' ? <X size={14} /> : <Minus size={14} />}
                  <span>{tx(statusLabel[status])}</span>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
