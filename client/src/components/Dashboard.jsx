import { useEffect, useState } from 'react'
import { request } from '../api'
import AddEntry from './AddEntry'

const money = (value) => `AED ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dubaiMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit' }).format(new Date())

export default function Dashboard({ email, name, onLogout, onDeleteAccount, onFeedback }) {
  const [summary, setSummary] = useState(null)
  const [month, setMonth] = useState(dubaiMonth())
  const [calendar, setCalendar] = useState({ days: {} })
  const [error, setError] = useState('')
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false)
  const load = async () => { try { const [summaryData, calendarData] = await Promise.all([request('/summary'), request(`/calendar?month=${month}`)]); setSummary(summaryData); setCalendar(calendarData); setError('') } catch (err) { setError(err.message) } }
  useEffect(() => { load() }, [month])
  return <main className="dashboard"><header className="topbar"><div className="topbar-left"><div className="brand">ledger<span>ly</span></div><button type="button" className="delete-account-button" onClick={() => setDeleteAccountOpen(true)}>Delete account</button></div><div className="user-menu"><span>{email}</span><button className="ghost-button" onClick={onLogout}>Log out</button></div></header><div className="dashboard-intro"><div><div className="eyebrow">YOUR MONEY, IN FOCUS</div><h1>Hello, {name || email.split('@')[0]}.</h1><p className="muted">A small check-in today makes the bigger picture clearer.</p></div></div><section className="summary-grid"><SummaryGroup label="Income" today={summary?.todayIncome} month={summary?.monthIncome} accent="blue" /><SummaryGroup label="Spent" today={summary?.today} month={summary?.month} accent="orange" /><SummaryGroup label="Saved" today={summary?.todaySavings} month={summary?.monthSavings} accent="lime" /></section>{error && <div className="error-banner" role="alert">{error}</div>}<AddEntry onSaved={() => { load(); onFeedback('Entry added successfully.') }} onFailed={(message) => onFeedback(message, 'error')} /><MonthCalendar month={month} setMonth={setMonth} days={calendar.days} onDeleted={() => { load(); onFeedback('Calendar entry deleted.') }} onFailed={(message) => onFeedback(message, 'error')} />{deleteAccountOpen && <AccountDeleteModal onCancel={() => setDeleteAccountOpen(false)} onDeleted={onDeleteAccount} />}</main>
}

function DubaiGreeting() { const [greeting, setGreeting] = useState('Good morning'); useEffect(() => { const update = () => { const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dubai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()); const hour = Number(parts.find((part) => part.type === 'hour').value); const minute = Number(parts.find((part) => part.type === 'minute').value); setGreeting(hour < 12 ? 'Good morning' : hour < 18 || (hour === 18 && minute < 30) ? 'Good afternoon' : 'Good evening') }; update(); const timer = setInterval(update, 30000); return () => clearInterval(timer) }, []); return greeting }
function SummaryGroup({ label, today, month, accent }) { return <article className={`summary-card summary-group ${accent}`}><div className="card-icon">AED</div><strong className="summary-group-title">{label}</strong><div className="summary-row"><span>Today</span><strong>{money(today)}</strong></div><div className="summary-row"><span>This month</span><strong>{money(month)}</strong></div></article> }

function AccountDeleteModal({ onCancel, onDeleted }) {
  const [step, setStep] = useState('confirm')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const confirmDelete = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await request('/auth/account', { method: 'DELETE', body: JSON.stringify({ pin }) })
      onDeleted()
    } catch (requestError) {
      setError(requestError.message)
      setPin('')
    } finally {
      setSubmitting(false)
    }
  }
  return <div className="delete-modal-backdrop" role="presentation" onClick={onCancel}><div className="delete-modal account-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-account-title" onClick={(event) => event.stopPropagation()}><button type="button" className="delete-modal-close" onClick={onCancel} aria-label="Close">×</button>{step === 'confirm' ? <><div className="eyebrow">PERMANENT ACTION</div><h3 id="delete-account-title">Delete your account?</h3><p>This permanently removes your profile and every ledger entry. This cannot be undone.</p><div className="account-delete-actions"><button type="button" className="ghost-button" onClick={onCancel}>Cancel</button><button type="button" className="delete-choice danger" onClick={() => setStep('pin')}>Continue to delete <span>→</span></button></div></> : <><div className="eyebrow">CONFIRM WITH PIN</div><h3 id="delete-account-title">Enter your PIN.</h3><p>Enter your account PIN to permanently delete your ledger.</p><form onSubmit={confirmDelete}><label>4 or 6 digit PIN<input className="pin-input" type="password" inputMode="numeric" pattern="[0-9]{4}|[0-9]{6}" maxLength="6" required autoFocus value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} /></label>{error && <p className="form-message">{error}</p>}<div className="account-delete-actions"><button type="button" className="ghost-button" onClick={() => { setStep('confirm'); setError(''); setPin('') }}>Back</button><button type="submit" className="delete-choice danger" disabled={submitting}>{submitting ? 'Deleting...' : 'Delete permanently'}</button></div></form></>}</div></div>
}

function MonthCalendar({ month, setMonth, days, onDeleted, onFailed }) {
  const [year, monthNumber] = month.split('-').map(Number)
  const [openEntry, setOpenEntry] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)
  const firstDay = new Date(year, monthNumber - 1, 1).getDay()
  const daysInMonth = new Date(year, monthNumber, 0).getDate()
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, index) => index < firstDay ? null : index - firstDay + 1)
  const shiftMonth = (amount) => { const next = new Date(year, monthNumber - 1 + amount, 1); setMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`) }
  const removeEntry = async (entryId, kind) => { try { await request(`/transactions/${entryId}?kind=${kind}`, { method: 'DELETE' }); setOpenEntry(null); onDeleted() } catch (err) { onFailed(err.message) } }
  const selectedEntry = Object.values(days).flatMap((day) => day.entries).find((entry) => entry.id === openEntry)
  const selectedDayData = selectedDay ? days[selectedDay] : null
  return <section className="calendar-section"><div className="section-heading"><div><div className="eyebrow">MONTHLY VIEW</div><h2>Every day, accounted for.</h2></div><div className="calendar-controls"><button className="ghost-button" onClick={() => shiftMonth(-1)} aria-label="Previous month">←</button><strong>{new Date(year, monthNumber - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</strong><button className="ghost-button" onClick={() => shiftMonth(1)} aria-label="Next month">→</button></div></div><div className="calendar-weekdays">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{cells.map((day, index) => { const key = day ? `${month}-${String(day).padStart(2, '0')}` : `empty-${index}`; const data = day ? days[key] : null; return <div className={`calendar-day ${day ? selectedDay === key ? 'selected' : '' : 'empty'}`} key={key} onClick={() => day && setSelectedDay(selectedDay === key ? null : key)}>{day && <><strong>{day}</strong>{data && <div className="calendar-totals">{data.savings > 0 && <span className="saved">+{money(data.savings)} saved</span>}{data.entries.map((entry) => <div className="calendar-entry" key={entry.id}><div>{entry.income > 0 && <span className="income">+{money(entry.income)}</span>}{entry.expenses > 0 && <span className="expense">-{money(entry.expenses)}</span>}{entry.savings > 0 && <span className="saved">+{money(entry.savings)} saved</span>}{entry.note && <small>{entry.note}</small>}</div><button type="button" className="delete-entry-button" onClick={(event) => { event.stopPropagation(); setOpenEntry(entry.id) }}>Delete</button></div>)}</div>}</>}</div> })}</div>{selectedDayData && <div className="delete-modal-backdrop" role="presentation" onClick={() => setSelectedDay(null)}><div className="day-details-modal" role="dialog" aria-modal="true" aria-labelledby="day-details-title" onClick={(event) => event.stopPropagation()}><button type="button" className="delete-modal-close" onClick={() => setSelectedDay(null)} aria-label="Close date details">×</button><div className="eyebrow">DAY DETAILS</div><h3 id="day-details-title">{selectedDay}</h3><div className="day-detail-summary"><span className="income">Income {money(selectedDayData.income)}</span><span className="expense">Spent {money(selectedDayData.expenses)}</span><span className="saved">Saved {money(selectedDayData.savings)}</span></div>{selectedDayData.entries.map((entry) => <div className="day-detail-entry" key={entry.id}>{entry.income > 0 && <strong className="income">Income: {money(entry.income)}</strong>}{entry.expenses > 0 && <strong className="expense">Expense: {money(entry.expenses)}</strong>}{entry.savings > 0 && <strong className="saved">Saved: {money(entry.savings)}</strong>}<span>{entry.note || 'No spending note'}</span><button type="button" className="delete-entry-button" onClick={() => setOpenEntry(entry.id)}>Delete</button></div>)}</div></div>}{selectedEntry && <div className="delete-modal-backdrop" role="presentation" onClick={() => setOpenEntry(null)}><div className="delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-entry-title" onClick={(event) => event.stopPropagation()}><button type="button" className="delete-modal-close" onClick={() => setOpenEntry(null)} aria-label="Close delete dialog">×</button><div className="eyebrow">REMOVE ENTRY</div><h3 id="delete-entry-title">What would you like to delete?</h3><p>Choose one part of this calendar entry or remove both.</p>{selectedEntry.income > 0 && <button type="button" className="delete-choice" onClick={() => removeEntry(selectedEntry.id, 'income')}>Delete income <span>{money(selectedEntry.income)}</span></button>}{selectedEntry.expenses > 0 && <button type="button" className="delete-choice" onClick={() => removeEntry(selectedEntry.id, 'expenses')}>Delete expense <span>{money(selectedEntry.expenses)}</span></button>}<button type="button" className="delete-choice danger" onClick={() => removeEntry(selectedEntry.id, 'all')}>Delete both</button></div></div>}</section>
}
