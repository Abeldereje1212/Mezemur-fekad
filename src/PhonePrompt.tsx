import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Phone } from 'lucide-react'

type Language = 'en' | 'am'

interface ContactWebApp {
  requestContact?: (callback: (shared: boolean, result?: { responseUnsafe?: { contact?: { phone_number?: string } } }) => void) => void
}

interface PhonePromptProps {
  language: Language
  defaultName: string
  headers: () => Record<string, string>
  notify: (message: string) => void
}

// Remembered on the device so the popup shows instantly on the next open, before the server answers.
const PHONE_REQUIRED_KEY = 'phone_required'
// While someone waits for approval, check again this often so the popup appears soon after approval.
const RECHECK_MS = 15_000

function readPhoneRequired() {
  try { return localStorage.getItem(PHONE_REQUIRED_KEY) === '1' } catch { return false }
}

function writePhoneRequired(required: boolean) {
  try {
    if (required) localStorage.setItem(PHONE_REQUIRED_KEY, '1')
    else localStorage.removeItem(PHONE_REQUIRED_KEY)
  } catch {
    // Storage may be blocked; the server check still opens the popup.
  }
}

const am: Record<string, string> = {
  'MEMBERSHIP': 'አባልነት',
  'Complete your details': 'መረጃዎን ያጠናቅቁ',
  'Welcome! Please add your full name and phone number so the admin has your full details.': 'እንኳን ደህና መጡ! አስተዳዳሪው ሙሉ መረጃዎን እንዲያገኝ እባክዎ ሙሉ ስምዎን እና ስልክ ቁጥርዎን ያስገቡ።',
  'Full name': 'ሙሉ ስም',
  'Phone number': 'ስልክ ቁጥር',
  'Share my Telegram number': 'የቴሌግራም ቁጥሬን አጋራ',
  'Save': 'አስቀምጥ',
  'Saving…': 'በማስቀመጥ ላይ…',
  'Your details were saved.': 'መረጃዎ ተቀምጧል።',
  'Please enter your full name.': 'እባክዎ ሙሉ ስምዎን ያስገቡ።',
  'Please enter a valid phone number.': 'እባክዎ ትክክለኛ ስልክ ቁጥር ያስገቡ።',
  'Only members can update their details.': 'መረጃቸውን ማስተካከል የሚችሉት አባላት ብቻ ናቸው።',
  'Something went wrong.': 'ችግር ተፈጥሯል።',
}

// Records the visit when the app opens from Telegram (which makes a new user a member),
// and requires members without a phone to add their full name and phone number.
export default function PhonePrompt({ language, defaultName, headers, notify }: PhonePromptProps) {
  const tx = (text: string) => (language === 'am' ? am[text] ?? text : text)
  const inTelegram = Boolean(headers()['x-telegram-init-data'])
  const [open, setOpen] = useState(() => inTelegram && readPhoneRequired())
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
      if (!response.ok) return
      const result = await response.json() as { member?: { status: string; name?: string; phone?: string } | null }
      const status = result.member?.status
      const required = status === 'approved' && !result.member?.phone
      writePhoneRequired(required)
      setOpen(required)
      // Rejoin requests wait for the admin; re-check so the popup appears once they are let back in.
      setWaiting(status === 'pending')
      if (required && result.member?.name) setName((current) => current || result.member!.name!)
    } catch {
      // Offline: keep whatever the device remembered.
    }
  }, [headers])

  useEffect(() => {
    if (inTelegram) void check()
  }, [inTelegram, check])

  // Re-check while waiting for approval, and whenever the member comes back to the app.
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
      writePhoneRequired(false)
      setOpen(false)
      notify(tx('Your details were saved.'))
    } catch (error) {
      notify(tx(error instanceof Error ? error.message : 'Something went wrong.'))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  // No close button: the popup stays until the member saves their details.
  return (
    <div className="login-backdrop" role="presentation">
      <section className="login-dialog" role="dialog" aria-modal="true" aria-labelledby="phone-title">
        <div className="login-icon"><Phone size={19} /></div>
        <div className="eyebrow">{tx('MEMBERSHIP')}</div>
        <h2 id="phone-title">{tx('Complete your details')}</h2>
        <p className="login-description">{tx('Welcome! Please add your full name and phone number so the admin has your full details.')}</p>
        <form className="login-form" onSubmit={save}>
          <label className="field"><span>{tx('Full name')}</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={120} /></label>
          <label className="field"><span>{tx('Phone number')}</span><input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+251 9XX XXX XXX" required minLength={5} maxLength={40} /></label>
          {webApp?.requestContact && <button type="button" className="export-button" onClick={shareTelegramNumber}><Phone size={14} /> {tx('Share my Telegram number')}</button>}
          <button type="submit" className="submit-button login-submit" disabled={saving}>{tx(saving ? 'Saving…' : 'Save')}</button>
        </form>
      </section>
    </div>
  )
}
