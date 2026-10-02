import { useCallback, useEffect, useState } from 'react'
import { Download } from 'lucide-react'

type Language = 'en' | 'am'
type Preset = 'month' | 'last30' | 'year' | 'all' | 'custom'

interface ReportCounts { present: number; absent: number; excused: number; rate: number | null }

interface Report {
  range: { from: string | null; to: string | null }
  totals: ReportCounts & { sessions: number }
  sessions: (ReportCounts & { id: string; title: string; startsAt: string; date: string; status: 'open' | 'closed' })[]
  members: (ReportCounts & { telegramId: string; name: string; phone: string; username: string; active: boolean })[]
}

interface DownloadWebApp {
  downloadFile?: (params: { url: string; file_name: string }, callback?: (accepted: boolean) => void) => void
  isVersionAtLeast?: (version: string) => boolean
}

interface AttendanceReportProps {
  tx: (text: string) => string
  language: Language
  headers: () => Record<string, string>
  notify: (message: string) => void
}

const am: Record<string, string> = {
  'This month': 'ይህ ወር', 'Last 30 days': 'ያለፉት 30 ቀናት', 'This year': 'ይህ ዓመት', 'All time': 'ሁሉም ጊዜ',
  'From': 'ከ', 'To': 'እስከ', 'Export Excel': 'ወደ Excel ላክ', 'Preparing…': 'በማዘጋጀት ላይ…',
  'Sessions': 'ፕሮግራሞች', 'Attendance rate': 'የመገኘት መጠን', 'Present': 'ተገኝቷል', 'Absent': 'ቀርቷል', 'Excused': 'በፈቃድ',
  'By member': 'በአባል', 'By session': 'በፕሮግራም', 'Member': 'አባል', 'Session': 'ፕሮግራም', 'Date': 'ቀን', 'Rate': 'መጠን',
  'Removed': 'የተወገደ', 'Open': 'ክፍት',
  'No sessions in this period.': 'በዚህ ጊዜ ውስጥ ምንም ፕሮግራም የለም።',
  'Loading…': 'በመጫን ላይ…',
  'Rate = present ÷ (present + absent). Excused sessions are not counted.': 'መጠን = ተገኝቷል ÷ (ተገኝቷል + ቀርቷል)። በፈቃድ የቀሩት አይቆጠሩም።',
  'Download started.': 'ማውረድ ተጀምሯል።',
  'Please choose a valid date range.': 'እባክዎ ትክክለኛ የቀን ክልል ይምረጡ።',
  'This download link has expired. Export again.': 'የማውረጃ ሊንኩ ጊዜው አልፏል። እንደገና ይላኩ።',
}

function ethiopiaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Addis_Ababa' }).format(new Date())
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function presetRange(preset: Exclude<Preset, 'custom'>) {
  const today = ethiopiaToday()
  switch (preset) {
    case 'month': return { from: `${today.slice(0, 8)}01`, to: today }
    case 'last30': return { from: addDays(today, -29), to: today }
    case 'year': return { from: `${today.slice(0, 4)}-01-01`, to: today }
    case 'all': return { from: '', to: '' }
  }
}

