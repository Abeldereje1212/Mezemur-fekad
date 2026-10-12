import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, MessageSquareText, Send, Trash2 } from 'lucide-react'

type Language = 'en' | 'am'

interface FeedbackItem {
  id: string
  message: string
  name?: string
  username?: string
  anonymous: boolean
  read: boolean
  submittedAt: string
}

interface FeedbackProps {
  language: Language
  isAdmin: boolean
  defaultName: string
  headers: () => Record<string, string>
  notify: (message: string) => void
}

const am: Record<string, string> = {
  'Feedback': 'አስተያየት መስጫ',
  'Share your ideas, concerns or suggestions with the admin.': 'ሀሳብዎን፣ ስጋትዎን ወይም ጥቆማዎን ለአስተዳዳሪው ያካፍሉ።',
  'Read what members are saying.': 'አባላት የሰጧቸውን አስተያየቶች ያንብቡ።',
  'NEW FEEDBACK': 'አዲስ አስተያየት',
  'Write your feedback': 'አስተያየትዎን ይጻፉ',
  'Your name (optional)': 'ስምዎ (አማራጭ)',
  'Your feedback': 'አስተያየትዎ',
  'What would you like to share?': 'ምን ማካፈል ይፈልጋሉ?',
  'Send anonymously': 'ስሜ ሳይገለጽ ላክ',
  'Your name will not be shown to the admin.': 'ስምዎ ለአስተዳዳሪው አይታይም።',
  'Send feedback': 'አስተያየት ላክ',
  'Sending…': 'በመላክ ላይ…',
  'Thank you! Your feedback was sent.': 'እናመሰግናለን! አስተያየትዎ ተልኳል።',
  'YOUR FEEDBACK': 'የእርስዎ አስተያየቶች',
  'Sent earlier': 'ቀደም ሲል የላኳቸው',
  'Nothing sent yet.': 'ገና ምንም አልላኩም።',
  'Seen by admin': 'አስተዳዳሪው አይቶታል',
  'Not seen yet': 'ገና አልታየም',
  'INBOX': 'የገቢ መልእክቶች',
  'All feedback': 'ሁሉም አስተያየቶች',
  'unread': 'ያልተነበቡ',
  'No feedback yet.': 'ገና ምንም አስተያየት የለም።',
  'Anonymous': 'ስም ያልተገለጸ',
  'Mark as read': 'እንደተነበበ ምልክት አድርግ',
  'Delete': 'ሰርዝ',
  'Delete this feedback?': 'ይህን አስተያየት ይሰርዙ?',
  'Loading…': 'በመጫን ላይ…',
  'Please write your feedback (up to 2000 characters).': 'እባክዎ አስተያየትዎን ይጻፉ (እስከ 2000 ፊደላት)።',
  'Please wait a moment before sending more feedback.': 'እባክዎ ሌላ አስተያየት ከመላክዎ በፊት ትንሽ ይጠብቁ።',
  'The feedback service is temporarily unavailable.': 'የአስተያየት አገልግሎቱ ለጊዜው አይገኝም።',
  'Something went wrong.': 'ችግር ተፈጥሯል።',
}

