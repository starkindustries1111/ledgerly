import { useState } from 'react'
import { request } from '../api'

export default function AddEntry({ onSaved, onFailed }) {
  const [form, setForm] = useState({ date: localDate(), income: '', expenses: '', savings: '', note: '' })
  const [message, setMessage] = useState('')
  const income = Number(form.income) || 0
  const expenses = Number(form.expenses) || 0
  const savings = Number(form.savings) || 0
  const netIncome = income - savings
  const difference = netIncome - expenses
  const percentage = netIncome > 0 ? Math.abs(difference) / netIncome * 100 : 0
  const resultType = difference > 0 ? 'profit' : difference < 0 ? 'loss' : 'even'
  const submit = async (event) => { event.preventDefault(); setMessage(''); try { await request('/transactions', { method: 'POST', body: JSON.stringify({ date: form.date, income, expenses, savings, note: form.note }) }); setForm({ date: localDate(), income: '', expenses: '', savings: '', note: '' }); setMessage('Entry saved'); onSaved() } catch (error) { setMessage(error.message); onFailed(error.message) } }
  return <section className="entry-section"><div className="section-heading"><div><div className="eyebrow">LEDGER ENTRY</div><h2>Record your money.</h2></div></div><form className="entry-form" onSubmit={submit}><label className="date-field">Entry date<input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label><label>Income<div className="money-input"><span>AED</span><input type="number" min="0" step="0.01" required value={form.income} onChange={(e) => setForm({ ...form, income: e.target.value })} placeholder="0.00" /></div></label><label>Expenses<div className="money-input"><span>AED</span><input type="number" min="0" step="0.01" required value={form.expenses} onChange={(e) => setForm({ ...form, expenses: e.target.value })} placeholder="0.00" /></div></label><label>Savings<div className="money-input"><span>AED</span><input type="number" min="0" max={income || undefined} step="0.01" required value={form.savings} onChange={(e) => setForm({ ...form, savings: e.target.value })} placeholder="0.00" /></div></label><label className="note-field">What did you spend it on?<input type="text" maxLength="120" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Coffee, groceries, transport..." /></label><button className="primary-button entry-button" type="submit">Add to ledger <span>＋</span></button></form>{message && <p className="form-message">{message}</p>}<div className={`result-card ${resultType}`}><div><span className="result-label">SELECTED DAY'S RESULT</span><strong>{resultType === 'profit' ? `Profit: AED ${difference.toFixed(2)}` : resultType === 'loss' ? `Loss: AED ${Math.abs(difference).toFixed(2)}` : 'Break even'}</strong></div><span className="result-percent">{resultType === 'even' ? 'no profit or loss' : `${percentage.toFixed(1)}%`}</span></div></section>
}

function localDate() {
  const date = new Date()
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10)
}
