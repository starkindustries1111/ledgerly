import crypto from 'node:crypto'

export function normalizeAdminEmails(value = '') {
  return [...new Set((String(value || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)))]
}

export function parsePwnedResponse(body, hash) {
  const target = String(hash || '').toUpperCase()
  const lines = String(body || '').split(/\r?\n/).filter(Boolean)
  for (const line of lines) {
    const [suffix, countText] = line.split(':')
    if (!suffix || !countText) continue
    if (suffix.trim().toUpperCase() === target) {
      return Number(countText) > 0
    }
  }
  return false
}

export async function isLeakedPassword(password, fetcher = fetch) {
  const value = String(password || '')
  if (!value) return false
  const hash = crypto.createHash('sha1').update(value).digest('hex').toUpperCase()
  const prefix = hash.slice(0, 5)
  const suffix = hash.slice(5)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetcher(`https://api.pwnedpasswords.com/range/${prefix}`, { signal: controller.signal })
    if (response?.ok === false) throw new Error('Breach check unavailable.')
    if (!response || typeof response.text !== 'function') return false
    const body = await response.text()
    return parsePwnedResponse(body, suffix)
  } finally {
    clearTimeout(timeout)
  }
}
