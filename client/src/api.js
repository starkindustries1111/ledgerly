const API_URL = import.meta.env.VITE_API_URL || '/api'

const csrfCookie = () => document.cookie.split('; ').find((cookie) => cookie.startsWith('ledgerly_csrf='))?.split('=').slice(1).join('=')

export async function request(path, options = {}) {
  const method = options.method || 'GET'
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && path !== '/csrf') await request('/csrf')
  const csrfToken = csrfCookie()
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...options.headers }
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong.')
  return data
}
