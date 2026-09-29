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
  Menu,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react'
import './App.css'

type RequestStatus = 'pending' | 'approved' | 'rejected'
type Language = 'en' | 'am'
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
  id?: number
  first_name?: string
  last_name?: string
  username?: string
}

declare global {
  interface Window {
    Telegram?: { WebApp?: { ready: () => void; expand: () => void; initData?: string; initDataUnsafe?: { user?: TelegramUser } } }
  }
}

const STORAGE_KEY = 'fekad-permission-requests'
const LANGUAGE_KEY = 'fekad-language'
const permissionTypes: PermissionType[] = ['Annual leave', 'Sick leave', 'Personal leave', 'Late arrival', 'Early departure', 'Other']
const today = new Date()
const translations: Record<Language, Record<string, string>> = {
  en: {},
  am: {
    'WORKPLACE': 'የሥራ ቦታ', 'WORKSPACE': 'የሥራ ቦታ', 'My requests': 'የእኔ ፈቃዶች', 'Admin review': 'የአስተዳዳሪ ግምገማ',
    'Request desk is open': 'የፈቃድ ጥያቄ ክፍት ነው', 'ADMIN REVIEW': 'የአስተዳዳሪ ግምገማ', 'PERMISSION DESK': 'የፈቃድ ጥያቄ',
    'PEOPLE OPERATIONS': 'የሰራተኞች አስተዳደር', 'Permission desk': 'የፈቃድ ጥያቄ', 'Request time away and keep track of every update.': 'የፈቃድ ጥያቄ ያቅርቡ እና ሁኔታውን ይከታተሉ።',
    'RESPONSE TIME': 'የምላሽ ጊዜ', 'Usually within 1 day': 'ብዙውን ጊዜ በ1 ቀን ውስጥ', 'Awaiting review': 'ግምገማ በመጠባበቅ ላይ',
    'Approved': 'ተፈቅዷል', 'Rejected': 'ውድቅ ተደርጓል', 'Not approved': 'አልተፈቀደም', 'YOUR TIME': 'ጊዜዎ', 'MATTERS HERE': 'አስፈላጊ ነው',
    'NEW SUBMISSION': 'አዲስ ጥያቄ', 'Request permission': 'ፈቃድ ይጠይቁ', 'Share the details below. Your admin will review and get back to you.': 'ከታች ያሉትን ዝርዝሮች ያስገቡ። አስተዳዳሪው ጥያቄዎን ይገመግማል።',
    'Permission type': 'የፈቃድ ዓይነት', 'Annual leave': 'ዓመታዊ ፈቃድ', 'Sick leave': 'የሕመም ፈቃድ', 'Personal leave': 'የግል ፈቃድ',
    'Late arrival': 'ዘግይቶ መግባት', 'Early departure': 'ቀድሞ መውጣት', 'Other': 'ሌላ', 'Date needed': 'የሚያስፈልግበት ቀን',
    'Your name': 'ሙሉ ስም', 'Full name': 'ሙሉ ስም', 'Telegram username': 'የቴሌግራም ስም', 'Phone number': 'ስልክ ቁጥር',
    'Reason': 'ምክንያት', 'Give your admin a little context': 'ለአስተዳዳሪው ተጨማሪ መረጃ ይስጡ', 'What do you need permission for?': 'ለምን ፈቃድ ይፈልጋሉ?',
    'By submitting, this will be shared with your admin.': 'ይህ ጥያቄ ለአስተዳዳሪው ይላካል።', 'Send request': 'ጥያቄ ላክ', 'Your request has been sent to the admin.': 'ጥያቄዎ ለአስተዳዳሪው ተልኳል።',
    'YOUR ACTIVITY': 'የእኔ ጥያቄዎች', 'Recent requests': 'የቅርብ ጊዜ ጥያቄዎች', 'Your requests will show up here.': 'ጥያቄዎችዎ እዚህ ይታያሉ።',
    'Open request log': 'ሁሉንም ጥያቄዎች ይመልከቱ', 'Plans change. A little notice helps everyone stay in sync.': 'ዕቅዶች ሊቀየሩ ይችላሉ። አስቀድሞ ማሳወቅ ሁሉንም ያግዛል።',
    'PEOPLE TEAM': 'የሰራተኞች ቡድን', 'PEOPLE OPERATIONS / ADMIN': 'የሰራተኞች አስተዳደር / አስተዳዳሪ', 'Request log': 'የጥያቄ ዝርዝር',
    'Review requests and keep the team moving.': 'ጥያቄዎችን ይገምግሙ እና ቡድኑን ያስተባብሩ።', 'NEEDS YOUR ATTENTION': 'ግምገማ የሚጠብቁ',
    'pending': 'በመጠባበቅ ላይ', 'ALL REQUESTS': 'ሁሉም ጥያቄዎች', 'REJECTED': 'ውድቅ የተደረጉ', 'OPEN': 'ክፍት',
    'INBOX': 'ጥያቄዎች', 'All permissions': 'ሁሉም ፈቃዶች', 'Clear filters': 'ማጣሪያዎችን አጽዳ',
    'Search name or Telegram username': 'በስም ወይም በቴሌግራም ስም ፈልግ', 'Filter by name or Telegram username': 'በስም ወይም በቴሌግራም ስም አጣራ',
    'Filter by date': 'በቀን አጣራ', 'FILTER REQUESTS': 'ጥያቄዎችን አጣራ', 'REQUESTER': 'ጠያቂ', 'PERMISSION': 'ፈቃድ',
    'DATE NEEDED': 'ቀን', 'PHONE': 'ስልክ', 'REASON': 'ምክንያት', 'STATUS': 'ሁኔታ', 'REVIEW': 'ውሳኔ',
    'No requests found': 'ምንም ጥያቄ አልተገኘም', 'Try a different name, username, or date.': 'ሌላ ስም ወይም ቀን ይሞክሩ።',
    'Up to date': 'የተዘመነ', 'Decisions update the request status immediately for the person who submitted it.': 'ውሳኔው የጥያቄውን ሁኔታ ወዲያውኑ ያዘምናል።',
    'ADMIN ACCESS': 'የአስተዳዳሪ መግቢያ', 'Welcome back.': 'እንኳን ደህና መጡ።', 'Sign in to review team permission requests.': 'የቡድኑን የፈቃድ ጥያቄዎች ለመገምገም ይግቡ።',
    'Username': 'የተጠቃሚ ስም', 'Password': 'የይለፍ ቃል', 'Admin username': 'የአስተዳዳሪ ስም', 'Enter password': 'የይለፍ ቃል ያስገቡ',
    'Username or password is incorrect.': 'የተጠቃሚ ስም ወይም የይለፍ ቃል ትክክል አይደለም።', 'Sign in': 'ግባ',
    'Approve': 'አጽድቅ', 'Reject': 'ውድቅ አድርግ', 'Reviewed': 'ተገምግሟል',
    'Open navigation menu': 'የአሰሳ ምናሌ ክፈት', 'Close navigation menu': 'የአሰሳ ምናሌ ዝጋ',
    'Permission approved.': 'ፈቃዱ ተፈቅዷል።', 'Permission rejected.': 'ፈቃዱ ውድቅ ተደርጓል።',
    'Open this app in Telegram to view your requests.': 'ጥያቄዎችዎን ለማየት መተግበሪያውን በቴሌግራም ይክፈቱ።',
    'Open this app in Telegram to submit a request.': 'ጥያቄ ለማቅረብ መተግበሪያውን በቴሌግራም ይክፈቱ።',
    'The request service is temporarily unavailable.': 'የጥያቄ አገልግሎቱ ለጊዜው አይገኝም።',
    'Admin sign-in is required.': 'የአስተዳዳሪ መግቢያ ያስፈልጋል።',
    'Please provide valid request details.': 'እባክዎ ትክክለኛ የጥያቄ መረጃ ያስገቡ።',
    'Could not load requests.': 'ጥያቄዎችን መጫን አልተቻለም።',
    'Could not submit the request.': 'ጥያቄውን መላክ አልተቻለም።',
    'Could not update request status.': 'የጥያቄውን ሁኔታ ማዘመን አልተቻለም።',
    'Request was not found or was already reviewed.': 'ጥያቄው አልተገኘም ወይም አስቀድሞ ተገምግሟል።',
    'Please complete all required fields.': 'እባክዎ ሁሉንም አስፈላጊ መረጃዎች ይሙሉ።',
  },
}

