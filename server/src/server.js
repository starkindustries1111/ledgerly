import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import Database from 'better-sqlite3'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isLeakedPassword, normalizeAdminEmails } from './security.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATABASE_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../budgeting.db')
const db = new Database(DATABASE_PATH)
const app = express()
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173'
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const ERROR_MONITOR_URL = process.env.ERROR_MONITOR_URL
const ADMIN_EMAILS = normalizeAdminEmails(process.env.ADMIN_EMAILS)
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.')
}
if (IS_PRODUCTION) {
  let origin
  try { origin = new URL(CLIENT_ORIGIN) } catch { throw new Error('CLIENT_ORIGIN must be a valid URL.') }
  if (origin.protocol !== 'https:') throw new Error('CLIENT_ORIGIN must use HTTPS in production.')
}

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use((req, res, next) => {
  if (IS_PRODUCTION && req.headers['x-forwarded-proto'] !== 'https') return res.status(400).json({ error: 'HTTPS is required.' })
  next()
})
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }))
app.use(express.json({ limit: '10kb' }))
app.use((req, res, next) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) req.body = {}
  next()
})
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Content-Security-Policy', `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' ${CLIENT_ORIGIN}`)
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (IS_PRODUCTION) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  next()
})

db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    pin_hash TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    income REAL NOT NULL DEFAULT 0,
    expenses REAL NOT NULL DEFAULT 0,
    savings REAL NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS consent_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    policy_version TEXT NOT NULL,
    necessary INTEGER NOT NULL DEFAULT 1,
    analytics INTEGER NOT NULL DEFAULT 0,
    marketing INTEGER NOT NULL DEFAULT 0,
    preferences INTEGER NOT NULL DEFAULT 0,
    consented_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );
`)
try { db.exec("ALTER TABLE transactions ADD COLUMN note TEXT NOT NULL DEFAULT ''") } catch (error) { if (!error.message.includes('duplicate column name')) throw error }
try { db.exec("ALTER TABLE transactions ADD COLUMN savings REAL NOT NULL DEFAULT 0") } catch (error) { if (!error.message.includes('duplicate column name')) throw error }
try { db.exec("ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT ''") } catch (error) { if (!error.message.includes('duplicate column name')) throw error }

const issueToken = (userId) => jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' })
const log = (message) => process.stderr.write(`${message}\n`)
const reportError = (error) => { if (ERROR_MONITOR_URL) fetch(ERROR_MONITOR_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: error.message, service: 'ledgerly-api' }) }).catch(() => {}) }
const cookieValue = (req, name) => req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
const setSessionCookie = (res, token) => res.cookie('ledgerly_session', token, { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' })
const setCsrfCookie = (res, token = randomBytes(32).toString('hex')) => { res.cookie('ledgerly_csrf', token, { httpOnly: false, secure: IS_PRODUCTION, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000, path: '/' }); return token }
const csrfProtection = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const cookieToken = cookieValue(req, 'ledgerly_csrf')
  const headerToken = req.get('X-CSRF-Token')
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length || !timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) return res.status(403).json({ error: 'Invalid security token.' })
  next()
}
const clearSession = (res) => res.clearCookie('ledgerly_session', { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'lax', path: '/' })
const text = (value, maxLength) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength) : ''
const validEmail = (email) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
const authAttempts = new Map()
const authRateLimit = (req, res, next) => {
  const key = `${req.ip}:${req.path}`
  const now = Date.now()
  const windowMs = 15 * 60 * 1000
  const attempts = (authAttempts.get(key) || []).filter((timestamp) => now - timestamp < windowMs)
  if (attempts.length >= 5) return res.status(429).json({ error: 'Too many authentication attempts. Try again later.' })
  attempts.push(now)
  authAttempts.set(key, attempts)
  next()
}
const writeRateLimit = (req, res, next) => {
  const key = `write:${req.ip}`
  const now = Date.now()
  const attempts = (authAttempts.get(key) || []).filter((timestamp) => now - timestamp < 60 * 1000)
  if (attempts.length >= 60) return res.status(429).json({ error: 'Too many requests. Try again later.' })
  attempts.push(now)
  authAttempts.set(key, attempts)
  next()
}
const auth = (req, res, next) => {
  const token = cookieValue(req, 'ledgerly_session')
  if (!token) return res.status(401).json({ error: 'Authentication required.' })
  try {
    req.userId = jwt.verify(token, JWT_SECRET).userId
    next()
  } catch {
    res.status(401).json({ error: 'Session expired. Please log in again.' })
  }
}
const adminAuth = (req, res, next) => {
  const email = db.prepare('SELECT email FROM users WHERE id = ?').get(req.userId)?.email || ''
  if (!email || !ADMIN_EMAILS.includes(email.toLowerCase())) return res.status(403).json({ error: 'Admin access required.' })
  next()
}
const validPin = (pin) => /^\d{4}$|^\d{6}$/.test(String(pin))
const dubaiParts = (date = new Date()) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]))
const dubaiIso = (date = new Date()) => { const parts = dubaiParts(date); return `${parts.year}-${parts.month}-${parts.day}` }

