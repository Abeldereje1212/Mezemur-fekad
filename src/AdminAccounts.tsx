import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { KeyRound, Trash2, UserPlus, UsersRound } from 'lucide-react'

type Language = 'en' | 'am'

interface AdminAccount {
  username: string
  createdAt: string
  createdBy?: string
  updatedAt?: string
}

interface AdminAccountsProps {
  language: Language
  notify: (message: string) => void
}

const am: Record<string, string> = {
  'Admin accounts': 'የአስተዳዳሪ መለያዎች',
  'Give usernames and passwords to other admins, and change your own password.': 'ለሌሎች አስተዳዳሪዎች የተጠቃሚ ስም እና የይለፍ ቃል ይስጡ፤ የራስዎንም የይለፍ ቃል ይቀይሩ።',
  'SIGNED IN AS': 'የገቡት በ',
  'Main admin': 'ዋና አስተዳዳሪ',
  'Admin': 'አስተዳዳሪ',
  'Change my password': 'የይለፍ ቃሌን ቀይር',
  'Current password': 'የአሁኑ የይለፍ ቃል',
  'New password': 'አዲስ የይለፍ ቃል',
  'Confirm new password': 'አዲሱን የይለፍ ቃል ያረጋግጡ',
  'Save password': 'የይለፍ ቃል አስቀምጥ',
  'Give a new admin access': 'ለአዲስ አስተዳዳሪ መግቢያ ይስጡ',
  'They sign in with this username and password from Admin review.': 'በዚህ የተጠቃሚ ስም እና የይለፍ ቃል በአስተዳዳሪ ግምገማ ይገባሉ።',
  'Username': 'የተጠቃሚ ስም',
  'Password': 'የይለፍ ቃል',
  'Create account': 'መለያ ፍጠር',
  'Admins you have added': 'ያከሏቸው አስተዳዳሪዎች',
  'No other admins yet.': 'ገና ሌላ አስተዳዳሪ የለም።',
  'Reset password': 'የይለፍ ቃል ቀይር',
  'Remove': 'አስወግድ',
  'Added': 'የተጨመረው',
  'Loading…': 'በመጫን ላይ…',
  'Passwords do not match.': 'የይለፍ ቃሎቹ አይመሳሰሉም።',
  'Password changed.': 'የይለፍ ቃሉ ተቀይሯል።',
  'Account created.': 'መለያው ተፈጥሯል።',
  'Password reset.': 'የይለፍ ቃሉ ተቀይሯል።',
  'Account removed.': 'መለያው ተወግዷል።',
  'Current password is incorrect.': 'የአሁኑ የይለፍ ቃል ትክክል አይደለም።',
  'That username is already taken.': 'ይህ የተጠቃሚ ስም ተይዟል።',
  'Something went wrong.': 'ችግር ተፈጥሯል።',
  'Only the main admin can give accounts to other admins.': 'ለሌሎች መለያ መስጠት የሚችለው ዋናው አስተዳዳሪ ብቻ ነው።',
}

