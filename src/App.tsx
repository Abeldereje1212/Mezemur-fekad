import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ClipboardCheck,
  ChevronDown,
  Clock3,
  FileClock,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Music2,
  Phone,
  Plus,
  Radio,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import Attendance from './Attendance'
import './App.css'

type RequestStatus = 'pending' | 'approved' | 'rejected'
type AppView = 'requests' | 'admin' | 'notifier' | 'mezmur' | 'attendance'
type Language = 'en' | 'am'
type PermissionType = 'Annual leave' | 'Sick leave' | 'Personal leave' | 'Late arrival' | 'Early departure' | 'Other'

interface SubscriberUser {
  telegramId: string
  username?: string
  firstName?: string
  lastName?: string
  lastNotifiedAt: string
  visitCount: number
}

interface NotificationHistoryItem {
  id?: string
  title?: string
  message: string
  target: string
  targetName?: string
  sentCount: number
  failedCount: number
  sentAt: string
}

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

type MezmurCategory = 'michael' | 'zewetir' | 'meskel' | 'lidet' | 'timket'
type MezmurFilter = 'all' | MezmurCategory

interface LyricsBox {
  id: string
  title: string
  lyrics: string
  category?: MezmurCategory
}

interface SeedSong {
  seedKey: string
  category: MezmurCategory
  title: string
  lyrics: string
}

const mezmurCategories: { id: MezmurCategory; label: string }[] = [
  { id: 'michael', label: 'St. Michael' },
  { id: 'zewetir', label: 'Everyday' },
  { id: 'meskel', label: 'Meskel' },
  { id: 'lidet', label: 'Nativity' },
  { id: 'timket', label: 'Epiphany' },
]

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
    'Saved in this browser only. This request was not sent to the admin.': 'በዚህ አሳሽ ብቻ ተቀምጧል። ጥያቄው ለአስተዳዳሪው አልተላከም።',
    'Request statuses refresh automatically every 10 seconds.': 'የጥያቄዎች ሁኔታ በየ10 ሰከንዱ በራስ ሰር ይዘምናል።',
    'WORKPLACE': 'የሥራ ቦታ', 'WORKSPACE': 'የሥራ ቦታ', 'My requests': 'የእኔ ፈቃዶች', 'Admin review': 'የአስተዳዳሪ ግምገማ',
    'Request desk is open': 'የፈቃድ ጥያቄ ክፍት ነው', 'ADMIN REVIEW': 'የአስተዳዳሪ ግምገማ', 'PERMISSION DESK': 'የፈቃድ ጥያቄ',
    'MEZEMERAN FEKAD': 'መዘምራን ፈቃድ', 'Permission desk': 'የፈቃድ ጥያቄ', 'Request time away and keep track of every update.': 'የፈቃድ ጥያቄ ያቅርቡ እና ሁኔታውን ይከታተሉ።',
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
    'PEOPLE TEAM': 'የሰራተኞች ቡድን', 'MEZEMERAN FEKAD / ADMIN': 'መዘምራን ፈቃድ / አስተዳዳሪ', 'Request log': 'የጥያቄ ዝርዝር',
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
    'Mezmur': 'መዝሙር', 'MEZMUR': 'መዝሙር', 'Attendance': 'ክትትል', 'ATTENDANCE': 'ክትትል', 'Keep song lyrics together in one place.': 'የመዝሙር ግጥሞችን በአንድ ቦታ ያስቀምጡ።',
    'Add lyrics box': 'የግጥም ሳጥን ጨምር', 'Song title': 'የመዝሙሩ ርዕስ', 'Lyrics': 'ግጥም',
    'Write or paste the lyrics here...': 'ግጥሙን እዚህ ይጻፉ ወይም ይለጥፉ...', 'Remove lyrics box': 'የግጥም ሳጥን አስወግድ',
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
    'Lyrics saved.': 'ግጥሙ ተቀምጧል።',
    'Could not save lyrics.': 'ግጥሙን ማስቀመጥ አልተቻለም።',
    'Could not add lyrics.': 'ግጥም መጨመር አልተቻለም።',
    'Could not remove lyrics.': 'ግጥም ማስወገድ አልተቻለም።',
    'No lyrics have been added yet.': 'ገና ምንም ግጥም አልተጨመረም።',
    'Untitled': 'ርዕስ የሌለው',
    'No lyrics yet.': 'ገና ግጥም የለም።',
    'All': 'ሁሉም', 'St. Michael': 'ቅዱስ ሚካኤል', 'Everyday': 'ዘወትር', 'Meskel': 'መስቀል', 'Nativity': 'ልደት', 'Epiphany': 'ጥምቀት',
    'Category': 'ምድብ', 'No category': 'ምድብ የለም', 'Mezmur categories': 'የመዝሙር ምድቦች',
    'No lyrics in this category yet.': 'በዚህ ምድብ ገና ግጥም የለም።',
    'Please provide a valid category.': 'እባክዎ ትክክለኛ ምድብ ይምረጡ።',
    'Songbook approval': 'የመዝሙር ጥራዝ ማጽደቂያ',
    'They are hidden from everyone until you approve them.': 'እስኪያጸድቁ ድረስ ለማንም አይታዩም።',
    'Review': 'ገምግም', 'Hide': 'ደብቅ', 'Select all': 'ሁሉንም ምረጥ', 'Select none': 'ምርጫ አጽዳ',
    'Reject selected': 'የተመረጡትን ውድቅ አድርግ', 'Approve & publish selected': 'የተመረጡትን አጽድቅና አትም',
    'No songs waiting in this category.': 'በዚህ ምድብ የሚጠብቅ መዝሙር የለም።',
    'Could not update songbook songs.': 'የመዝሙር ጥራዝ መዝሙሮችን ማዘመን አልተቻለም።',
    'Please select at least one song.': 'እባክዎ ቢያንስ አንድ መዝሙር ይምረጡ።',
    'This member blocked the bot or deleted their account, so they were removed from the list.': 'ይህ ሰው ቦቱን አግዷል ወይም አካውንቱን አጥፍቷል፤ ስለዚህ ከዝርዝሩ ተወግዷል።',
    'Notifier': 'የማሳወቂያ ክፍል',
    'NOTIFIER PANEL': 'የማሳወቂያ ክፍል',
    'Telegram notifier': 'የቴሌግራም መልእክት ማስተላለፊያ',
    'Broadcast announcements and direct notifications to Telegram users.': 'አጠቃላይ ማስታወቂያዎችን ወይም ቀጥታ መልእክቶችን ለቴሌግራም ተጠቃሚዎች ያስተላልፉ።',
    'TOTAL SUBSCRIBERS': 'ጠቅላላ ተጠቃሚዎች',
    'ACTIVE BOT USERS': 'ንቁ ተጠቃሚዎች',
    'BOT STATUS': 'የቦት ሁኔታ',
    'Online & Ready': 'ዝግጁ ነው',
    'Compose notification': 'መልእክት ማዘጋጃ',
    'Create and send a notification through the Telegram bot.': 'በቴሌግራም ቦቱ አማካኝነት የሚተላለፍ መልእክት ያዘጋጁ።',
    'Target audience': 'የመልእክቱ ተቀባይ',
    'All bot members': 'ሁሉም የቦት ተጠቃሚዎች',
    'Single user': 'ለአንድ ተጠቃሚ',
    'Quick templates': 'ፈጣን አብነቶች',
    'General announcement': 'አጠቃላይ ማስታወቂያ',
    'Rehearsal reminder': 'የመዝሙር ልምምድ',
    'Service notice': 'የአገልግሎት ጥሪ',
    'Notification title (optional)': 'የማሳወቂያ ርዕስ (አማራጭ)',
    'Write your message...': 'የመልእክቱን ዝርዝር እዚህ ይጻፉ...',
    'Live Telegram preview': 'የቴሌግራም ቅድመ-እይታ',
    'Send notification': 'መልእክቱን አስተላልፍ',
    'Sending...': 'በመላክ ላይ...',
    'Subscribers & visitors': 'ተጠቃሚዎች እና ጎብኝዎች',
    'People who opened the Mini App': 'ይህንን መተግበሪያ የከፈቱ ሰዎች',
    'Direct message': 'መልእክት ጻፍ',
    'Recent broadcasts': 'የቅርብ ጊዜ መልእክቶች',
    'No broadcasts sent yet.': 'እስካሁን የተላከ መልእክት የለም።',
    'No subscribers found.': 'ምንም ተጠቃሚዎች አልተገኙም።',
    'Notification sent successfully!': 'ማሳወቂያው በተሳካ ሁኔታ ተልኳል!',
    'Requests remain visible for at least 7 days.': 'ያቀረቧቸው ጥያቄዎች ቢያንስ ለ1 ሳምንት እዚህ ይታያሉ።',
    'Visible for at least 7 days': 'ቢያንስ ለ1 ሳምንት የሚቆይ',
    'Submitted on': 'የተላከው',
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

