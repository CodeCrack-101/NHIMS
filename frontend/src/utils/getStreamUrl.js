/**
 * Helper to build correct absolute SSE URL connecting to backend
 */
export const getStreamUrl = (path = '/inventory/stream') => {
  const base = import.meta.env.VITE_API_BASE_URL || '/api'
  const cleanBase = base.replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`

  // If base already contains /api, e.g. https://nhims-2.onrender.com/api
  if (cleanBase.endsWith('/api') && cleanPath.startsWith('/api')) {
    return `${cleanBase.slice(0, -4)}${cleanPath}`
  }
  if (!cleanBase.endsWith('/api') && !cleanPath.startsWith('/api')) {
    return `${cleanBase}/api${cleanPath}`
  }
  return `${cleanBase}${cleanPath}`
}
