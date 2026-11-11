import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
})

let csrfTokenCache = null

export const fetchCsrfToken = async () => {
  const response = await api.get('/auth/csrf-token')
  csrfTokenCache = response.data?.csrfToken || null
  return csrfTokenCache
}

api.interceptors.request.use(
  async (config) => {
    const method = (config.method || 'get').toLowerCase()
    if (['post', 'put', 'patch', 'delete'].includes(method)) {
      if (!csrfTokenCache) {
        await fetchCsrfToken()
      }
      if (csrfTokenCache) {
        config.headers['X-CSRF-Token'] = csrfTokenCache
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (
      error.response?.status === 403 &&
      error.response?.data?.code === 'CSRF_INVALID' &&
      !originalRequest._csrfRetried
    ) {
      originalRequest._csrfRetried = true
      await fetchCsrfToken()
      if (csrfTokenCache) {
        originalRequest.headers['X-CSRF-Token'] = csrfTokenCache
      }
      return api(originalRequest)
    }
    return Promise.reject(error)
  }
)

export const authService = {
  login: (payload) => api.post('/auth/login', payload),
  verifyOtp: (payload) => api.post('/auth/verify-otp', payload),
  resendOtp: (payload) => api.post('/auth/resend-otp', payload),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me?silent=1'),
  forgotPassword: (payload) => api.post('/auth/forgot-password', payload),
  resetPassword: (payload) => api.post('/auth/reset-password', payload),
  getAuditLogs: () => api.get('/auth/audit-logs'),
}

export default api