export default function Feedback({ language, isAdmin, defaultName, headers, notify }: FeedbackProps) {
  const tx = (text: string) => (language === 'am' ? am[text] ?? text : text)
  const formatDateTime = (value: string) => new Intl.DateTimeFormat(language === 'am' ? 'am-ET' : 'en', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))

  const [items, setItems] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState(defaultName)
  const [message, setMessage] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/feedback', { headers: headers(), cache: 'no-store' })
      if (!response.ok) return
      const result = await response.json() as { feedback: FeedbackItem[] }
      setItems(result.feedback)
    } catch {
      // Keep the last loaded list.
    } finally {
      setLoading(false)
    }
  }, [headers])

  useEffect(() => { void load() }, [load, isAdmin])

  async function call(method: string, body: Record<string, unknown>) {
    const response = await fetch('/api/feedback', {
      method,
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify(body),
    })
    const result = await response.json().catch(() => ({})) as { error?: string; feedback?: FeedbackItem }
    if (!response.ok) throw new Error(result.error || 'Something went wrong.')
    return result
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending) return
    setSending(true)
    try {
      const result = await call('POST', { message, name, anonymous })
      if (result.feedback) setItems((current) => [result.feedback!, ...current])
      setMessage('')
      notify(tx('Thank you! Your feedback was sent.'))
    } catch (error) {
      notify(tx(error instanceof Error ? error.message : 'Something went wrong.'))
    } finally {
      setSending(false)
    }
  }

  async function markRead(id: string) {
    try {
      await call('PATCH', { id, read: true })
      setItems((current) => current.map((item) => item.id === id ? { ...item, read: true } : item))
    } catch (error) {
      notify(tx(error instanceof Error ? error.message : 'Something went wrong.'))
    }
  }

  async function remove(id: string) {
    if (!window.confirm(tx('Delete this feedback?'))) return
    try {
      await call('DELETE', { id })
      setItems((current) => current.filter((item) => item.id !== id))
    } catch (error) {
      notify(tx(error instanceof Error ? error.message : 'Something went wrong.'))
    }
  }

  const unreadCount = items.filter((item) => !item.read).length

  if (isAdmin) {
    return (
      <div className="page-content feedback-content">
        <section className="page-heading">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> MEZEMERAN FEKAD / ADMIN</div>
            <h1>{tx('Feedback')}<span className="heading-period">.</span></h1>
            <p>{tx('Read what members are saying.')}</p>
          </div>
          <div className="admin-count"><span>{tx('INBOX')}</span><strong>{unreadCount.toString().padStart(2, '0')} <small>{tx('unread')}</small></strong></div>
        </section>

        <section className="feedback-list" aria-label={tx('All feedback')}>
          {loading && items.length === 0 && <p className="empty-copy">{tx('Loading…')}</p>}
          {!loading && items.length === 0 && <div className="inbox-empty"><MessageSquareText size={22} /><p>{tx('No feedback yet.')}</p></div>}
          {items.map((item) => (
            <article key={item.id} className={item.read ? 'feedback-item' : 'feedback-item unread'}>
              <div className="feedback-meta">
                <strong>{item.anonymous ? tx('Anonymous') : item.name || item.username || tx('Anonymous')}</strong>
                {!item.anonymous && item.username && <span>{item.username}</span>}
                <time dateTime={item.submittedAt}>{formatDateTime(item.submittedAt)}</time>
              </div>
              <p className="feedback-message">{item.message}</p>
              <div className="feedback-actions">
                {!item.read && <button type="button" className="export-button" onClick={() => markRead(item.id)}><Check size={14} /> {tx('Mark as read')}</button>}
                <button type="button" className="reject-button" onClick={() => remove(item.id)} aria-label={tx('Delete')} title={tx('Delete')}><Trash2 size={15} /></button>
              </div>
            </article>
          ))}
        </section>
      </div>
    )
  }

  return (
    <div className="page-content feedback-content">
      <section className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> MEZEMERAN FEKAD</div>
          <h1>{tx('Feedback')}<span className="heading-period">.</span></h1>
          <p>{tx('Share your ideas, concerns or suggestions with the admin.')}</p>
        </div>
      </section>

      <div className="request-layout">
        <section className="form-panel">
          <div className="panel-heading"><div><div className="eyebrow">{tx('NEW FEEDBACK')}</div><h2>{tx('Write your feedback')}</h2></div></div>
          <form className="request-form" onSubmit={submit}>
            {!anonymous && <label className="field"><span>{tx('Your name (optional)')}</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /></label>}
            <label className="field"><span>{tx('Your feedback')}</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={tx('What would you like to share?')} rows={6} required minLength={2} maxLength={2000} /></label>
            <label className="feedback-anon"><input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} /> <span>{tx('Send anonymously')}{anonymous && <small>{tx('Your name will not be shown to the admin.')}</small>}</span></label>
            <div className="form-footer"><span>{message.length}/2000</span><button className="submit-button" type="submit" disabled={sending}>{sending ? tx('Sending…') : tx('Send feedback')} {!sending && <Send size={15} />}</button></div>
          </form>
        </section>

        <aside className="activity-panel">
          <div className="activity-title"><div><div className="eyebrow">{tx('YOUR FEEDBACK')}</div><h2>{tx('Sent earlier')}</h2></div><span className="activity-count">{items.length.toString().padStart(2, '0')}</span></div>
          {!loading && items.length === 0 && <p className="empty-copy">{tx('Nothing sent yet.')}</p>}
          <div className="activity-list">
            {items.map((item) => (
              <article className="activity-item" key={item.id}>
                <span className={`activity-marker ${item.read ? 'marker-approved' : 'marker-pending'}`} />
                <div className="activity-details">
                  <div className="feedback-message feedback-snippet">{item.message}</div>
                  <div className="activity-meta">{formatDateTime(item.submittedAt)} <span>·</span> {tx(item.read ? 'Seen by admin' : 'Not seen yet')}</div>
                </div>
              </article>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
