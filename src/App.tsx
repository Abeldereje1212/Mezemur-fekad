import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  FileClock,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react'
import './App.css'

type RequestStatus = 'pending' | 'approved' | 'rejected'
type PermissionType = 'Annual leave' | 'Sick leave' | 'Personal leave' | 'Late arrival' | 'Early departure' | 'Other'

interface PermissionRequest {
  id: string
  name: string
  username: string
  phone: string
  type: PermissionType
  date: string
  reason: string
  status: RequestStatus
  submittedAt: string
}

interface TelegramUser {
  first_name?: string
  last_name?: string
  username?: string
}

declare global {
  interface Window {
    Telegram?: { WebApp?: { ready: () => void; expand: () => void; initDataUnsafe?: { user?: TelegramUser } } }
  }
}

const STORAGE_KEY = 'fekad-permission-requests'
const DEMO_ADMIN_USERNAME = 'admin'
const DEMO_ADMIN_PASSWORD = 'fekad123'
const permissionTypes: PermissionType[] = ['Annual leave', 'Sick leave', 'Personal leave', 'Late arrival', 'Early departure', 'Other']
const todayLabel = new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())
const statusLabels: Record<RequestStatus, string> = {
  pending: 'Awaiting review',
  approved: 'Approved',
  rejected: 'Rejected',
}

function localDate(offset = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const sampleRequests: PermissionRequest[] = [
  {
    id: 'sample-1', name: 'Marta Bekele', username: '@marta_b', phone: '+251 911 204 871',
    type: 'Annual leave', date: localDate(3), reason: 'Family commitment outside the city.', status: 'pending', submittedAt: new Date().toISOString(),
  },
  {
    id: 'sample-2', name: 'Dawit Alemu', username: '@dawit_a', phone: '+251 922 315 062',
    type: 'Sick leave', date: localDate(-1), reason: 'I have a doctor appointment and need to rest.', status: 'approved', submittedAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'sample-3', name: 'Selam Tadesse', username: '@selam_t', phone: '+251 933 426 153',
    type: 'Personal leave', date: localDate(1), reason: 'Taking care of an urgent personal matter.', status: 'pending', submittedAt: new Date(Date.now() - 172800000).toISOString(),
  },
]

function readRequests(): PermissionRequest[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) as PermissionRequest[] : sampleRequests
  } catch {
    return sampleRequests
  }
}

