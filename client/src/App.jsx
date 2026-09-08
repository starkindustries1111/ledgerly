import { useEffect, useState } from 'react'
import { request } from './api'
import Signup from './components/Signup'
import Login from './components/Login'
import LoginPin from './components/LoginPin'
import PinSetup from './components/PinSetup'
import PinVerify from './components/PinVerify'
import Dashboard from './components/Dashboard'

const CONSENT_POLICY_VERSION = '2026-09-07-v1'
const defaultConsent = { policyVersion: CONSENT_POLICY_VERSION, necessary: true, analytics: false, marketing: false, preferences: false, consentedAt: '' }
const readConsent = () => { try { return JSON.parse(localStorage.getItem('ledgerly-consent') || 'null') } catch { return null } }

export default function App() {
  const path = window.location.pathname
  const [screen, setScreen] = useState('login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [consent, setConsent] = useState(readConsent())
  const announce = (message, type = 'success') => { setFeedback({ message, type }); window.setTimeout(() => setFeedback(null), 2600) }
  const setAuthError = (message) => setError(message)

  useEffect(() => {
    let isMounted = true
    const restoreSession = async () => {
      try {
        const data = await request('/me')
        if (!isMounted) return
        setEmail(data.email)
        setName(data.name || data.email.split('@')[0])
        setScreen(data.needsPin ? 'pin-setup' : data.requiresPin ? 'pin-verify' : 'dashboard')
      } catch {
        if (isMounted) setScreen('login')
      }
    }
    restoreSession()
    return () => { isMounted = false }
  }, [])

  const saveSession = (data) => { setEmail(data.email); setName(data.name || data.email.split('@')[0]); setScreen(data.needsPin ? 'pin-setup' : data.requiresPin ? 'pin-verify' : 'dashboard'); announce('Signed in successfully.') }
  const signup = async (form) => { const data = await request('/auth/signup', { method: 'POST', body: JSON.stringify(form) }); saveSession(data); return data }
  const beginLogin = async (loginEmail) => { const data = await request('/auth/login-email', { method: 'POST', body: JSON.stringify({ email: loginEmail }) }); setEmail(data.email); setScreen('login-pin') }
  const loginWithPin = async (pin) => saveSession(await request('/auth/login-pin', { method: 'POST', body: JSON.stringify({ email, pin }) }))
  const setPin = async (pin) => { await request('/auth/set-pin', { method: 'POST', body: JSON.stringify({ pin }) }); setScreen('dashboard') }
  const verifyPin = async (pin) => { await request('/auth/verify-pin', { method: 'POST', body: JSON.stringify({ pin }) }); setScreen('dashboard') }
  const logout = async () => { try { await request('/auth/logout', { method: 'POST' }); announce('Signed out successfully.') } catch (logoutError) { announce(logoutError.message, 'error') } finally { setEmail(''); setName(''); setError(''); setScreen('login') } }
  const deleteAccount = async () => { setEmail(''); setName(''); setError(''); setScreen('login'); announce('Account deleted successfully.') }
  const saveConsent = async (nextConsent) => { const record = { ...defaultConsent, ...nextConsent, necessary: true, policyVersion: CONSENT_POLICY_VERSION, consentedAt: new Date().toISOString() }; localStorage.setItem('ledgerly-consent', JSON.stringify(record)); setConsent(record); try { await request('/consent', { method: 'POST', body: JSON.stringify(record) }) } catch { announce('Consent saved on this device.', 'error') } }
  const consentUi = <CookieConsent consent={consent} needsConsent={!consent || consent.policyVersion !== CONSENT_POLICY_VERSION} onSave={saveConsent} />
  if (path === '/privacy' || path === '/terms') return <><LegalPage type={path.slice(1)} />{consentUi}<FeedbackToast feedback={feedback} /></>
  if (path !== '/') return <><NotFound />{consentUi}<FeedbackToast feedback={feedback} /></>
  if (screen === 'dashboard') return <><Dashboard email={email} name={name} onLogout={logout} onDeleteAccount={deleteAccount} onFeedback={announce} />{consentUi}<FeedbackToast feedback={feedback} /></>
  return <><a className="skip-link" href="#main-content">Skip to main content</a><div className="auth-shell"><aside className="auth-aside"><div className="brand">ledger<span>ly</span></div><div className="aside-copy"><div className="eyebrow">A CLEARER DAILY RITUAL</div><h2>Know what your money is doing.</h2><p>Track the small stuff. Feel the difference.</p></div><div className="aside-footer">Private by design · Built for everyday clarity</div></aside><main id="main-content" className="auth-main">{error && <div className="error-banner" role="alert">{error}</div>}{screen === 'login' && <Login onEmail={beginLogin} onSwitch={() => { setError(''); setScreen('signup') }} setError={setAuthError} />}{screen === 'login-pin' && <LoginPin email={email} onSubmit={loginWithPin} onBack={() => { setError(''); setScreen('login') }} setError={setAuthError} />}{screen === 'signup' && <Signup onSuccess={signup} onSwitch={() => { setError(''); setScreen('login') }} setError={setAuthError} />}{screen === 'pin-setup' && <PinSetup onSubmit={setPin} setError={setAuthError} />}{screen === 'pin-verify' && <PinVerify onSubmit={verifyPin} setError={setAuthError} />}</main></div>{consentUi}<FeedbackToast feedback={feedback} /></>
}

function FeedbackToast({ feedback }) { return feedback ? <div className={`feedback-toast ${feedback.type}`} role="status" aria-live="polite">{feedback.type === 'success' && <span aria-hidden="true">✓</span>}{feedback.message}</div> : null }
function CookieConsent({ consent, needsConsent, onSave }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(consent || defaultConsent)
  const update = (key) => setDraft({ ...draft, [key]: !draft[key] })
  const save = (choices) => { onSave(choices); setOpen(false) }
  return <><button type="button" className="cookie-settings-link" onClick={() => { setDraft(consent || defaultConsent); setOpen(true) }}>Cookie Settings</button>{needsConsent && <aside className="cookie-banner" role="dialog" aria-labelledby="cookie-title"><div><h2 id="cookie-title">Your privacy choices</h2><p>Ledgerly uses strictly necessary cookies for sessions and security. Optional analytics, marketing, and preference storage are off unless you choose them.</p><a href="/privacy">Read our Privacy Policy</a></div><div className="cookie-actions"><button type="button" className="cookie-choice" onClick={() => save({ ...defaultConsent })}>Reject All</button><button type="button" className="cookie-choice accept" onClick={() => save({ ...defaultConsent, analytics: true, marketing: true, preferences: true })}>Accept All</button><button type="button" className="cookie-choice" onClick={() => setOpen(true)}>Customize</button></div></aside>}{open && <div className="cookie-modal-backdrop" role="presentation" onClick={() => setOpen(false)}><section className="cookie-modal" role="dialog" aria-modal="true" aria-labelledby="cookie-settings-title" onClick={(event) => event.stopPropagation()}><button type="button" className="delete-modal-close" onClick={() => setOpen(false)} aria-label="Close">×</button><h2 id="cookie-settings-title">Cookie Settings</h2><p>Choose which optional categories you allow. Strictly Necessary is always enabled because the site cannot work securely without it.</p><label className="consent-row"><span><strong>Strictly Necessary</strong><small>Sessions, CSRF protection, and consent preferences.</small></span><input type="checkbox" checked disabled /></label>{['analytics', 'marketing', 'preferences'].map((category) => <label className="consent-row" key={category}><span><strong>{category[0].toUpperCase() + category.slice(1)}</strong><small>{category === 'analytics' ? 'Anonymous usage measurement.' : category === 'marketing' ? 'Advertising and campaign measurement.' : 'Remember optional display choices.'}</small></span><input type="checkbox" checked={Boolean(draft[category])} onChange={() => update(category)} /></label>)}<div className="cookie-modal-actions"><button type="button" className="cookie-choice" onClick={() => save({ ...defaultConsent })}>Reject All</button><button type="button" className="cookie-choice accept" onClick={() => save(draft)}>Save Choices</button></div></section></div>}</>
}
function NotFound() { return <main className="status-page"><div className="eyebrow">404</div><h1>That page is not here.</h1><p className="muted">The link may be outdated or the address may be incorrect.</p><a className="primary-button" href="/">Back to Ledgerly <span>→</span></a></main> }
function LegalPage({ type }) { const privacy = type === 'privacy'; return <main className="legal-page"><a className="brand" href="/">ledger<span>ly</span></a><div className="eyebrow">LEGAL</div><h1>{privacy ? 'Privacy policy' : 'Terms of service'}</h1>{privacy ? <><p>Ledgerly collects your name, email address, authentication hashes, ledger entries, consent choices, and essential session/security cookies to provide account and budgeting features.</p><h2>Why and how long</h2><p>We use this data to authenticate you, display your ledger, prevent abuse, secure requests, and record consent. Account and ledger data remains until you delete your account. Consent records are retained as compliance evidence.</p><h2>Sharing and your rights</h2><p>Data is not sold. It may be processed by infrastructure providers needed to host the database or by an error-monitoring provider only when configured by the operator. You may request access, correction, portability, or deletion by deleting your account or contacting the service operator.</p></> : <><p>Ledgerly is a personal budgeting tool. You are responsible for the accuracy of entries and for protecting your account PIN.</p><h2>Service use</h2><p>Use the service lawfully and do not attempt to access another user’s data, disrupt the service, or bypass authentication controls.</p></>}<a className="text-button" href="/">Return home</a></main> }