function getClientId(): string {
  try {
    let id = localStorage.getItem('fekad-client-id')
    if (!id) {
      id = `client-${crypto.randomUUID()}`
      localStorage.setItem('fekad-client-id', id)
    }
    return id
  } catch {
    return 'client-fallback'
  }
}

function readRequests(): PermissionRequest[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as PermissionRequest[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
    return import.meta.env.DEV ? sampleRequests : []
  } catch {
    return import.meta.env.DEV ? sampleRequests : []
  }
}

function formatDate(value: string, language: Language) {
  if (!value) return 'No date'
  return new Intl.DateTimeFormat(language === 'am' ? 'am-ET' : 'en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
}

function formatDateTime(value: string, language: Language) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(language === 'am' ? 'am-ET' : 'en', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

function StatusBadge({ status, language }: { status: RequestStatus; language: Language }) {
  return <span className={`status-badge status-${status}`}><span />{t(language, statusKeys[status])}</span>
}

function telegramHeaders(): Record<string, string> {
  const initData = window.Telegram?.WebApp?.initData
  const headers: Record<string, string> = {
    'x-client-id': getClientId(),
  }
  if (initData) headers['x-telegram-init-data'] = initData
  return headers
}

function App() {
  const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user
  const initialName = [telegramUser?.first_name, telegramUser?.last_name].filter(Boolean).join(' ')
  const [requests, setRequests] = useState<PermissionRequest[]>(() => readRequests())
  const [lyricsBoxes, setLyricsBoxes] = useState<LyricsBox[]>([])
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [mezmurFilter, setMezmurFilter] = useState<MezmurFilter>('all')
  const visibleLyrics = mezmurFilter === 'all' ? lyricsBoxes : lyricsBoxes.filter((box) => box.category === mezmurFilter)
  const [pendingSeeds, setPendingSeeds] = useState<SeedSong[]>([])
  const [selectedSeeds, setSelectedSeeds] = useState<Set<string>>(() => new Set())
  const [seedReviewOpen, setSeedReviewOpen] = useState(false)
  const [seedBusy, setSeedBusy] = useState(false)
  const visibleSeeds = mezmurFilter === 'all' ? pendingSeeds : pendingSeeds.filter((song) => song.category === mezmurFilter)
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem(LANGUAGE_KEY) === 'am' ? 'am' : 'en')
  const [view, setView] = useState<AppView>('requests')
  const [menuOpen, setMenuOpen] = useState(false)
  const [adminAuthenticated, setAdminAuthenticated] = useState(false)
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [toast, setToast] = useState('')
  const [requestsReady, setRequestsReady] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [name, setName] = useState(initialName)
  const [username, setUsername] = useState(telegramUser?.username ? `@${telegramUser.username}` : '')
  const [phone, setPhone] = useState('')
  const [type, setType] = useState<PermissionType>('Annual leave')
  const [date, setDate] = useState(localDate(1))
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [subscribers, setSubscribers] = useState<SubscriberUser[]>([])
  const [notificationHistory, setNotificationHistory] = useState<NotificationHistoryItem[]>([])
  const [totalSubscribers, setTotalSubscribers] = useState(0)
  const [notifyLoading, setNotifyLoading] = useState(false)
  const [notifySending, setNotifySending] = useState(false)
  const [notifyTarget, setNotifyTarget] = useState<'all' | string>('all')
  const [notifyTitle, setNotifyTitle] = useState('')
  const [notifyMessage, setNotifyMessage] = useState('')

  useEffect(() => {
    window.Telegram?.WebApp?.ready()
    window.Telegram?.WebApp?.expand()

    if (window.Telegram?.WebApp?.initData && !sessionStorage.getItem('welcome_sent')) {
      sessionStorage.setItem('welcome_sent', 'true')
      fetch('/api/welcome', {
        method: 'POST',
        headers: telegramHeaders(),
      }).catch(() => {})
    }
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
        setRequestsReady(true)
        setRequestError('')
        if (result.role === 'admin') {
          setRequests(result.requests)
          setAdminAuthenticated(true)
          setView('admin')
        } else {
          setRequests((current) => {
            const serverIds = new Set(result.requests.map((r: PermissionRequest) => r.id))
            const localOnly = current.filter((r) => !serverIds.has(r.id))
            const merged = [...result.requests, ...localOnly]
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)) } catch {}
            return merged
          })
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setRequestsReady(false)
          setRequestError(error instanceof Error ? error.message : 'Could not load requests.')
        }
      })
    return () => { active = false }
  }, [language])

  useEffect(() => {
    if (!requestsReady) return
    const controller = new AbortController()
    let refreshing = false
    async function refreshRequests() {
      if (document.visibilityState === 'hidden' || refreshing) return
      refreshing = true
      try {
        const response = await fetch('/api/requests', {
          headers: telegramHeaders(), cache: 'no-store', signal: controller.signal,
        })
        if (response.status === 401 || response.status === 403 || response.status === 503) {
          const result = await response.json()
          if (!controller.signal.aborted && (response.status !== 503 || result.code === 'TELEGRAM_NOT_CONFIGURED')) {
            setRequestsReady(false)
            setRequestError(result.error || 'Could not load requests.')
            setRequests([])
          }
          return
        }
        if (!response.ok) return
        const result = await response.json() as { role: 'admin' | 'user'; requests: PermissionRequest[] }
        if (!controller.signal.aborted && (result.role === 'admin') === adminAuthenticated) {
          if (adminAuthenticated) {
            setRequests(result.requests)
          } else {
            setRequests((current) => {
              const serverIds = new Set(result.requests.map((r: PermissionRequest) => r.id))
              const localOnly = current.filter((r) => !serverIds.has(r.id))
              const merged = [...result.requests, ...localOnly]
              try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)) } catch {}
              return merged
            })
          }
        }
      } catch {
        // Keep the last loaded requests during temporary outages; retry on the next refresh.
      } finally {
        refreshing = false
      }
    }
    const interval = window.setInterval(() => { void refreshRequests() }, 10_000)
    const onVisible = () => { void refreshRequests() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      controller.abort()
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [adminAuthenticated, requestsReady])

  useEffect(() => {
    localStorage.setItem(LANGUAGE_KEY, language)
    document.documentElement.lang = language === 'am' ? 'am' : 'en'
    document.documentElement.dataset.language = language
  }, [language])

  useEffect(() => {
    let active = true
    setLyricsLoading(true)
    fetch('/api/lyrics')
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load lyrics.')
        const result = await res.json() as { lyrics: LyricsBox[] }
        if (active) setLyricsBoxes(result.lyrics)
      })
      .catch(() => { /* keep empty list */ })
      .finally(() => { if (active) setLyricsLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!adminAuthenticated || view !== 'mezmur') return
    let active = true
    fetch('/api/lyrics?seed=pending')
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load songbook songs.')
        const result = await res.json() as { pending: SeedSong[] }
        if (!active) return
        setPendingSeeds(result.pending)
        setSelectedSeeds(new Set(result.pending.map((song) => song.seedKey)))
      })
      .catch(() => { /* banner simply stays hidden */ })
    return () => { active = false }
  }, [adminAuthenticated, view])

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

  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
  const userVisibleRequests = requests.filter((request) => {
    if (!request.submittedAt) return true
    const submittedTime = new Date(request.submittedAt).getTime()
    if (isNaN(submittedTime)) return true
    const age = Date.now() - submittedTime
    return age <= ONE_WEEK_MS || request.status === 'pending' || request.date >= localDate(0)
  })

  function openAdmin() {
    if (adminAuthenticated) {
      setView('admin')
      return
    }
    setLoginError('')
    setShowAdminLogin(true)
  }

  async function loadNotifierData() {
    setNotifyLoading(true)
    try {
      const res = await fetch('/api/admin/notify')
      if (res.ok) {
        const data = await res.json()
        setSubscribers(data.users || [])
        setNotificationHistory(data.history || [])
        setTotalSubscribers(data.totalSubscribers || 0)
      }
    } catch {
      // ignore
    } finally {
      setNotifyLoading(false)
    }
  }

  function openNotifier() {
    if (adminAuthenticated) {
      setView('notifier')
      loadNotifierData()
      return
    }
    setLoginError('')
    setShowAdminLogin(true)
  }

  async function handleSendNotification(e: FormEvent) {
    e.preventDefault()
    if (!notifyMessage.trim()) return

    setNotifySending(true)
    try {
      const targetUser = subscribers.find((s) => s.telegramId === notifyTarget)
      const targetName = notifyTarget === 'all'
        ? 'All bot members'
        : [targetUser?.firstName, targetUser?.lastName].filter(Boolean).join(' ') || targetUser?.username || notifyTarget

      const res = await fetch('/api/admin/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: notifyTarget,
          targetName,
          title: notifyTitle.trim() || undefined,
          message: notifyMessage.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.removedCount) {
          setNotifyTarget('all')
          loadNotifierData()
        }
        throw new Error(data.error || 'Failed to send notification.')
      }

      const removedNote = data.removedCount > 0
        ? (language === 'am'
          ? ` ቦቱን ያገዱ ${data.removedCount} ሰዎች ከዝርዝሩ ተወግደዋል።`
          : ` ${data.removedCount} member(s) who blocked the bot were removed from the list.`)
        : ''
      setToast(
        (language === 'am'
          ? `መልእክቱ ለ ${data.sentCount} ሰው በተሳካ ሁኔታ ተልኳል!`
          : `Notification delivered to ${data.sentCount} recipient(s)!`) + removedNote
      )
      setNotifyTitle('')
      setNotifyMessage('')
      loadNotifierData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send'
      setToast(t(language, msg))
    } finally {
      setNotifySending(false)
    }
  }

  function updateLyricsBox(id: string, field: 'title' | 'lyrics', value: string) {
    setLyricsBoxes((current) => current.map((box) => box.id === id ? { ...box, [field]: value } : box))
  }

  function toggleSeed(seedKey: string) {
    setSelectedSeeds((current) => {
      const next = new Set(current)
      if (next.has(seedKey)) next.delete(seedKey)
      else next.add(seedKey)
      return next
    })
  }

  function setVisibleSeedsSelected(selected: boolean) {
    setSelectedSeeds((current) => {
      const next = new Set(current)
      for (const song of visibleSeeds) {
        if (selected) next.add(song.seedKey)
        else next.delete(song.seedKey)
      }
      return next
    })
  }

  async function reviewSeeds(action: 'approve-seed' | 'reject-seed') {
    const seedKeys = visibleSeeds.filter((song) => selectedSeeds.has(song.seedKey)).map((song) => song.seedKey)
    if (seedKeys.length === 0) return
    setSeedBusy(true)
    try {
      const response = await fetch('/api/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, seedKeys }),
      })
      const result = await response.json() as { boxes?: LyricsBox[]; handled?: string[]; error?: string }
      if (!response.ok) throw new Error(result.error || 'Could not update songbook songs.')
      const handled = new Set(result.handled ?? [])
      setPendingSeeds((current) => current.filter((song) => !handled.has(song.seedKey)))
      if (result.boxes?.length) setLyricsBoxes((current) => [...current, ...result.boxes!])
      setToast(language === 'am'
        ? `${handled.size} መዝሙሮች ${action === 'approve-seed' ? 'ጸድቀው ታትመዋል' : 'ውድቅ ተደርገዋል'}።`
        : `${handled.size} songs ${action === 'approve-seed' ? 'approved and published' : 'rejected'}.`)
    } catch (error) {
      setToast(t(language, error instanceof Error ? error.message : 'Could not update songbook songs.'))
    } finally {
      setSeedBusy(false)
    }
  }

  function updateLyricsCategory(id: string, category: MezmurCategory | undefined) {
    const box = lyricsBoxes.find((b) => b.id === id)
    if (!box) return
    setLyricsBoxes((current) => current.map((b) => b.id === id ? { ...b, category } : b))
    void saveLyricsBox(id, { ...box, category })
  }

  async function saveLyricsBox(id: string, override?: LyricsBox) {
    const box = override ?? lyricsBoxes.find((b) => b.id === id)
    if (!box) return
    try {
      const response = await fetch('/api/lyrics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title: box.title, lyrics: box.lyrics, category: box.category ?? null }),
      })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Could not save lyrics.')
      }
      setToast(t(language, 'Lyrics saved.'))
    } catch (error) {
      setToast(t(language, error instanceof Error ? error.message : 'Could not save lyrics.'))
    }
  }

  async function addLyricsBox() {
    try {
      const response = await fetch('/api/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled', lyrics: '', ...(mezmurFilter !== 'all' ? { category: mezmurFilter } : {}) }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not add lyrics.')
      setLyricsBoxes((current) => [...current, result.box])
    } catch (error) {
      setToast(t(language, error instanceof Error ? error.message : 'Could not add lyrics.'))
    }
  }

  async function removeLyricsBox(id: string) {
    try {
      const response = await fetch('/api/lyrics', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Could not remove lyrics.')
      }
      setLyricsBoxes((current) => current.filter((box) => box.id !== id))
    } catch (error) {
      setToast(t(language, error instanceof Error ? error.message : 'Could not remove lyrics.'))
    }
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
      setRequestsReady(true)
      setRequestError('')
      setAdminAuthenticated(true)
      setShowAdminLogin(false)
      setAdminPassword('')
      setView('admin')
    } catch (error) {
      setLoginError(t(language, error instanceof Error ? error.message : 'Could not sign in.'))
    }
  }

  async function signOutAdmin() {
    setRequestsReady(false)
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
      setRequestsReady(true)
      setRequestError('')
    } catch {
      setRequests(import.meta.env.DEV ? readRequests() : [])
    }
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...telegramHeaders() },
        body: JSON.stringify({ name, username: username.trim().startsWith('@') ? username.trim() : `@${username.trim()}`, phone, type, date, reason }),
      })
      if (import.meta.env.DEV && response.status === 404) {
        const localRequest: PermissionRequest = {
          id: crypto.randomUUID(), name: name.trim(), username: username.trim().startsWith('@') ? username.trim() : `@${username.trim()}`,
          phone: phone.trim(), type, date, reason: reason.trim(), status: 'pending', submittedAt: new Date().toISOString(),
        }
        const updated = [localRequest, ...requests]
        setRequests(updated)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        setReason('')
        setToast(t(language, 'Saved in this browser only. This request was not sent to the admin.'))
        return
      } else {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Could not submit the request.')
        setRequests((current) => {
          const updated = [result.request, ...current.filter((r) => r.id !== result.request.id)]
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)) } catch {}
          return updated
        })
      }
      setReason('')
      setToast(t(language, 'Your request has been sent to the admin.'))
    } catch (error) {
      setToast(t(language, error instanceof Error ? error.message : 'Could not submit the request.'))
    } finally {
      setSubmitting(false)
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
          <img className="brand-logo" src="/logo.jpg" alt="Birhane Hiwot logo" />
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
          <button className={view === 'notifier' ? 'nav-item active' : 'nav-item'} onClick={openNotifier}>
            <Bell size={18} strokeWidth={1.8} /> {t(language, 'Notifier')}
            {totalSubscribers > 0 && <span className="nav-count">{totalSubscribers}</span>}
          </button>
          <button className={view === 'mezmur' ? 'nav-item active' : 'nav-item'} onClick={() => setView('mezmur')}>
            <Music2 size={18} strokeWidth={1.8} /> {t(language, 'Mezmur')}
          </button>
          <button className={view === 'attendance' ? 'nav-item active' : 'nav-item'} onClick={() => setView('attendance')}>
            <ClipboardCheck size={18} strokeWidth={1.8} /> {t(language, 'Attendance')}
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
        {requestError && <p className="login-error" role="alert">{t(language, requestError)}</p>}
        <header className="topbar">
          <div className="breadcrumb"><span>BIRHANE HIWOT</span><span className="crumb-slash">/</span><strong>{t(language, view === 'admin' ? 'ADMIN REVIEW' : view === 'notifier' ? 'NOTIFIER PANEL' : view === 'mezmur' ? 'MEZMUR' : view === 'attendance' ? 'ATTENDANCE' : 'PERMISSION DESK')}</strong></div>
          <div className="topbar-right"><button type="button" className="language-toggle" onClick={() => setLanguage((current) => current === 'en' ? 'am' : 'en')} aria-label={language === 'en' ? 'Switch language to Amharic' : 'Switch language to English'} title={language === 'en' ? 'አማርኛ' : 'English'}>{language === 'en' ? 'አማ' : 'EN'}</button><span className="topbar-date"><CalendarDays size={15} /> {todayLabel}</span>{adminAuthenticated && <button type="button" className="topbar-logout" onClick={signOutAdmin} aria-label="Sign out of admin" title="Sign out"><LogOut size={16} /></button>}<img className="topbar-logo" src="/logo.jpg" alt="Birhane Hiwot" /><div className="menu-wrap"><button type="button" className="hamburger-button" aria-label={t(language, menuOpen ? 'Close navigation menu' : 'Open navigation menu')} aria-expanded={menuOpen} aria-controls="header-menu" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>{menuOpen && <nav id="header-menu" className="header-menu" aria-label="Main menu"><button type="button" role="menuitem" className={view === 'requests' ? 'header-menu-item active' : 'header-menu-item'} onClick={() => { setView('requests'); setMenuOpen(false) }}><LayoutDashboard size={17} />{t(language, 'My requests')}</button><button type="button" role="menuitem" className={view === 'admin' ? 'header-menu-item active' : 'header-menu-item'} onClick={() => { openAdmin(); setMenuOpen(false) }}><ShieldCheck size={17} />{t(language, 'Admin review')}{pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}</button><button type="button" role="menuitem" className={view === 'notifier' ? 'header-menu-item active' : 'header-menu-item'} onClick={() => { openNotifier(); setMenuOpen(false) }}><Bell size={17} />{t(language, 'Notifier')}{totalSubscribers > 0 && <span className="nav-count">{totalSubscribers}</span>}</button><button type="button" role="menuitem" className={view === 'mezmur' ? 'header-menu-item active' : 'header-menu-item'} onClick={() => { setView('mezmur'); setMenuOpen(false) }}><Music2 size={17} />{t(language, 'Mezmur')}</button></nav>}</div></div>
        </header>

        {view === 'requests' ? (
          <div className="page-content">
            <section className="page-heading">
              <div><div className="eyebrow"><span className="eyebrow-line" /> {t(language, 'MEZEMERAN FEKAD')}</div><h1>{t(language, 'Permission desk')}<span className="heading-period">.</span></h1><p>{t(language, 'Request time away and keep track of every update.')}</p></div>
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
                <form className="request-form" onSubmit={submitRequest} onInvalidCapture={(event) => { event.preventDefault(); setToast(t(language, 'Please complete all required fields.')) }}>
                  <label className="field"><span>{t(language, 'Permission type')}</span><span className="select-wrap"><select value={type} onChange={(event) => setType(event.target.value as PermissionType)}>{permissionTypes.map((permissionType) => <option key={permissionType} value={permissionType}>{t(language, permissionType)}</option>)}</select><ChevronDown size={16} /></span></label>
                  <label className="field"><span>{t(language, 'Date needed')}</span><span className="input-icon-wrap"><input type="date" value={date} min={localDate()} onChange={(event) => setDate(event.target.value)} required /><CalendarDays size={16} /></span></label>
                  <div className="field-pair">
                    <label className="field"><span>{t(language, 'Your name')}</span><span className="input-icon-wrap"><input value={name} onChange={(event) => setName(event.target.value)} placeholder={t(language, 'Full name')} required minLength={2} /><UserRound size={16} /></span></label>
                    <label className="field"><span>{t(language, 'Telegram username')}</span><input value={username} onChange={(event) => setUsername(event.target.value.replace(/^@/, ''))} placeholder="@username" required /></label>
                  </div>
                  <label className="field"><span>{t(language, 'Phone number')}</span><span className="input-icon-wrap"><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+251 9XX XXX XXX" required minLength={5} /><Phone size={16} /></span></label>
                  <label className="field"><span>{t(language, 'Reason')} <span className="field-hint">{t(language, 'Give your admin a little context')}</span></span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t(language, 'What do you need permission for?')} rows={3} required minLength={2} /></label>
                  <div className="form-footer"><span>{t(language, 'By submitting, this will be shared with your admin.')}</span><button className="submit-button" type="submit" disabled={submitting}>{submitting ? (language === 'am' ? 'በመላክ ላይ…' : 'Sending…') : t(language, 'Send request')} {!submitting && <ArrowRight size={16} />}</button></div>
                </form>
              </section>

              <aside className="activity-panel">
                <div className="activity-title">
                  <div>
                    <div className="eyebrow">{t(language, 'YOUR ACTIVITY')}</div>
                    <h2>{t(language, 'Recent requests')}</h2>
                  </div>
                  <span className="activity-count">{(userVisibleRequests.length > 0 ? userVisibleRequests : requests).length.toString().padStart(2, '0')}</span>
                </div>
                <div className="activity-retention-note">
                  <Clock3 size={13} /> {t(language, 'Requests remain visible for at least 7 days.')}
                </div>
                <div className="activity-list">
                  {(userVisibleRequests.length > 0 ? userVisibleRequests : requests).map((request) => (
                    <article className="activity-item" key={request.id}>
                      <span className={`activity-marker marker-${request.status}`} />
                      <div className="activity-details">
                        <div className="activity-type">{t(language, request.type)}</div>
                        <div className="activity-meta">
                          {formatDate(request.date, language)} <span>·</span> {request.username}
                        </div>
                        {request.submittedAt && (
                          <div className="activity-submitted-time">
                            {t(language, 'Submitted on')}: {formatDateTime(request.submittedAt, language)}
                          </div>
                        )}
                        <StatusBadge status={request.status} language={language} />
                      </div>
                      <ArrowRight size={15} className="activity-arrow" />
                    </article>
                  ))}
                </div>
                {requests.length === 0 && <p className="empty-copy">{t(language, 'Your requests will show up here.')}</p>}
                <button type="button" className="text-link" onClick={openAdmin}>{t(language, 'Open request log')} <ArrowRight size={15} /></button>
                <div className="note-panel"><div className="note-mark">“</div><p>{t(language, 'Plans change. A little notice helps everyone stay in sync.')}</p><span>{t(language, 'PEOPLE TEAM')}</span></div>
              </aside>
            </div>
          </div>
        ) : view === 'admin' ? (
          <div className="page-content admin-content">
            <section className="page-heading admin-heading">
              <div><div className="eyebrow"><span className="eyebrow-line" /> {t(language, 'MEZEMERAN FEKAD / ADMIN')}</div><h1>{t(language, 'Request log')}<span className="heading-period">.</span></h1><p>{t(language, 'Review requests and keep the team moving.')}</p></div>
              <div className="admin-count"><span>{t(language, 'NEEDS YOUR ATTENTION')}</span><strong>{pendingCount.toString().padStart(2, '0')} <small>{t(language, 'pending')}</small></strong></div>
            </section>
            <section className="admin-summary"><div><span>{t(language, 'ALL REQUESTS')}</span><strong>{requests.length.toString().padStart(2, '0')}</strong></div><div><span>{t(language, 'Approved').toUpperCase()}</span><strong>{approvedCount.toString().padStart(2, '0')}</strong></div><div><span>{t(language, 'REJECTED')}</span><strong>{rejectedCount.toString().padStart(2, '0')}</strong></div><div className="summary-accent"><span>{t(language, 'OPEN')}</span><strong>{pendingCount.toString().padStart(2, '0')}</strong></div></section>
            <section className="log-panel">
              <div className="log-heading"><div><div className="eyebrow">{t(language, 'INBOX')}</div><h2>{t(language, 'All permissions')} <span>{filteredRequests.length}</span></h2></div><button type="button" className="export-button" onClick={() => { setSearch(''); setDateFilter('') }}><X size={15} /> {t(language, 'Clear filters')}</button></div>
              <div className="filters-row"><label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t(language, 'Search name or Telegram username')} aria-label={t(language, 'Filter by name or Telegram username')} /></label><label className="date-filter"><CalendarDays size={16} /><input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} aria-label={t(language, 'Filter by date')} /></label><span className="filter-caption">{t(language, 'FILTER REQUESTS')}</span></div>
              <div className="table-wrap"><table><thead><tr><th>{t(language, 'REQUESTER')}</th><th>{t(language, 'PERMISSION')}</th><th>{t(language, 'DATE NEEDED')}</th><th>{t(language, 'PHONE')}</th><th>{t(language, 'REASON')}</th><th>{t(language, 'STATUS')}</th><th className="action-column">{t(language, 'REVIEW')}</th></tr></thead><tbody>{filteredRequests.map((request) => <tr key={request.id}><td><div className="requester-cell"><span className="requester-avatar">{request.name.charAt(0).toUpperCase()}</span><span><strong>{request.name}</strong><small>{request.username}</small></span></div></td><td><span className="type-tag">{t(language, request.type)}</span></td><td className="date-cell">{formatDate(request.date, language)}{request.submittedAt && <small className="submitted-at">{t(language, 'Submitted on')}: {formatDateTime(request.submittedAt, language)}</small>}</td><td className="phone-cell">{request.phone}</td><td className="reason-cell" title={request.reason}>{request.reason}</td><td><StatusBadge status={request.status} language={language} /></td><td><div className="review-actions">{request.status === 'pending' ? <><button type="button" className="approve-button" onClick={() => updateStatus(request.id, 'approved')} aria-label={`${t(language, 'Approve')} ${request.name}`} title={t(language, 'Approve')}><Check size={16} /></button><button type="button" className="reject-button" onClick={() => updateStatus(request.id, 'rejected')} aria-label={`${t(language, 'Reject')} ${request.name}`} title={t(language, 'Reject')}><X size={16} /></button></> : <span className="reviewed-mark" aria-label={t(language, 'Reviewed')}><Check size={15} /></span>}</div></td></tr>)}</tbody></table>
                {filteredRequests.length === 0 && <div className="table-empty"><Search size={20} /><strong>{t(language, 'No requests found')}</strong><span>{t(language, 'Try a different name, username, or date.')}</span></div>}</div>
              <div className="table-foot"><span>{language === 'am' ? `${filteredRequests.length} ከ ${requests.length} ጥያቄዎች እየታዩ ነው` : `Showing ${filteredRequests.length} of ${requests.length} requests`}</span><span><span className="online-dot" /> {t(language, 'Up to date')}</span></div>
            </section>
            <div className="admin-footnote"><ShieldCheck size={16} /> {t(language, 'Request statuses refresh automatically every 10 seconds.')}</div>
          </div>
        ) : view === 'notifier' ? (
          <div className="page-content notifier-content">
            <section className="page-heading notifier-heading">
              <div>
                <div className="eyebrow"><span className="eyebrow-line" /> {t(language, 'MEZEMERAN FEKAD / ADMIN')}</div>
                <h1>{t(language, 'Telegram notifier')}<span className="heading-period">.</span></h1>
                <p>{t(language, 'Broadcast announcements and direct notifications to Telegram users.')}</p>
              </div>
              <div className="admin-count">
                <span>{t(language, 'TOTAL SUBSCRIBERS')}</span>
                <strong>{totalSubscribers.toString().padStart(2, '0')} <small>users</small></strong>
              </div>
            </section>

            <section className="notifier-stats">
              <div>
                <span>{t(language, 'TOTAL SUBSCRIBERS')}</span>
                <strong>{totalSubscribers.toString().padStart(2, '0')}</strong>
              </div>
              <div>
                <span>{t(language, 'ACTIVE BOT USERS')}</span>
                <strong>{subscribers.length.toString().padStart(2, '0')}</strong>
              </div>
              <div className="summary-accent">
                <span>{t(language, 'BOT STATUS')}</span>
                <strong style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="online-dot" /> {t(language, 'Online & Ready')}
                </strong>
              </div>
            </section>

            <div className="notifier-grid">
              <section className="composer-card">
                <div className="eyebrow"><Send size={12} style={{ display: 'inline', marginRight: 4 }} /> {t(language, 'Compose notification')}</div>
                <h2>{t(language, 'Compose notification')}</h2>
                <p>{t(language, 'Create and send a notification through the Telegram bot.')}</p>

                <form onSubmit={handleSendNotification}>
                  <div className="target-segmented">
                    <button
                      type="button"
                      className={`segmented-btn ${notifyTarget === 'all' ? 'active' : ''}`}
                      onClick={() => setNotifyTarget('all')}
                    >
                      <Users size={14} /> {t(language, 'All bot members')}
                    </button>
                    <button
                      type="button"
                      className={`segmented-btn ${notifyTarget !== 'all' ? 'active' : ''}`}
                      onClick={() => {
                        if (subscribers.length > 0 && notifyTarget === 'all') {
                          setNotifyTarget(subscribers[0].telegramId)
                        }
                      }}
                    >
                      <Radio size={14} /> {t(language, 'Single user')}
                    </button>
                  </div>

                  {notifyTarget !== 'all' && (
                    <label className="field" style={{ marginBottom: 14 }}>
                      <span>{t(language, 'Single user')}</span>
                      <select
                        value={notifyTarget}
                        onChange={(e) => setNotifyTarget(e.target.value)}
                        style={{
                          height: 38,
                          padding: '0 10px',
                          border: '1px solid #d4ded0',
                          borderRadius: 3,
                          background: 'white',
                          color: '#344037',
                          fontFamily: 'inherit',
                          fontSize: 12,
                        }}
                      >
                        {subscribers.map((u) => (
                          <option key={u.telegramId} value={u.telegramId}>
                            {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || u.telegramId}
                            {u.username ? ` (@${u.username})` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <div className="template-chips">
                    <span className="template-chips-label">{t(language, 'Quick templates')}:</span>
                    <button
                      type="button"
                      className="template-chip"
                      onClick={() => {
                        setNotifyTitle(language === 'am' ? 'አጠቃላይ ማስታወቂያ' : 'General Announcement')
                        setNotifyMessage(
                          language === 'am'
                            ? 'ውድ የሰንበት ት/ቤት አባላት፣ የፊታችን እሁድ ልዩ የመዝሙር አገልግሎት ስላለ ሁላችንም በሰዓቱ እንድንገኝ በትህትና እናሳስባለን።'
                            : 'Dear Sunday School members, please be reminded that we have a special rehearsal this weekend. Please be on time!'
                        )
                      }}
                    >
                      📢 {t(language, 'General announcement')}
                    </button>
                    <button
                      type="button"
                      className="template-chip"
                      onClick={() => {
                        setNotifyTitle(language === 'am' ? 'የመዝሙር ልምምድ ጥሪ' : 'Rehearsal Reminder')
                        setNotifyMessage(
                          language === 'am'
                            ? 'ሰላም ቅዱሳን፣ ዛሬ ከሰዓት 11:30 ላይ የመዝሙር ልምምድ ስላለ በሰዓቱ ተገኝተን እንድንለማመድ እናሳስባለን።'
                            : 'Reminder: Choir rehearsal starts today at 5:30 PM. See you all there!'
                        )
                      }}
                    >
                      ⏰ {t(language, 'Rehearsal reminder')}
                    </button>
                    <button
                      type="button"
                      className="template-chip"
                      onClick={() => {
                        setNotifyTitle(language === 'am' ? 'የአገልግሎት ጥሪ' : 'Service Notice')
                        setNotifyMessage(
                          language === 'am'
                            ? 'የነገው የሰንበት ት/ቤት መርሐግብር በጠዋቱ 12:30 ይጀምራል። ሁላችንም በጸሎት ተዘጋጅተን እንድንገኝ እናሳስባለን።'
                            : 'Tomorrow morning program begins at 6:30 AM. Let us all prepare in prayer.'
                        )
                      }}
                    >
                      ⛪ {t(language, 'Service notice')}
                    </button>
                  </div>

                  <label className="field">
                    <span>{t(language, 'Notification title (optional)')}</span>
                    <input
                      value={notifyTitle}
                      onChange={(e) => setNotifyTitle(e.target.value)}
                      placeholder={language === 'am' ? 'ለምሳሌ፡ የሰንበት ት/ቤት ማስታወቂያ' : 'e.g. Sunday School Announcement'}
                      maxLength={120}
                    />
                  </label>

                  <label className="field" style={{ marginTop: 12 }}>
                    <span>{t(language, 'Write your message...')}</span>
                    <textarea
                      value={notifyMessage}
                      onChange={(e) => setNotifyMessage(e.target.value)}
                      placeholder={language === 'am' ? 'የመልእክቱን ዝርዝር እዚህ ይጻፉ...' : 'Write your announcement or notice here...'}
                      rows={5}
                      required
                      maxLength={4000}
                    />
                  </label>

                  <div className="telegram-preview">
                    <div className="preview-badge">{t(language, 'Live Telegram preview')}</div>
                    <div className="telegram-bubble">
                      <div className="tg-bot-header">
                        <img className="tg-bot-avatar" src="/logo.jpg" alt="Bot avatar" />
                        <span className="tg-bot-name">ብርሃነ ሕይወት ቦት</span>
                        <span className="tg-bot-tag">BOT</span>
                      </div>
                      {notifyTitle.trim() && (
                        <div className="tg-preview-title">📢 {notifyTitle.trim()}</div>
                      )}
                      <div className="tg-preview-body">
                        {notifyMessage.trim() || (language === 'am' ? 'የመልእክቱ ቅድመ-እይታ እዚህ ይታያል...' : 'Message preview will appear here...')}
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="submit-button"
                    style={{ width: '100%', marginTop: 10 }}
                    disabled={notifySending || !notifyMessage.trim()}
                  >
                    <Send size={15} />
                    {notifySending ? t(language, 'Sending...') : t(language, 'Send notification')}
                  </button>
                </form>
              </section>

              <div className="subscribers-panel">
                <section className="subscribers-card">
                  <div className="eyebrow"><Users size={12} style={{ display: 'inline', marginRight: 4 }} /> {t(language, 'Subscribers & visitors')}</div>
                  <h2>{t(language, 'Subscribers & visitors')} <span>({subscribers.length})</span></h2>
                  <p>{t(language, 'People who opened the Mini App')}</p>

                  <div className="subscribers-list">
                    {subscribers.map((u) => {
                      const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || 'Member'
                      return (
                        <div className="subscriber-row" key={u.telegramId}>
                          <div className="subscriber-info">
                            <span className="requester-avatar">
                              {fullName.charAt(0).toUpperCase()}
                            </span>
                            <div className="subscriber-details">
                              <strong>{fullName}</strong>
                              <span>{u.username ? `@${u.username}` : `ID: ${u.telegramId}`} • {u.visitCount} visits</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="subscriber-action-btn"
                            onClick={() => {
                              setNotifyTarget(u.telegramId)
                              setNotifyTitle(language === 'am' ? `ሰላም ${u.firstName || fullName}` : `Hello ${u.firstName || fullName}`)
                            }}
                          >
                            {t(language, 'Direct message')}
                          </button>
                        </div>
                      )
                    })}
                    {subscribers.length === 0 && !notifyLoading && (
                      <p className="empty-copy">{t(language, 'No subscribers found.')}</p>
                    )}
                  </div>
                </section>

                <section className="history-card">
                  <div className="eyebrow">{t(language, 'Recent broadcasts')}</div>
                  <h2>{t(language, 'Recent broadcasts')}</h2>
                  <div className="history-list">
                    {notificationHistory.map((h, i) => (
                      <div className="history-item" key={h.id || i}>
                        <div className="history-header">
                          <span className="history-title">{h.title || 'Broadcast'}</span>
                          <span className="history-time">{h.sentAt ? formatDateTime(h.sentAt, language) : ''}</span>
                        </div>
                        <div className="history-snippet">{h.message}</div>
                        <div className="history-stats">
                          ✓ Sent to {h.sentCount} {h.failedCount > 0 ? `(${h.failedCount} failed)` : ''}
                        </div>
                      </div>
                    ))}
                    {notificationHistory.length === 0 && (
                      <p className="empty-copy">{t(language, 'No broadcasts sent yet.')}</p>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : view === 'attendance' ? (
          <Attendance language={language} isAdmin={adminAuthenticated} defaultName={initialName} headers={telegramHeaders} notify={setToast} />
        ) : (
          <div className="page-content mezmur-content">
            <section className="page-heading mezmur-heading">
              <div><div className="eyebrow"><span className="eyebrow-line" /> BIRHANE HIWOT</div><h1>{t(language, 'Mezmur')}<span className="heading-period">.</span></h1><p>{t(language, 'Keep song lyrics together in one place.')}</p></div>
              {adminAuthenticated && <button type="button" className="submit-button add-lyrics-button" onClick={addLyricsBox}><Plus size={16} /> {t(language, 'Add lyrics box')}</button>}
            </section>
            <div className="mezmur-tabs" role="tablist" aria-label={t(language, 'Mezmur categories')}>
              {([{ id: 'all', label: 'All' }, ...mezmurCategories] as { id: MezmurFilter; label: string }[]).map((tab) => {
                const count = tab.id === 'all' ? lyricsBoxes.length : lyricsBoxes.filter((box) => box.category === tab.id).length
                return <button type="button" role="tab" key={tab.id} aria-selected={mezmurFilter === tab.id} className={mezmurFilter === tab.id ? 'mezmur-tab active' : 'mezmur-tab'} onClick={() => setMezmurFilter(tab.id)}>{t(language, tab.label)}<span className="mezmur-tab-count">{count}</span></button>
              })}
            </div>
            {adminAuthenticated && pendingSeeds.length > 0 && (
              <section className="seed-review" aria-label={t(language, 'Songbook approval')}>
                <div className="seed-review-head">
                  <div>
                    <strong>{language === 'am' ? `${pendingSeeds.length} የመዝሙር ጥራዝ መዝሙሮች ይሁንታ ይጠብቃሉ` : `${pendingSeeds.length} songbook songs are waiting for approval`}</strong>
                    <span>{t(language, 'They are hidden from everyone until you approve them.')}</span>
                  </div>
                  <button type="button" className="export-button seed-toggle" onClick={() => setSeedReviewOpen((open) => !open)} aria-expanded={seedReviewOpen}>
                    {t(language, seedReviewOpen ? 'Hide' : 'Review')} <ChevronDown size={15} className={seedReviewOpen ? 'seed-chevron open' : 'seed-chevron'} />
                  </button>
                </div>
                {seedReviewOpen && (
                  <>
                    <div className="seed-review-toolbar">
                      <span>{language === 'am' ? `${visibleSeeds.filter((s) => selectedSeeds.has(s.seedKey)).length} ከ ${visibleSeeds.length} ተመርጠዋል` : `${visibleSeeds.filter((s) => selectedSeeds.has(s.seedKey)).length} of ${visibleSeeds.length} selected`}</span>
                      <button type="button" className="seed-link" onClick={() => setVisibleSeedsSelected(true)}>{t(language, 'Select all')}</button>
                      <button type="button" className="seed-link" onClick={() => setVisibleSeedsSelected(false)}>{t(language, 'Select none')}</button>
                    </div>
                    <ul className="seed-list">
                      {visibleSeeds.map((song) => (
                        <li key={song.seedKey}>
                          <input type="checkbox" checked={selectedSeeds.has(song.seedKey)} onChange={() => toggleSeed(song.seedKey)} aria-label={song.title} />
                          <details>
                            <summary><span className="seed-title">{song.title}</span><span className="seed-category">{t(language, mezmurCategories.find((c) => c.id === song.category)?.label ?? '')}</span></summary>
                            <div className="lyrics-readonly-text seed-preview">{song.lyrics}</div>
                          </details>
                        </li>
                      ))}
                      {visibleSeeds.length === 0 && <li className="empty-copy">{t(language, 'No songs waiting in this category.')}</li>}
                    </ul>
                    <div className="seed-review-actions">
                      <button type="button" className="reject-seed-button" disabled={seedBusy || !visibleSeeds.some((s) => selectedSeeds.has(s.seedKey))} onClick={() => reviewSeeds('reject-seed')}><X size={15} /> {t(language, 'Reject selected')}</button>
                      <button type="button" className="submit-button" disabled={seedBusy || !visibleSeeds.some((s) => selectedSeeds.has(s.seedKey))} onClick={() => reviewSeeds('approve-seed')}><Check size={15} /> {t(language, 'Approve & publish selected')}</button>
                    </div>
                  </>
                )}
              </section>
            )}
            <section className="lyrics-grid" aria-label={t(language, 'Mezmur')}>
              {lyricsLoading && lyricsBoxes.length === 0 && <p className="empty-copy">{language === 'am' ? 'በመጫን ላይ…' : 'Loading lyrics…'}</p>}
              {visibleLyrics.map((box, index) => <article className="lyrics-box" key={box.id}>
                <div className="lyrics-box-heading"><span><Music2 size={16} /> {t(language, 'Lyrics')} {String(index + 1).padStart(2, '0')}</span>{adminAuthenticated && <button type="button" className="remove-lyrics-button" onClick={() => removeLyricsBox(box.id)} aria-label={`${t(language, 'Remove lyrics box')} ${index + 1}`} title={t(language, 'Remove lyrics box')}><X size={16} /></button>}</div>
                {adminAuthenticated ? (
                  <>
                    <label className="field"><span>{t(language, 'Song title')}</span><input value={box.title} onChange={(event) => updateLyricsBox(box.id, 'title', event.target.value)} onBlur={() => saveLyricsBox(box.id)} placeholder={t(language, 'Song title')} /></label>
                    <label className="field"><span>{t(language, 'Category')}</span><select value={box.category ?? ''} onChange={(event) => updateLyricsCategory(box.id, (event.target.value || undefined) as MezmurCategory | undefined)}><option value="">{t(language, 'No category')}</option>{mezmurCategories.map((category) => <option key={category.id} value={category.id}>{t(language, category.label)}</option>)}</select></label>
                    <label className="field lyrics-text-field"><span>{t(language, 'Lyrics')}</span><textarea value={box.lyrics} onChange={(event) => updateLyricsBox(box.id, 'lyrics', event.target.value)} onBlur={() => saveLyricsBox(box.id)} placeholder={t(language, 'Write or paste the lyrics here...')} rows={8} /></label>
                  </>
                ) : (
                  <>
                    <div className="lyrics-readonly-title">{box.title || t(language, 'Untitled')}</div>
                    <div className="lyrics-readonly-text">{box.lyrics || t(language, 'No lyrics yet.')}</div>
                  </>
                )}
              </article>)}
              {!lyricsLoading && visibleLyrics.length === 0 && (
                adminAuthenticated
                  ? <button type="button" className="empty-lyrics-button" onClick={addLyricsBox}><Plus size={17} /> {t(language, 'Add lyrics box')}</button>
                  : <p className="empty-copy">{t(language, mezmurFilter === 'all' ? 'No lyrics have been added yet.' : 'No lyrics in this category yet.')}</p>
              )}
            </section>
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
