import { useState } from 'react'

export default function PinSetup({ onSubmit, setError }) {
  const [length, setLength] = useState(4)
  const [pin, setPin] = useState('')
  const submit = async (event) => { event.preventDefault(); setError(''); try { await onSubmit(pin) } catch (error) { setError(error.message) } }
  return <section className="auth-panel pin-panel"><div className="pin-mark">01</div><div className="eyebrow">ONE LAST STEP</div><h1>Protect your ledger.</h1><p className="muted">Set a PIN for the extra layer of privacy you deserve.</p><div className="segmented"><button className={length === 4 ? 'selected' : ''} onClick={() => { setLength(4); setPin('') }}>4 digits</button><button className={length === 6 ? 'selected' : ''} onClick={() => { setLength(6); setPin('') }}>6 digits</button></div><form onSubmit={submit}><label>Choose your PIN<input className="pin-input" inputMode="numeric" pattern={`[0-9]{${length}}`} maxLength={length} required value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder={'•'.repeat(length)} /></label><button className="primary-button" type="submit">Save PIN <span>→</span></button></form></section>
}
