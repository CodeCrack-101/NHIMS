/**
 * Helper to build correct absolute SSE URL connecting to backend with session token fallback
 */
export const getStreamUrl = (path = '/inventory/stream') => {
  const base = import.meta.env.VITE_API_BASE_URL || '/api'
  const cleanBase = base.replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`

  let fullUrl = ''
  // If base already contains /api, e.g. https://nhims-2.onrender.com/api
  if (cleanBase.endsWith('/api') && cleanPath.startsWith('/api')) {
    fullUrl = `${cleanBase.slice(0, -4)}${cleanPath}`
  } else if (!cleanBase.endsWith('/api') && !cleanPath.startsWith('/api')) {
    fullUrl = `${cleanBase}/api${cleanPath}`
  } else {
    fullUrl = `${cleanBase}${cleanPath}`
  }

  // EventSource cannot send custom headers (like Authorization), so attach sessionToken in query param
  const token = localStorage.getItem('__crm_sid_token')
  if (token) {
    const separator = fullUrl.includes('?') ? '&' : '?'
    fullUrl = `${fullUrl}${separator}token=${encodeURIComponent(token)}`
  }

  return fullUrl
}
