import { useState } from 'react'

export default function LoginPin({ email, onSubmit, onBack, setError }) {
  const [pin, setPin] = useState('')
  const submit = async (event) => { event.preventDefault(); setError(''); try { await onSubmit(pin) } catch (error) { setError(error.message); setPin('') } }
  return <section className="auth-panel pin-panel"><div className="pin-mark">02</div><div className="eyebrow">PRIVATE ENTRY</div><h1>Enter your PIN.</h1><p className="muted">Unlock the ledger for <strong>{email}</strong>.</p><form onSubmit={submit}><label>4 or 6 digit PIN<input className="pin-input" type="password" inputMode="numeric" pattern="[0-9]{4,6}" maxLength="6" required value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} placeholder="4 or 6 digits" /></label><button className="primary-button" type="submit">Unlock ledger <span>→</span></button></form><button type="button" className="text-button pin-back" onClick={onBack}>Use a different email</button></section>
}
