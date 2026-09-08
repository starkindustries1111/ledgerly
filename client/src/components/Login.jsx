import { useState } from 'react'

export default function Login({ onEmail, onSwitch, setError }) {
  const [email, setEmail] = useState('')
  const submit = async (event) => { event.preventDefault(); setError(''); try { await onEmail(email) } catch (error) { setError(error.message) } }
  return <section className="auth-panel"><div className="eyebrow">WELCOME BACK</div><h1>Pick up where you left off.</h1><p className="muted">Enter your registered email to continue.</p><form onSubmit={submit}><label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><button className="primary-button" type="submit">Continue <span>→</span></button></form><div className="auth-footer">New here? <button type="button" className="text-button" onClick={onSwitch}>Create an account</button></div></section>
}