app.use(csrfProtection)
app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1').get()
    res.json({ ok: true })
  } catch {
    res.status(503).json({ ok: false })
  }
})
app.get('/api/csrf', (req, res) => res.json({ csrfToken: setCsrfCookie(res) }))
app.get('/api/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, name, email, pin_hash FROM users WHERE id = ?').get(req.userId)
  if (!user) return res.status(401).json({ error: 'Authentication required.' })
  res.json({ id: user.id, name: user.name, email: user.email, needsPin: !user.pin_hash, requiresPin: Boolean(user.pin_hash) })
})
app.get('/api/admin/me', auth, adminAuth, (req, res) => {
  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(req.userId)
  res.json({ admin: true, user: { id: user.id, name: user.name, email: user.email } })
})

app.post('/api/consent', writeRateLimit, (req, res) => {
  const policyVersion = text(req.body.policyVersion, 40)
  const values = ['analytics', 'marketing', 'preferences'].map((category) => req.body[category] === true ? 1 : 0)
  if (!policyVersion) return res.status(400).json({ error: 'A valid consent policy version is required.' })
  db.prepare('INSERT INTO consent_records (policy_version, analytics, marketing, preferences) VALUES (?, ?, ?, ?)').run(policyVersion, ...values)
  res.status(201).json({ ok: true })
})

app.post('/api/auth/signup', authRateLimit, async (req, res) => {
  const name = text(req.body.name, 80)
  const email = text(req.body.email, 254).toLowerCase()
  const pin = typeof req.body.pin === 'string' ? req.body.pin : ''
  if (!name || !validEmail(email) || !validPin(pin)) return res.status(400).json({ error: 'Enter your name, a valid email, and a 4- or 6-digit PIN.' })
  try {
    if (await isLeakedPassword(pin)) return res.status(400).json({ error: 'This PIN has appeared in a known data breach. Please choose a different one.' })
    const pinHash = await bcrypt.hash(pin, 12)
    const result = db.prepare('INSERT INTO users (name, email, password_hash, pin_hash) VALUES (?, ?, ?, ?)').run(name, email, pinHash, pinHash)
    setSessionCookie(res, issueToken(result.lastInsertRowid))
    res.status(201).json({ name, email, needsPin: false })
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'An account with that email already exists.' })
    res.status(500).json({ error: 'Unable to create account.' })
  }
})

app.post('/api/auth/login', authRateLimit, async (req, res) => {
  const email = text(req.body.email, 254).toLowerCase()
  const password = typeof req.body.password === 'string' ? req.body.password : ''
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' })
  setSessionCookie(res, issueToken(user.id))
  res.json({ name: user.name, email: user.email, needsPin: !user.pin_hash, requiresPin: Boolean(user.pin_hash) })
})

app.post('/api/auth/login-email', authRateLimit, (req, res) => {
  const email = text(req.body.email, 254).toLowerCase()
  const user = db.prepare('SELECT name, email, pin_hash FROM users WHERE email = ?').get(email)
  res.json({ email: user?.email || email })
})

app.post('/api/auth/login-pin', authRateLimit, async (req, res) => {
  const email = text(req.body.email, 254).toLowerCase()
  const pin = typeof req.body.pin === 'string' ? req.body.pin : ''
  const user = db.prepare('SELECT id, name, email, pin_hash FROM users WHERE email = ?').get(email)
  if (!user?.pin_hash || !(await bcrypt.compare(pin, user.pin_hash))) return res.status(401).json({ error: 'Email or PIN is incorrect.' })
  setSessionCookie(res, issueToken(user.id))
  res.json({ name: user.name, email: user.email, needsPin: false, requiresPin: false })
})

app.post('/api/auth/logout', (req, res) => { clearSession(res); res.json({ ok: true }) })

app.post('/api/auth/set-pin', authRateLimit, auth, async (req, res) => {
  const pin = typeof req.body.pin === 'string' ? req.body.pin : ''
  if (!validPin(pin)) return res.status(400).json({ error: 'PIN must be exactly 4 or 6 digits.' })
  const user = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(req.userId)
  if (user?.pin_hash) return res.status(409).json({ error: 'A PIN is already set for this account.' })
  if (await isLeakedPassword(pin)) return res.status(400).json({ error: 'This PIN has appeared in a known data breach. Please choose a different one.' })
  const pinHash = await bcrypt.hash(pin, 12)
  db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(pinHash, req.userId)
  res.json({ ok: true })
})

app.post('/api/auth/verify-pin', authRateLimit, auth, async (req, res) => {
  const pin = typeof req.body.pin === 'string' ? req.body.pin : ''
  const user = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(req.userId)
  if (!user?.pin_hash || !(await bcrypt.compare(pin, user.pin_hash))) return res.status(401).json({ error: 'That PIN is not correct.' })
  res.json({ ok: true })
})