function t(language: Language, text: string) {
  return translations[language][text] ?? text
}

const statusKeys: Record<RequestStatus, string> = {
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

function formatDate(value: string, language: Language) {
  if (!value) return 'No date'
  return new Intl.DateTimeFormat(language === 'am' ? 'am-ET' : 'en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function StatusBadge({ status, language }: { status: RequestStatus; language: Language }) {
  return <span className={`status-badge status-${status}`}><span />{t(language, statusKeys[status])}</span>
}

function telegramHeaders(): Record<string, string> {
  const initData = window.Telegram?.WebApp?.initData
  return initData ? { 'x-telegram-init-data': initData } : {}
}

function App() {
  const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user
  const initialName = [telegramUser?.first_name, telegramUser?.last_name].filter(Boolean).join(' ')
  const [requests, setRequests] = useState<PermissionRequest[]>(() => import.meta.env.DEV ? readRequests() : [])
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem(LANGUAGE_KEY) === 'am' ? 'am' : 'en')
  const [view, setView] = useState<'requests' | 'admin'>('requests')
  const [menuOpen, setMenuOpen] = useState(false)
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
    let active = true
    fetch('/api/requests', { headers: telegramHeaders() })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not load requests.')
        return result as { role: 'admin' | 'user'; requests: PermissionRequest[] }
      })
      .then((result) => {
        if (!active) return
        setRequests(result.requests)
        if (result.role === 'admin') {
          setAdminAuthenticated(true)
          setView('admin')
        }
      })
      .catch((error: unknown) => {
        if (active && !import.meta.env.DEV) {
          setRequests([])
          setToast(t(language, error instanceof Error ? error.message : 'The request service is temporarily unavailable.'))
        }
      })
    return () => { active = false }
  }, [language])

  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language)
    document.documentElement.lang = language === 'am' ? 'am' : 'en'
    document.documentElement.dataset.language = language
  }, [language])

  const todayLabel = new Intl.DateTimeFormat(language === 'am' ? 'am-ET' : 'en', { weekday: 'short', day: 'numeric', month: 'short' }).format(today)

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

  async function signInAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginError('')
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername, password: adminPassword }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Username or password is incorrect.')

      const requestsResponse = await fetch('/api/requests')
      const requestsResult = await requestsResponse.json()
      if (!requestsResponse.ok) throw new Error(requestsResult.error || 'Could not load requests.')
      setRequests(requestsResult.requests)
      setAdminAuthenticated(true)
      setShowAdminLogin(false)
      setAdminPassword('')
      setView('admin')
    } catch (error) {
      setLoginError(t(language, error instanceof Error ? error.message : 'Could not sign in.'))
    }
  }

  async function signOutAdmin() {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => undefined)
    setAdminAuthenticated(false)
    setView('requests')
    setSearch('')
    setDateFilter('')
    try {
      const response = await fetch('/api/requests', { headers: telegramHeaders() })
      if (!response.ok) throw new Error('Could not load personal requests.')
      const result = await response.json()
      setRequests(result.requests)
    } catch {
      setRequests(import.meta.env.DEV ? readRequests() : [])
    }
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...telegramHeaders() },
        body: JSON.stringify({ name, phone, type, date, reason }),
      })
      if (import.meta.env.DEV && (response.status === 404 || response.status === 401)) {
        const localRequest: PermissionRequest = {
          id: crypto.randomUUID(), name: name.trim(), username: username.trim().startsWith('@') ? username.trim() : `@${username.trim()}`,
          phone: phone.trim(), type, date, reason: reason.trim(), status: 'pending', submittedAt: new Date().toISOString(),
        }
        const updated = [localRequest, ...requests]
        setRequests(updated)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      } else {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not submit the request.')
        setRequests((current) => [result.request, ...current])
      }
      setReason('')
      setToast(t(language, 'Your request has been sent to the admin.'))
    } catch (error) {
      setToast(t(language, error instanceof Error ? error.message : 'Could not submit the request.'))
    }
  }

  async function updateStatus(id: string, status: RequestStatus) {
    try {
      const response = await fetch('/api/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (import.meta.env.DEV && response.status === 404) {
        const updated = requests.map((request) => request.id === id ? { ...request, status } : request)
        setRequests(updated)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      } else {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not update request status.')
        setRequests((current) => current.map((request) => request.id === id ? result.request : request))
      }
      setToast(t(language, status === 'approved' ? 'Permission approved.' : 'Permission rejected.'))
    } catch (error) {
      setToast(t(language, error instanceof Error ? error.message : 'Could not update request status.'))
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" aria-label="Birhane Hiwot home">
          <span className="brand-mark">B</span>
          <span className="brand-name"><strong>Birhane Hiwot</strong><span lang="am">ብርሃነ ህይወት</span></span>
        </a>
        <div className="sidebar-label">{t(language, 'WORKSPACE')}</div>
        <nav className="side-nav" aria-label="Main navigation">
          <button className={view === 'requests' ? 'nav-item active' : 'nav-item'} onClick={() => setView('requests')}>
            <LayoutDashboard size={18} strokeWidth={1.8} /> {t(language, 'My requests')}
          </button>
          <button className={view === 'admin' ? 'nav-item active' : 'nav-item'} onClick={openAdmin}>
            <ShieldCheck size={18} strokeWidth={1.8} /> {t(language, 'Admin review')}
            {pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><span className="online-dot" /> {t(language, 'Request desk is open')}</div>
          <div className="profile-row">
            <div className="avatar">{initialName ? initialName.charAt(0).toUpperCase() : 'F'}</div>
            <div className="profile-copy"><strong>{initialName || 'Birhane Hiwot member'}</strong><span>{username ? (username.startsWith('@') ? username : `@${username}`) : '@your_username'}</span></div>
            {adminAuthenticated && <button type="button" className="logout-button" onClick={signOutAdmin} aria-label="Sign out of admin" title="Sign out"><LogOut size={16} /></button>}
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>BIRHANE HIWOT</span><span className="crumb-slash">/</span><strong>{t(language, view === 'admin' ? 'ADMIN REVIEW' : 'PERMISSION DESK')}</strong></div>
          <div className="topbar-right"><button type="button" className="language-toggle" onClick={() => setLanguage((current) => current === 'en' ? 'am' : 'en')} aria-label={language === 'en' ? 'Switch language to Amharic' : 'Switch language to English'} title={language === 'en' ? 'አማርኛ' : 'English'}>{language === 'en' ? 'አማ' : 'EN'}</button><span className="topbar-date"><CalendarDays size={15} /> {todayLabel}</span>{adminAuthenticated && <button type="button" className="topbar-logout" onClick={signOutAdmin} aria-label="Sign out of admin" title="Sign out"><LogOut size={16} /></button>}<div className="topbar-avatar">{initialName ? initialName.charAt(0).toUpperCase() : 'B'}</div><div className="menu-wrap"><button type="button" className="hamburger-button" aria-label={t(language, menuOpen ? 'Close navigation menu' : 'Open navigation menu')} aria-expanded={menuOpen} aria-controls="header-menu" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>{menuOpen && <nav id="header-menu" className="header-menu" aria-label="Main menu"><button type="button" role="menuitem" className={view === 'requests' ? 'header-menu-item active' : 'header-menu-item'} onClick={() => { setView('requests'); setMenuOpen(false) }}><LayoutDashboard size={17} />{t(language, 'My requests')}</button><button type="button" role="menuitem" className={view === 'admin' ? 'header-menu-item active' : 'header-menu-item'} onClick={() => { openAdmin(); setMenuOpen(false) }}><ShieldCheck size={17} />{t(language, 'Admin review')}{pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}</button></nav>}</div></div>
        </header>

        {view === 'requests' ? (
          <div className="page-content">
            <section className="page-heading">
              <div><div className="eyebrow"><span className="eyebrow-line" /> {t(language, 'PEOPLE OPERATIONS')}</div><h1>{t(language, 'Permission desk')}<span className="heading-period">.</span></h1><p>{t(language, 'Request time away and keep track of every update.')}</p></div>
              <div className="heading-stamp"><Clock3 size={15} /> {t(language, 'RESPONSE TIME')} <strong>{t(language, 'Usually within 1 day')}</strong></div>
            </section>

            <section className="stats-strip" aria-label="Request summary">
              <div className="stat-item"><span className="stat-symbol pending-symbol"><FileClock size={17} /></span><div><span className="stat-label">{t(language, 'Awaiting review')}</span><strong>{pendingCount.toString().padStart(2, '0')}</strong></div></div>
              <div className="stat-item"><span className="stat-symbol approved-symbol"><Check size={17} /></span><div><span className="stat-label">{t(language, 'Approved')}</span><strong>{approvedCount.toString().padStart(2, '0')}</strong></div></div>
              <div className="stat-item"><span className="stat-symbol rejected-symbol"><X size={17} /></span><div><span className="stat-label">{t(language, 'Not approved')}</span><strong>{rejectedCount.toString().padStart(2, '0')}</strong></div></div>
              <div className="stats-aside">{t(language, 'YOUR TIME')}<br /><span>{t(language, 'MATTERS HERE')}</span></div>
            </section>

            <div className="request-layout">
              <section className="form-panel">
                <div className="panel-heading"><div><div className="eyebrow">{t(language, 'NEW SUBMISSION')}</div><h2>{t(language, 'Request permission')}</h2></div><span className="panel-index">01 <span>/ 02</span></span></div>
                <p className="panel-description">{t(language, 'Share the details below. Your admin will review and get back to you.')}</p>
                <form className="request-form" onSubmit={submitRequest} onInvalidCapture={() => setToast(t(language, 'Please complete all required fields.'))}>
                  <label className="field"><span>{t(language, 'Permission type')}</span><span className="select-wrap"><select value={type} onChange={(event) => setType(event.target.value as PermissionType)}>{permissionTypes.map((permissionType) => <option key={permissionType} value={permissionType}>{t(language, permissionType)}</option>)}</select><ChevronDown size={16} /></span></label>
                  <label className="field"><span>{t(language, 'Date needed')}</span><span className="input-icon-wrap"><input type="date" value={date} min={localDate()} onChange={(event) => setDate(event.target.value)} required /><CalendarDays size={16} /></span></label>
                  <div className="field-pair">
                    <label className="field"><span>{t(language, 'Your name')}</span><span className="input-icon-wrap"><input value={name} onChange={(event) => setName(event.target.value)} placeholder={t(language, 'Full name')} required /><UserRound size={16} /></span></label>
                    <label className="field"><span>{t(language, 'Telegram username')}</span><input value={username} onChange={(event) => setUsername(event.target.value.replace(/^@/, ''))} placeholder="@username" required /></label>
                  </div>
                  <label className="field"><span>{t(language, 'Phone number')}</span><span className="input-icon-wrap"><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+251 9XX XXX XXX" required /><Phone size={16} /></span></label>
                  <label className="field"><span>{t(language, 'Reason')} <span className="field-hint">{t(language, 'Give your admin a little context')}</span></span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t(language, 'What do you need permission for?')} rows={3} required /></label>
                  <div className="form-footer"><span>{t(language, 'By submitting, this will be shared with your admin.')}</span><button className="submit-button" type="submit">{t(language, 'Send request')} <ArrowRight size={16} /></button></div>
                </form>
              </section>

              <aside className="activity-panel">
                <div className="activity-title"><div><div className="eyebrow">{t(language, 'YOUR ACTIVITY')}</div><h2>{t(language, 'Recent requests')}</h2></div><span className="activity-count">{requests.length.toString().padStart(2, '0')}</span></div>
                <div className="activity-list">{requests.slice(0, 4).map((request) => <article className="activity-item" key={request.id}><span className={`activity-marker marker-${request.status}`} /><div className="activity-details"><div className="activity-type">{t(language, request.type)}</div><div className="activity-meta">{formatDate(request.date, language)} <span>·</span> {request.username}</div><StatusBadge status={request.status} language={language} /></div><ArrowRight size={15} className="activity-arrow" /></article>)}</div>
                {requests.length === 0 && <p className="empty-copy">{t(language, 'Your requests will show up here.')}</p>}
                <button type="button" className="text-link" onClick={openAdmin}>{t(language, 'Open request log')} <ArrowRight size={15} /></button>
                <div className="note-panel"><div className="note-mark">“</div><p>{t(language, 'Plans change. A little notice helps everyone stay in sync.')}</p><span>{t(language, 'PEOPLE TEAM')}</span></div>
              </aside>
            </div>
          </div>
        ) : (
          <div className="page-content admin-content">
            <section className="page-heading admin-heading">
              <div><div className="eyebrow"><span className="eyebrow-line" /> {t(language, 'PEOPLE OPERATIONS / ADMIN')}</div><h1>{t(language, 'Request log')}<span className="heading-period">.</span></h1><p>{t(language, 'Review requests and keep the team moving.')}</p></div>
              <div className="admin-count"><span>{t(language, 'NEEDS YOUR ATTENTION')}</span><strong>{pendingCount.toString().padStart(2, '0')} <small>{t(language, 'pending')}</small></strong></div>
            </section>
            <section className="admin-summary"><div><span>{t(language, 'ALL REQUESTS')}</span><strong>{requests.length.toString().padStart(2, '0')}</strong></div><div><span>{t(language, 'Approved').toUpperCase()}</span><strong>{approvedCount.toString().padStart(2, '0')}</strong></div><div><span>{t(language, 'REJECTED')}</span><strong>{rejectedCount.toString().padStart(2, '0')}</strong></div><div className="summary-accent"><span>{t(language, 'OPEN')}</span><strong>{pendingCount.toString().padStart(2, '0')}</strong></div></section>
            <section className="log-panel">
              <div className="log-heading"><div><div className="eyebrow">{t(language, 'INBOX')}</div><h2>{t(language, 'All permissions')} <span>{filteredRequests.length}</span></h2></div><button type="button" className="export-button" onClick={() => { setSearch(''); setDateFilter('') }}><X size={15} /> {t(language, 'Clear filters')}</button></div>
              <div className="filters-row"><label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t(language, 'Search name or Telegram username')} aria-label={t(language, 'Filter by name or Telegram username')} /></label><label className="date-filter"><CalendarDays size={16} /><input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label={t(language, 'Filter by date')} /></label><span className="filter-caption">{t(language, 'FILTER REQUESTS')}</span></div>
              <div className="table-wrap"><table><thead><tr><th>{t(language, 'REQUESTER')}</th><th>{t(language, 'PERMISSION')}</th><th>{t(language, 'DATE NEEDED')}</th><th>{t(language, 'PHONE')}</th><th>{t(language, 'REASON')}</th><th>{t(language, 'STATUS')}</th><th className="action-column">{t(language, 'REVIEW')}</th></tr></thead><tbody>{filteredRequests.map((request) => <tr key={request.id}><td><div className="requester-cell"><span className="requester-avatar">{request.name.charAt(0).toUpperCase()}</span><span><strong>{request.name}</strong><small>{request.username}</small></span></div></td><td><span className="type-tag">{t(language, request.type)}</span></td><td className="date-cell">{formatDate(request.date, language)}</td><td className="phone-cell">{request.phone}</td><td className="reason-cell" title={request.reason}>{request.reason}</td><td><StatusBadge status={request.status} language={language} /></td><td><div className="review-actions">{request.status === 'pending' ? <><button type="button" className="approve-button" onClick={() => updateStatus(request.id, 'approved')} aria-label={`${t(language, 'Approve')} ${request.name}`} title={t(language, 'Approve')}><Check size={16} /></button><button type="button" className="reject-button" onClick={() => updateStatus(request.id, 'rejected')} aria-label={`${t(language, 'Reject')} ${request.name}`} title={t(language, 'Reject')}><X size={16} /></button></> : <span className="reviewed-mark" aria-label={t(language, 'Reviewed')}><Check size={15} /></span>}</div></td></tr>)}</tbody></table>
                {filteredRequests.length === 0 && <div className="table-empty"><Search size={20} /><strong>{t(language, 'No requests found')}</strong><span>{t(language, 'Try a different name, username, or date.')}</span></div>}</div>
              <div className="table-foot"><span>{language === 'am' ? `${filteredRequests.length} ከ ${requests.length} ጥያቄዎች እየታዩ ነው` : `Showing ${filteredRequests.length} of ${requests.length} requests`}</span><span><span className="online-dot" /> {t(language, 'Up to date')}</span></div>
            </section>
            <div className="admin-footnote"><ShieldCheck size={16} /> {t(language, 'Decisions update the request status immediately for the person who submitted it.')}</div>
          </div>
        )}
      </main>
      {showAdminLogin && <div className="login-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAdminLogin(false) }}><section className="login-dialog" role="dialog" aria-modal="true" aria-labelledby="login-title"><button type="button" className="login-close" onClick={() => setShowAdminLogin(false)} aria-label="Close sign in"><X size={17} /></button><div className="login-icon"><LockKeyhole size={19} /></div><div className="eyebrow">{t(language, 'ADMIN ACCESS')}</div><h2 id="login-title">{t(language, 'Welcome back.')}</h2><p className="login-description">{t(language, 'Sign in to review team permission requests.')}</p><form className="login-form" onSubmit={signInAdmin}><label className="field"><span>{t(language, 'Username')}</span><input autoComplete="username" value={adminUsername} onChange={(event) => setAdminUsername(event.target.value)} placeholder={t(language, 'Admin username')} required /></label><label className="field"><span>{t(language, 'Password')}</span><input type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder={t(language, 'Enter password')} required /></label>{loginError && <p className="login-error" role="alert">{t(language, loginError)}</p>}<button type="submit" className="submit-button login-submit">{t(language, 'Sign in')} <ArrowRight size={16} /></button></form></section></div>}
      {toast && <div className="toast" role="status"><span><Check size={16} /></span>{toast}<button type="button" onClick={() => setToast('')} aria-label="Dismiss notification"><X size={15} /></button></div>}
      <button className="mobile-new-button" onClick={() => setView('requests')} aria-label="Create a request"><Plus size={21} /></button>
    </div>
  )
}

export default App
