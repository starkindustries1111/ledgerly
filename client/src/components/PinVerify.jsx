import { useState } from 'react'

export default function PinVerify({ onSubmit, setError }) {
  const [pin, setPin] = useState('')
  const submit = async (event) => { event.preventDefault(); setError(''); try { await onSubmit(pin) } catch (error) { setError(error.message); setPin('') } }
  return <section className="auth-panel pin-panel"><div className="pin-mark">02</div><div className="eyebrow">PRIVATE ENTRY</div><h1>Enter your PIN.</h1><p className="muted">A quick check before we open your ledger.</p><form onSubmit={submit}><label>4 or 6 digit PIN<input className="pin-input" inputMode="numeric" maxLength="6" required value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••••" /></label><button className="primary-button" type="submit">Unlock ledger <span>→</span></button></form></section>
}