app.delete('/api/auth/account', authRateLimit, auth, async (req, res) => {
  const pin = typeof req.body.pin === 'string' ? req.body.pin : ''
  if (!validPin(pin)) return res.status(400).json({ error: 'Enter your 4 or 6 digit PIN.' })
  const user = db.prepare('SELECT pin_hash FROM users WHERE id = ?').get(req.userId)
  if (!user?.pin_hash || !(await bcrypt.compare(pin, user.pin_hash))) return res.status(401).json({ error: 'That PIN is not correct.' })
  db.prepare('DELETE FROM users WHERE id = ?').run(req.userId)
  clearSession(res)
  res.json({ ok: true })
})

app.post('/api/transactions', writeRateLimit, auth, (req, res) => {
  const income = Number(req.body.income)
  const expenses = Number(req.body.expenses)
  const savings = Number(req.body.savings)
  const date = String(req.body.date || dubaiIso())
  const parsedDate = new Date(`${date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return res.status(400).json({ error: 'Choose a valid entry date.' })
  if (!Number.isFinite(income) || income < 0 || income > 1e9 || !Number.isFinite(expenses) || expenses < 0 || expenses > 1e9 || !Number.isFinite(savings) || savings < 0 || savings > 1e9 || savings > income) return res.status(400).json({ error: 'Income, expenses, and savings must be non-negative numbers up to 1,000,000,000, and savings cannot exceed income.' })
  const note = text(req.body.note, 120)
  const result = db.prepare('INSERT INTO transactions (user_id, date, income, expenses, savings, note) VALUES (?, ?, ?, ?, ?, ?)').run(req.userId, date, income, expenses, savings, note)
  res.status(201).json({ id: result.lastInsertRowid, income: income - savings, expenses, savings, note, date })
})

app.delete('/api/transactions/:id', auth, (req, res) => {
  const kind = String(req.query.kind || 'all')
  if (!['income', 'expenses', 'all'].includes(kind)) return res.status(400).json({ error: 'Invalid entry type.' })
  const entry = db.prepare('SELECT income, expenses, savings FROM transactions WHERE id = ? AND user_id = ?').get(req.params.id, req.userId)
  if (!entry) return res.status(404).json({ error: 'Entry not found.' })
  if (kind === 'all') db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(req.params.id, req.userId)
  else {
    const field = kind === 'income' ? 'income' : 'expenses'
    if (kind === 'income') db.prepare('UPDATE transactions SET income = 0, savings = 0 WHERE id = ? AND user_id = ?').run(req.params.id, req.userId)
    else db.prepare(`UPDATE transactions SET ${field} = 0 WHERE id = ? AND user_id = ?`).run(req.params.id, req.userId)
    if (kind === 'income' ? entry.expenses === 0 : entry.income === 0 && entry.savings === 0) db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(req.params.id, req.userId)
  }
  res.json({ ok: true })
})

app.get('/api/summary', auth, (req, res) => {
  const today = new Date()
  const startOfWeek = new Date(today)
  const day = startOfWeek.getDay() || 7
  startOfWeek.setDate(startOfWeek.getDate() - day + 1)
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const iso = dubaiIso
  const sum = (from, expression) => db.prepare(`SELECT COALESCE(SUM(${expression}), 0) AS total FROM transactions WHERE user_id = ? AND date >= ? AND date <= ?`).get(req.userId, iso(from), iso(today)).total
  res.json({ today: sum(today, 'expenses'), todayIncome: sum(today, 'income - savings'), todaySavings: sum(today, 'savings'), week: sum(startOfWeek, 'expenses'), month: sum(startOfMonth, 'expenses'), monthIncome: sum(startOfMonth, 'income - savings'), monthSavings: sum(startOfMonth, 'savings') })
})

app.get('/api/calendar', auth, (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? String(req.query.month) : dubaiIso().slice(0, 7)
  const rows = db.prepare('SELECT id, date, income, expenses, savings, note FROM transactions WHERE user_id = ? AND date LIKE ? ORDER BY date ASC, id ASC').all(req.userId, `${month}-%`)
  const days = rows.reduce((result, row) => { if (!result[row.date]) result[row.date] = { income: 0, expenses: 0, savings: 0, entries: [] }; result[row.date].income += row.income - row.savings; result[row.date].expenses += row.expenses; result[row.date].savings += row.savings; result[row.date].entries.push({ id: row.id, income: row.income - row.savings, expenses: row.expenses, savings: row.savings, note: row.note }); return result }, {})
  res.json({ month, days })
})

if (IS_PRODUCTION) {
  const clientDist = path.join(__dirname, '../../client/dist')
  app.use(express.static(clientDist))
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')))
}

app.use((req, res) => res.status(404).json({ error: 'Not found.' }))
app.use((error, req, res, next) => {
  log(`Unhandled API error: ${error.message}`)
  reportError(error)
  res.status(500).json({ error: 'Unable to process the request.' })
})

app.listen(PORT, () => log(`Ledgerly API listening on http://localhost:${PORT}`))
