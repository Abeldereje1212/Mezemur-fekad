import { useEffect, useState, type FormEvent } from 'react'
import { Phone, X } from 'lucide-react'

type Language = 'en' | 'am'

interface ContactWebApp {
  requestContact?: (callback: (shared: boolean, result?: { responseUnsafe?: { contact?: { phone_number?: string } } }) => void) => void
}

interface PhonePromptProps {
  language: Language
  headers: () => Record<string, string>
  notify: (message: string) => void
}

const am: Record<string, string> = {
  'MEMBERSHIP': 'አባልነት',
  'Add your phone number': 'ስልክ ቁጥርዎን ያስገቡ',
  'You are now a member. Please add your phone number so the admin has your full details.': 'አሁን አባል ሆነዋል። አስተዳዳሪው ሙሉ መረጃዎን እንዲያገኝ እባክዎ ስልክ ቁጥርዎን ያስገቡ።',
  'Phone number': 'ስልክ ቁጥር',
  'Share my Telegram number': 'የቴሌግራም ቁጥሬን አጋራ',
  'Save': 'አስቀምጥ',
  'Later': 'በኋላ',
  'Close': 'ዝጋ',
  'Phone number saved.': 'ስልክ ቁጥር ተቀምጧል።',
  'Please enter a valid phone number.': 'እባክዎ ትክክለኛ ስልክ ቁጥር ያስገቡ።',
  'Only approved members can add a phone number.': 'ስልክ ቁጥር ማስገባት የሚችሉት የጸደቁ አባላት ብቻ ናቸው።',
  'Something went wrong.': 'ችግር ተፈጥሯል።',
}

// Records the visit when the app opens from Telegram, and asks newly approved members for their phone.
export default function PhonePrompt({ language, headers, notify }: PhonePromptProps) {
  const tx = (text: string) => (language === 'am' ? am[text] ?? text : text)
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const webApp = window.Telegram?.WebApp as unknown as ContactWebApp | undefined

  useEffect(() => {
    if (!headers()['x-telegram-init-data']) return
    let active = true
    fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({ action: 'visit' }),
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((result: { member?: { status: string; phone?: string } | null } | null) => {
        if (active && result?.member?.status === 'approved' && !result.member.phone) setOpen(true)
      })
      .catch(() => {})
    return () => { active = false }
  }, [headers])

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
        body: JSON.stringify({ action: 'set-phone', phone }),
      })
      const result = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Something went wrong.')
      setOpen(false)
      notify(tx('Phone number saved.'))
    } catch (error) {
      notify(tx(error instanceof Error ? error.message : 'Something went wrong.'))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="login-backdrop" role="presentation">
      <section className="login-dialog" role="dialog" aria-modal="true" aria-labelledby="phone-title">
        <button type="button" className="login-close" onClick={() => setOpen(false)} aria-label={tx('Close')}><X size={17} /></button>
        <div className="login-icon"><Phone size={19} /></div>
        <div className="eyebrow">{tx('MEMBERSHIP')}</div>
        <h2 id="phone-title">{tx('Add your phone number')}</h2>
        <p className="login-description">{tx('You are now a member. Please add your phone number so the admin has your full details.')}</p>
        <form className="login-form" onSubmit={save}>
          <label className="field"><span>{tx('Phone number')}</span><input type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+251 9XX XXX XXX" required minLength={5} maxLength={40} /></label>
          {webApp?.requestContact && <button type="button" className="export-button" onClick={shareTelegramNumber}><Phone size={14} /> {tx('Share my Telegram number')}</button>}
          <button type="submit" className="submit-button login-submit" disabled={saving}>{tx('Save')}</button>
          <button type="button" className="phone-later" onClick={() => setOpen(false)}>{tx('Later')}</button>
        </form>
      </section>
    </div>
  )
}
