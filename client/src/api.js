const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

const csrfCookie = () => document.cookie.split('; ').find((cookie) => cookie.startsWith('ledgerly_csrf='))?.split('=').slice(1).join('=')

export async function request(path, options = {}) {
  const method = options.method || 'GET'
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && path !== '/csrf') await request('/csrf')
  const csrfToken = csrfCookie()
  let response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...options.headers }
    })
  } catch {
    throw new Error('Unable to reach the API. Check the deployment API URL and server status.')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Something went wrong.')
  return data
}
