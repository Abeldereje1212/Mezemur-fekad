import { Bell, Megaphone, UserRound } from 'lucide-react'

type Language = 'en' | 'am'

export interface InboxNotification {
  id: string
  title?: string
  message: string
  sentAt: string
  personal: boolean
}

interface NotificationsProps {
  language: Language
  items: InboxNotification[]
  loading: boolean
  // Notifications newer than this were unread when the page was opened.
  seenBefore: string
}

const am: Record<string, string> = {
  'Notifications': 'ማሳወቂያዎች',
  'Announcements and messages from the admin.': 'ከአስተዳዳሪው የተላኩ ማስታወቂያዎች እና መልእክቶች።',
  'No notifications yet.': 'ገና ምንም ማሳወቂያ የለም።',
  'Loading…': 'በመጫን ላይ…',
  'Announcement': 'ማስታወቂያ',
  'For you': 'ለእርስዎ',
  'New': 'አዲስ',
  'You also receive these in your Telegram chat with the bot.': 'እነዚህን መልእክቶች በቴሌግራም ከቦቱ ጋር ባለዎት ውይይትም ያገኛሉ።',
}

export default function Notifications({ language, items, loading, seenBefore }: NotificationsProps) {
  const tx = (text: string) => (language === 'am' ? am[text] ?? text : text)
  const formatDateTime = (value: string) => new Intl.DateTimeFormat(language === 'am' ? 'am-ET' : 'en', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))

  return (
    <div className="page-content inbox-content">
      <section className="page-heading">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> BIRHANE HIWOT</div>
          <h1>{tx('Notifications')}<span className="heading-period">.</span></h1>
          <p>{tx('Announcements and messages from the admin.')}</p>
        </div>
      </section>

      <section className="inbox-list" aria-label={tx('Notifications')}>
        {loading && items.length === 0 && <p className="empty-copy">{tx('Loading…')}</p>}
        {!loading && items.length === 0 && (
          <div className="inbox-empty"><Bell size={22} /><p>{tx('No notifications yet.')}</p></div>
        )}
        {items.map((item) => {
          const unread = item.sentAt > seenBefore
          return (
            <article key={item.id} className={unread ? 'inbox-item unread' : 'inbox-item'}>
              <span className={item.personal ? 'inbox-icon personal' : 'inbox-icon'}>{item.personal ? <UserRound size={16} /> : <Megaphone size={16} />}</span>
              <div className="inbox-body">
                <div className="inbox-meta">
                  <span className="inbox-kind">{tx(item.personal ? 'For you' : 'Announcement')}</span>
                  {unread && <span className="inbox-new">{tx('New')}</span>}
                  <time dateTime={item.sentAt}>{formatDateTime(item.sentAt)}</time>
                </div>
                {item.title && <h2>{item.title}</h2>}
                <p>{item.message}</p>
              </div>
            </article>
          )
        })}
      </section>
      {items.length > 0 && <p className="inbox-footnote">{tx('You also receive these in your Telegram chat with the bot.')}</p>}
    </div>
  )
}