async function send(method: string, body: Record<string, unknown>) {
  const response = await fetch('/api/admin/accounts', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(result.error || 'Something went wrong.')
}

export default function AdminAccounts({ language, notify }: AdminAccountsProps) {
  const tx = (text: string) => (language === 'am' ? am[text] ?? text : text)
  const [me, setMe] = useState<{ username: string; role: 'owner' | 'admin' } | null>(null)
  const [accounts, setAccounts] = useState<AdminAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const formatDate = (value: string) => new Intl.DateTimeFormat(language === 'am' ? 'am-ET' : 'en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/accounts', { cache: 'no-store' })
      if (!response.ok) return
      const result = await response.json() as { me: { username: string; role: 'owner' | 'admin' }; accounts: AdminAccount[] }
      setMe(result.me)
      setAccounts(result.accounts)
    } catch {
      // Keep whatever was loaded last.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true)
    try {
      await action()
      notify(tx(success))
      return true
    } catch (error) {
      notify(tx(error instanceof Error ? error.message : 'Something went wrong.'))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newPassword !== confirmPassword) { notify(tx('Passwords do not match.')); return }
    const ok = await run(() => send('POST', { action: 'change-password', currentPassword, newPassword }), 'Password changed.')
    if (ok) { setCurrentPassword(''); setNewPassword(''); setConfirmPassword('') }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const ok = await run(() => send('POST', { action: 'create', username: newUsername, password: newUserPassword }), 'Account created.')
    if (ok) { setNewUsername(''); setNewUserPassword(''); void load() }
  }

  async function resetPassword(username: string) {
    const password = window.prompt(`${tx('New password')} — ${username}`)
    if (!password) return
    if (await run(() => send('POST', { action: 'reset', username, password }), 'Password reset.')) void load()
  }

  async function removeAccount(username: string) {
    if (!window.confirm(`${tx('Remove')} ${username}?`)) return
    if (await run(() => send('DELETE', { username }), 'Account removed.')) void load()
  }

  const isOwner = me?.role === 'owner'

  return (
    <div className="page-content accounts-content">
      <section className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> MEZEMERAN FEKAD / ADMIN</div>
          <h1>{tx('Admin accounts')}<span className="heading-period">.</span></h1>
          <p>{tx('Give usernames and passwords to other admins, and change your own password.')}</p>
        </div>
        {me && <div className="admin-count"><span>{tx('SIGNED IN AS')}</span><strong>{me.username} <small>{tx(isOwner ? 'Main admin' : 'Admin')}</small></strong></div>}
      </section>

      {loading && !me && <p className="empty-copy">{tx('Loading…')}</p>}

      <div className="accounts-grid">
        {isOwner && (
          <section className="form-panel">
            <div className="panel-heading"><div><div className="eyebrow"><UserPlus size={12} /></div><h2>{tx('Give a new admin access')}</h2></div></div>
            <p className="panel-description">{tx('They sign in with this username and password from Admin review.')}</p>
            <form className="request-form" onSubmit={createAccount}>
              <label className="field"><span>{tx('Username')}</span><input value={newUsername} onChange={(event) => setNewUsername(event.target.value.toLowerCase())} placeholder="e.g. abebe" autoComplete="off" required minLength={3} maxLength={32} pattern="[a-z0-9_.\-]+" /></label>
              <label className="field"><span>{tx('Password')}</span><input value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} type="text" autoComplete="new-password" required minLength={6} /></label>
              <div className="form-footer"><span /><button className="submit-button" type="submit" disabled={busy}>{tx('Create account')} <UserPlus size={15} /></button></div>
            </form>
          </section>
        )}

        {me && (
          <section className="form-panel">
            <div className="panel-heading"><div><div className="eyebrow"><KeyRound size={12} /></div><h2>{tx('Change my password')}</h2></div></div>
            <form className="request-form" onSubmit={changePassword}>
              <label className="field"><span>{tx('Current password')}</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
              <label className="field"><span>{tx('New password')}</span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required minLength={6} /></label>
              <label className="field"><span>{tx('Confirm new password')}</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required minLength={6} /></label>
              <div className="form-footer"><span /><button className="submit-button" type="submit" disabled={busy}>{tx('Save password')} <KeyRound size={15} /></button></div>
            </form>
          </section>
        )}
      </div>

      {isOwner && (
        <section className="form-panel accounts-list-panel">
          <div className="panel-heading"><div><div className="eyebrow"><UsersRound size={12} /></div><h2>{tx('Admins you have added')}</h2></div><span className="panel-index">{accounts.length.toString().padStart(2, '0')}</span></div>
          {accounts.length === 0 && <p className="empty-copy">{tx('No other admins yet.')}</p>}
          <ul className="accounts-list">
            {accounts.map((account) => (
              <li key={account.username}>
                <span className="requester-avatar">{account.username.charAt(0).toUpperCase()}</span>
                <span className="accounts-name"><strong>{account.username}</strong><small>{tx('Added')}: {formatDate(account.createdAt)}</small></span>
                <button type="button" className="export-button" onClick={() => resetPassword(account.username)} disabled={busy}><KeyRound size={14} /> {tx('Reset password')}</button>
                <button type="button" className="reject-button" onClick={() => removeAccount(account.username)} disabled={busy} aria-label={`${tx('Remove')} ${account.username}`} title={tx('Remove')}><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {me && !isOwner && <p className="empty-copy">{tx('Only the main admin can give accounts to other admins.')}</p>}
    </div>
  )
}