function formatDate(value: string) {
  if (!value) return 'No date'
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function StatusBadge({ status }: { status: RequestStatus }) {
  return <span className={`status-badge status-${status}`}><span />{statusLabels[status]}</span>
}

function App() {
  const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user
  const initialName = [telegramUser?.first_name, telegramUser?.last_name].filter(Boolean).join(' ')
  const [requests, setRequests] = useState<PermissionRequest[]>(readRequests)
  const [view, setView] = useState<'requests' | 'admin'>('requests')
  const [adminAuthenticated, setAdminAuthenticated] = useState(false)
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [toast, setToast] = useState('')
  const [name, setName] = useState(initialName)
  const [username, setUsername] = useState(telegramUser?.username ? `@${telegramUser.username}` : '')
  const [phone, setPhone] = useState('')
  const [type, setType] = useState<PermissionType>('Annual leave')
  const [date, setDate] = useState(localDate(1))
  const [reason, setReason] = useState('')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  useEffect(() => {
    window.Telegram?.WebApp?.ready()
    window.Telegram?.WebApp?.expand()
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(requests))
  }, [requests])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const pendingCount = requests.filter((request) => request.status === 'pending').length
  const approvedCount = requests.filter((request) => request.status === 'approved').length
  const rejectedCount = requests.filter((request) => request.status === 'rejected').length
  const filteredRequests = requests.filter((request) => {
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || request.name.toLowerCase().includes(query) || request.username.toLowerCase().includes(query)
    return matchesSearch && (!dateFilter || request.date === dateFilter)
  })

  function openAdmin() {
    if (adminAuthenticated) {
      setView('admin')
      return
    }
    setLoginError('')
    setShowAdminLogin(true)
  }

  function signInAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (adminUsername.trim() !== DEMO_ADMIN_USERNAME || adminPassword !== DEMO_ADMIN_PASSWORD) {
      setLoginError('Username or password is incorrect.')
      return
    }
    setAdminAuthenticated(true)
    setShowAdminLogin(false)
    setAdminPassword('')
    setView('admin')
  }

  function signOutAdmin() {
    setAdminAuthenticated(false)
    setView('requests')
    setSearch('')
    setDateFilter('')
  }

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextRequest: PermissionRequest = {
      id: crypto.randomUUID(), name: name.trim(), username: username.trim().startsWith('@') ? username.trim() : `@${username.trim()}`,
      phone: phone.trim(), type, date, reason: reason.trim(), status: 'pending', submittedAt: new Date().toISOString(),
    }
    setRequests((current) => [nextRequest, ...current])
    setReason('')
    setToast('Your request has been sent to the admin.')
  }

  function updateStatus(id: string, status: RequestStatus) {
    setRequests((current) => current.map((request) => request.id === id ? { ...request, status } : request))
    setToast(status === 'approved' ? 'Permission approved.' : 'Permission rejected.')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" aria-label="Fekad home">
          <span className="brand-mark">f</span>
          <span className="brand-name">fekad<span>WORKPLACE</span></span>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <button className={view === 'requests' ? 'nav-item active' : 'nav-item'} onClick={() => setView('requests')}>
            <LayoutDashboard size={18} strokeWidth={1.8} /> My requests
          </button>
          <button className={view === 'admin' ? 'nav-item active' : 'nav-item'} onClick={openAdmin}>
            <ShieldCheck size={18} strokeWidth={1.8} /> Admin review
            {pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><span className="online-dot" /> Request desk is open</div>
          <div className="profile-row">
            <div className="avatar">{initialName ? initialName.charAt(0).toUpperCase() : 'F'}</div>
            <div className="profile-copy"><strong>{initialName || 'Fekad member'}</strong><span>{username ? (username.startsWith('@') ? username : `@${username}`) : '@your_username'}</span></div>
            {adminAuthenticated && <button type="button" className="logout-button" onClick={signOutAdmin} aria-label="Sign out of admin" title="Sign out"><LogOut size={16} /></button>}
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>FEKAD</span><span className="crumb-slash">/</span><strong>{view === 'admin' ? 'ADMIN REVIEW' : 'PERMISSION DESK'}</strong></div>
          <div className="topbar-right"><span className="topbar-date"><CalendarDays size={15} /> {todayLabel}</span>{adminAuthenticated && <button type="button" className="topbar-logout" onClick={signOutAdmin} aria-label="Sign out of admin" title="Sign out"><LogOut size={16} /></button>}<div className="topbar-avatar">{initialName ? initialName.charAt(0).toUpperCase() : 'F'}</div></div>
        </header>

        {view === 'requests' ? (
          <div className="page-content">
            <section className="page-heading">
              <div><div className="eyebrow"><span className="eyebrow-line" /> PEOPLE OPERATIONS</div><h1>Permission desk<span className="heading-period">.</span></h1><p>Request time away and keep track of every update.</p></div>
              <div className="heading-stamp"><Clock3 size={15} /> RESPONSE TIME <strong>Usually within 1 day</strong></div>
            </section>

            <section className="stats-strip" aria-label="Request summary">
              <div className="stat-item"><span className="stat-symbol pending-symbol"><FileClock size={17} /></span><div><span className="stat-label">Awaiting review</span><strong>{pendingCount.toString().padStart(2, '0')}</strong></div></div>
              <div className="stat-item"><span className="stat-symbol approved-symbol"><Check size={17} /></span><div><span className="stat-label">Approved</span><strong>{approvedCount.toString().padStart(2, '0')}</strong></div></div>
              <div className="stat-item"><span className="stat-symbol rejected-symbol"><X size={17} /></span><div><span className="stat-label">Not approved</span><strong>{rejectedCount.toString().padStart(2, '0')}</strong></div></div>
              <div className="stats-aside">YOUR TIME<br /><span>MATTERS HERE</span></div>
            </section>

            <div className="request-layout">
              <section className="form-panel">
                <div className="panel-heading"><div><div className="eyebrow">NEW SUBMISSION</div><h2>Request permission</h2></div><span className="panel-index">01 <span>/ 02</span></span></div>
                <p className="panel-description">Share the details below. Your admin will review and get back to you.</p>
                <form className="request-form" onSubmit={submitRequest}>
                  <label className="field"><span>Permission type</span><span className="select-wrap"><select value={type} onChange={(event) => setType(event.target.value as PermissionType)}>{permissionTypes.map((permissionType) => <option key={permissionType}>{permissionType}</option>)}</select><ChevronDown size={16} /></span></label>
                  <label className="field"><span>Date needed</span><span className="input-icon-wrap"><input type="date" value={date} min={localDate()} onChange={(event) => setDate(event.target.value)} required /><CalendarDays size={16} /></span></label>
                  <div className="field-pair">
                    <label className="field"><span>Your name</span><span className="input-icon-wrap"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" required /><UserRound size={16} /></span></label>
                    <label className="field"><span>Telegram username</span><input value={username} onChange={(event) => setUsername(event.target.value.replace(/^@/, ''))} placeholder="@username" required /></label>
                  </div>
                  <label className="field"><span>Phone number</span><span className="input-icon-wrap"><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+251 9XX XXX XXX" required /><Phone size={16} /></span></label>
                  <label className="field"><span>Reason <span className="field-hint">Give your admin a little context</span></span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="What do you need permission for?" rows={3} required /></label>
                  <div className="form-footer"><span>By submitting, this will be shared with your admin.</span><button className="submit-button" type="submit">Send request <ArrowRight size={16} /></button></div>
                </form>
              </section>

              <aside className="activity-panel">
                <div className="activity-title"><div><div className="eyebrow">YOUR ACTIVITY</div><h2>Recent requests</h2></div><span className="activity-count">{requests.length.toString().padStart(2, '0')}</span></div>
                <div className="activity-list">{requests.slice(0, 4).map((request) => <article className="activity-item" key={request.id}><span className={`activity-marker marker-${request.status}`} /><div className="activity-details"><div className="activity-type">{request.type}</div><div className="activity-meta">{formatDate(request.date)} <span>·</span> {request.username}</div><StatusBadge status={request.status} /></div><ArrowRight size={15} className="activity-arrow" /></article>)}</div>
                {requests.length === 0 && <p className="empty-copy">Your requests will show up here.</p>}
                <button type="button" className="text-link" onClick={openAdmin}>Open request log <ArrowRight size={15} /></button>
                <div className="note-panel"><div className="note-mark">“</div><p>Plans change. A little notice helps everyone stay in sync.</p><span>FEKAD PEOPLE TEAM</span></div>
              </aside>
            </div>
          </div>
        ) : (
          <div className="page-content admin-content">
            <section className="page-heading admin-heading">
              <div><div className="eyebrow"><span className="eyebrow-line" /> PEOPLE OPERATIONS / ADMIN</div><h1>Request log<span className="heading-period">.</span></h1><p>Review requests and keep the team moving.</p></div>
              <div className="admin-count"><span>NEEDS YOUR ATTENTION</span><strong>{pendingCount.toString().padStart(2, '0')} <small>pending</small></strong></div>
            </section>
            <section className="admin-summary"><div><span>ALL REQUESTS</span><strong>{requests.length.toString().padStart(2, '0')}</strong></div><div><span>APPROVED</span><strong>{approvedCount.toString().padStart(2, '0')}</strong></div><div><span>REJECTED</span><strong>{rejectedCount.toString().padStart(2, '0')}</strong></div><div className="summary-accent"><span>OPEN</span><strong>{pendingCount.toString().padStart(2, '0')}</strong></div></section>
            <section className="log-panel">
              <div className="log-heading"><div><div className="eyebrow">INBOX</div><h2>All permissions <span>{filteredRequests.length}</span></h2></div><button type="button" className="export-button" onClick={() => { setSearch(''); setDateFilter('') }}><X size={15} /> Clear filters</button></div>
              <div className="filters-row"><label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or Telegram username" aria-label="Filter by name or Telegram username" /></label><label className="date-filter"><CalendarDays size={16} /><input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label="Filter by date" /></label><span className="filter-caption">FILTER REQUESTS</span></div>
              <div className="table-wrap"><table><thead><tr><th>REQUESTER</th><th>PERMISSION</th><th>DATE NEEDED</th><th>PHONE</th><th>REASON</th><th>STATUS</th><th className="action-column">REVIEW</th></tr></thead><tbody>{filteredRequests.map((request) => <tr key={request.id}><td><div className="requester-cell"><span className="requester-avatar">{request.name.charAt(0).toUpperCase()}</span><span><strong>{request.name}</strong><small>{request.username}</small></span></div></td><td><span className="type-tag">{request.type}</span></td><td className="date-cell">{formatDate(request.date)}</td><td className="phone-cell">{request.phone}</td><td className="reason-cell" title={request.reason}>{request.reason}</td><td><StatusBadge status={request.status} /></td><td><div className="review-actions">{request.status === 'pending' ? <><button type="button" className="approve-button" onClick={() => updateStatus(request.id, 'approved')} aria-label={`Approve ${request.name}'s request`} title="Approve"><Check size={16} /></button><button type="button" className="reject-button" onClick={() => updateStatus(request.id, 'rejected')} aria-label={`Reject ${request.name}'s request`} title="Reject"><X size={16} /></button></> : <span className="reviewed-mark" aria-label="Reviewed"><Check size={15} /></span>}</div></td></tr>)}</tbody></table>
                {filteredRequests.length === 0 && <div className="table-empty"><Search size={20} /><strong>No requests found</strong><span>Try a different name, username, or date.</span></div>}</div>
              <div className="table-foot"><span>Showing {filteredRequests.length} of {requests.length} requests</span><span><span className="online-dot" /> Up to date</span></div>
            </section>
            <div className="admin-footnote"><ShieldCheck size={16} /> Decisions update the request status immediately for the person who submitted it.</div>
          </div>
        )}
      </main>
      {showAdminLogin && <div className="login-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAdminLogin(false) }}><section className="login-dialog" role="dialog" aria-modal="true" aria-labelledby="login-title"><button type="button" className="login-close" onClick={() => setShowAdminLogin(false)} aria-label="Close sign in"><X size={17} /></button><div className="login-icon"><LockKeyhole size={19} /></div><div className="eyebrow">ADMIN ACCESS</div><h2 id="login-title">Welcome back.</h2><p className="login-description">Sign in to review team permission requests.</p><form className="login-form" onSubmit={signInAdmin}><label className="field"><span>Username</span><input autoComplete="username" value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} placeholder="Admin username" required /></label><label className="field"><span>Password</span><input type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder="Enter password" required /></label>{loginError && <p className="login-error" role="alert">{loginError}</p>}<button type="submit" className="submit-button login-submit">Sign in <ArrowRight size={16} /></button></form><div className="demo-credentials"><strong>Demo sign-in</strong><span>Username <b>admin</b></span><span>Password <b>fekad123</b></span></div></section></div>}
      {toast && <div className="toast" role="status"><span><Check size={16} /></span>{toast}<button type="button" onClick={() => setToast('')} aria-label="Dismiss notification"><X size={15} /></button></div>}
      <button className="mobile-new-button" onClick={() => setView('requests')} aria-label="Create a request"><Plus size={21} /></button>
    </div>
  )
}

export default App
