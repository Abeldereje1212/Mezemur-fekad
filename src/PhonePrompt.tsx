import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Phone } from 'lucide-react'

type Language = 'en' | 'am'
// 'checking': not known yet on this device; 'offline': that first check failed;
// 'required': must fill in the page; 'done': go straight to the app.
type ProfileState = 'checking' | 'offline' | 'required' | 'done'

interface ContactWebApp {
  requestContact?: (callback: (shared: boolean, result?: { responseUnsafe?: { contact?: { phone_number?: string } } }) => void) => void
}

interface PhonePromptProps {
  language: Language
  defaultName: string
  headers: () => Record<string, string>
  notify: (message: string) => void
}

// Remembered on the device so the right screen shows instantly on the next open, before the server answers.
const PROFILE_KEY = 'profile_state'
// While a rejoin request waits for the admin, check again this often so the page appears soon after approval.
const RECHECK_MS = 15_000

function readProfileState(): ProfileState {
  try {
    const value = localStorage.getItem(PROFILE_KEY)
    return value === 'required' || value === 'done' ? value : 'checking'
  } catch {
    return 'checking'
  }
}

function writeProfileState(state: 'required' | 'done') {
  try { localStorage.setItem(PROFILE_KEY, state) } catch { /* Storage may be blocked; the server check still decides. */ }
}

const am: Record<string, string> = {
  'MEMBERSHIP': 'አባልነት',
  'Complete your details': 'መረጃዎን ያጠናቅቁ',
  'Welcome! Please add your full name and phone number so the admin has your full details.': 'እንኳን ደህና መጡ! አስተዳዳሪው ሙሉ መረጃዎን እንዲያገኝ እባክዎ ሙሉ ስምዎን እና ስልክ ቁጥርዎን ያስገቡ።',
  'Full name': 'ሙሉ ስም',
  'Phone number': 'ስልክ ቁጥር',
  'Share my Telegram number': 'የቴሌግራም ቁጥሬን አጋራ',
  'Continue': 'ቀጥል',
  'Saving…': 'በማስቀመጥ ላይ…',
  'Loading…': 'በመጫን ላይ…',
  "Couldn't connect. Check your internet and try again.": 'መገናኘት አልተቻለም። ኢንተርኔትዎን ያረጋግጡና እንደገና ይሞክሩ።',
  'Try again': 'እንደገና ሞክር',
  'Your details were saved.': 'መረጃዎ ተቀምጧል።',
  'Please enter your full name.': 'እባክዎ ሙሉ ስምዎን ያስገቡ።',
  'Please enter a valid phone number.': 'እባክዎ ትክክለኛ ስልክ ቁጥር ያስገቡ።',
  'Only members can update their details.': 'መረጃቸውን ማስተካከል የሚችሉት አባላት ብቻ ናቸው።',
  'Something went wrong.': 'ችግር ተፈጥሯል።',
}

// The first page a Telegram user sees: it records the visit (which makes a new user a member) and,
// until the member has given their full name and phone number, covers the whole app with only those questions.
export default function PhonePrompt({ language, defaultName, headers, notify }: PhonePromptProps) {
  const tx = (text: string) => (language === 'am' ? am[text] ?? text : text)
  const inTelegram = Boolean(headers()['x-telegram-init-data'])
  const [state, setState] = useState<ProfileState>(() => (inTelegram ? readProfileState() : 'done'))
  const [waiting, setWaiting] = useState(false)
  const [name, setName] = useState(defaultName)
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const webApp = window.Telegram?.WebApp as unknown as ContactWebApp | undefined

  const check = useCallback(async () => {
    try {
      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ action: 'visit' }),
      })
      if (!response.ok) throw new Error()
      const result = await response.json() as { member?: { status: string; name?: string; phone?: string } | null }
      const status = result.member?.status
      const next = status === 'approved' && !result.member?.phone ? 'required' : 'done'
      writeProfileState(next)
      setState(next)
      setWaiting(status === 'pending')
      if (next === 'required' && result.member?.name) setName((current) => current || result.member!.name!)
    } catch {
      // A first-time visitor must not get into the app before we know whether their details are stored.
      setState((current) => (current === 'checking' ? 'offline' : current))
    }
  }, [headers])

  useEffect(() => {
    if (inTelegram) void check()
  }, [inTelegram, check])

  // Re-check while a rejoin request is waiting, and whenever the member comes back to the app.
  useEffect(() => {
    if (!waiting) return
    const interval = window.setInterval(() => void check(), RECHECK_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [waiting, check])

  // The app underneath must not scroll while this page is showing.
  useEffect(() => {
    if (state === 'done') return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [state])

  function shareTelegramNumber() {
    webApp?.requestContact?.((shared, result) => {
      const number = result?.responseUnsafe?.contact?.phone_number
      if (shared && number) setPhone(number.startsWith('+') ? number : `+${number}`)
    })
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ action: 'complete-profile', name, phone }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Something went wrong.')
      writeProfileState('done')
      setState('done')
      notify(tx('Your details were saved.'))
    } catch (error) {
      notify(tx(error instanceof Error ? error.message : 'Something went wrong.'))
    } finally {
      setSaving(false)
    }
  }

  if (state === 'done') return null

  if (state === 'checking') {
    return <div className="profile-page" aria-busy="true"><p className="profile-loading">{tx('Loading…')}</p></div>
  }

  if (state === 'offline') {
    return (
      <div className="profile-page">
        <section className="profile-card profile-offline" role="alert">
          <p className="profile-loading">{tx("Couldn't connect. Check your internet and try again.")}</p>
          <button type="button" className="submit-button login-submit" onClick={() => { setState('checking'); void check() }}>{tx('Try again')}</button>
        </section>
      </div>
    )
  }

  // No way to skip: the page stays until the member saves their details.
  return (
    <div className="profile-page">
      <section className="profile-card" aria-labelledby="profile-title">
        <div className="login-icon"><Phone size={19} /></div>
        <div className="eyebrow">{tx('MEMBERSHIP')}</div>
        <h1 id="profile-title">{tx('Complete your details')}</h1>
        <p className="login-description">{tx('Welcome! Please add your full name and phone number so the admin has your full details.')}</p>
        <form className="login-form" onSubmit={save}>
          <label className="field"><span>{tx('Full name')}</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={120} /></label>
          <label className="field"><span>{tx('Phone number')}</span><input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+251 9XX XXX XXX" required minLength={5} maxLength={40} /></label>
          {webApp?.requestContact && <button type="button" className="export-button" onClick={shareTelegramNumber}><Phone size={14} /> {tx('Share my Telegram number')}</button>}
          <button type="submit" className="submit-button login-submit" disabled={saving}>{tx(saving ? 'Saving…' : 'Continue')}</button>
        </form>
      </section>
    </div>
  )
}