function RateBar({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="rpt-rate muted">—</span>
  return (
    <span className={rate < 50 ? 'rpt-rate low' : 'rpt-rate'}>
      <span className="rpt-bar"><span style={{ width: `${rate}%` }} /></span>
      {rate}%
    </span>
  )
}

export default function AttendanceReport({ tx: parentTx, language, headers, notify }: AttendanceReportProps) {
  const tx = useCallback((text: string) => (language === 'am' ? am[text] ?? parentTx(text) : text), [language, parentTx])
  const [preset, setPreset] = useState<Preset>('month')
  const [range, setRange] = useState(() => presetRange('month'))
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const formatDate = (date: string) => new Intl.DateTimeFormat(language === 'am' ? 'am-ET' : 'en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))

  const load = useCallback(async () => {
    if (range.from && range.to && range.from > range.to) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ view: 'report', from: range.from, to: range.to })
      const response = await fetch(`/api/attendance?${params}`, { headers: headers(), cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'The attendance service is temporarily unavailable.')
      setReport(result as Report)
    } catch (error) {
      notify(tx(error instanceof Error ? error.message : 'The attendance service is temporarily unavailable.'))
    } finally {
      setLoading(false)
    }
  }, [range, headers, notify, tx])

  useEffect(() => { void load() }, [load])

  function choosePreset(next: Exclude<Preset, 'custom'>) {
    setPreset(next)
    setRange(presetRange(next))
  }

  function changeDate(field: 'from' | 'to', value: string) {
    setPreset('custom')
    setRange((current) => ({ ...current, [field]: value }))
  }

  async function exportExcel() {
    setExporting(true)
    try {
      const response = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ action: 'export-link', from: range.from, to: range.to, lang: language }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'The attendance service is temporarily unavailable.')
      const { url, fileName } = result as { url: string; fileName: string }

      // Inside Telegram, files must go through Telegram's own downloader; in a browser a normal link works.
      const webApp = window.Telegram?.WebApp as unknown as DownloadWebApp | undefined
      if (webApp?.downloadFile && webApp.isVersionAtLeast?.('8.0')) {
        webApp.downloadFile({ url, file_name: fileName })
      } else {
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
      notify(tx('Download started.'))
    } catch (error) {
      notify(tx(error instanceof Error ? error.message : 'The attendance service is temporarily unavailable.'))
    } finally {
      setExporting(false)
    }
  }

  const presets: [Exclude<Preset, 'custom'>, string][] = [['month', 'This month'], ['last30', 'Last 30 days'], ['year', 'This year'], ['all', 'All time']]
  const invalidRange = Boolean(range.from && range.to && range.from > range.to)

  return (
    <div className="rpt">
      <section className="form-panel rpt-filters">
        <div className="rpt-presets">
          {presets.map(([id, label]) => (
            <button key={id} type="button" className={preset === id ? 'template-chip active' : 'template-chip'} onClick={() => choosePreset(id)}>{tx(label)}</button>
          ))}
        </div>
        <div className="rpt-range">
          <label className="field"><span>{tx('From')}</span><input type="date" value={range.from} max={range.to || undefined} onChange={(e) => changeDate('from', e.target.value)} /></label>
          <label className="field"><span>{tx('To')}</span><input type="date" value={range.to} min={range.from || undefined} onChange={(e) => changeDate('to', e.target.value)} /></label>
          <button type="button" className="submit-button rpt-export" disabled={exporting || invalidRange || !report || report.totals.sessions === 0} onClick={exportExcel}>
            <Download size={15} /> {tx(exporting ? 'Preparing…' : 'Export Excel')}
          </button>
        </div>
        {invalidRange && <p className="login-error">{tx('Please choose a valid date range.')}</p>}
      </section>

      {loading && !report && <p className="empty-copy">{tx('Loading…')}</p>}

      {report && (
        <>
          <section className="rpt-stats" aria-busy={loading}>
            <div><span>{tx('Sessions')}</span><strong>{report.totals.sessions}</strong></div>
            <div className="rpt-stat-main"><span>{tx('Attendance rate')}</span><strong>{report.totals.rate === null ? '—' : `${report.totals.rate}%`}</strong></div>
            <div><span>{tx('Present')}</span><strong className="rpt-present">{report.totals.present}</strong></div>
            <div><span>{tx('Absent')}</span><strong className="rpt-absent">{report.totals.absent}</strong></div>
            <div><span>{tx('Excused')}</span><strong className="rpt-excused">{report.totals.excused}</strong></div>
          </section>

          {report.totals.sessions === 0 ? (
            <p className="empty-copy">{tx('No sessions in this period.')}</p>
          ) : (
            <div className="rpt-grid">
              <section className="form-panel att-panel">
                <div className="panel-heading"><h2>{tx('By member')}</h2><span className="panel-index">{report.members.length}</span></div>
                <div className="rpt-table-wrap">
                  <table className="rpt-table">
                    <thead><tr><th>{tx('Member')}</th><th title={tx('Present')}>✓</th><th title={tx('Absent')}>✕</th><th title={tx('Excused')}>–</th><th>{tx('Rate')}</th></tr></thead>
                    <tbody>
                      {[...report.members].sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101) || a.name.localeCompare(b.name)).map((m) => (
                        <tr key={m.telegramId}>
                          <td><strong>{m.name}</strong>{!m.active && <small> · {tx('Removed')}</small>}</td>
                          <td>{m.present}</td><td>{m.absent}</td><td>{m.excused}</td>
                          <td><RateBar rate={m.rate} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="form-panel att-panel">
                <div className="panel-heading"><h2>{tx('By session')}</h2><span className="panel-index">{report.sessions.length}</span></div>
                <div className="rpt-table-wrap">
                  <table className="rpt-table">
                    <thead><tr><th>{tx('Session')}</th><th title={tx('Present')}>✓</th><th title={tx('Absent')}>✕</th><th title={tx('Excused')}>–</th><th>{tx('Rate')}</th></tr></thead>
                    <tbody>
                      {[...report.sessions].reverse().map((s) => (
                        <tr key={s.id}>
                          <td><strong>{s.title}</strong><small>{formatDate(s.date)}{s.status === 'open' ? ` · ${tx('Open')}` : ''}</small></td>
                          <td>{s.present}</td><td>{s.absent}</td><td>{s.excused}</td>
                          <td><RateBar rate={s.rate} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
          <p className="inbox-footnote">{tx('Rate = present ÷ (present + absent). Excused sessions are not counted.')}</p>
        </>
      )}
    </div>
  )
}
