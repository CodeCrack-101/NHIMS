import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authService, fetchCsrfToken } from '../services/api.js'

const AuthContext = createContext(null)

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('__crm_user')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [loading, setLoading] = useState(true)

  const checkSession = useCallback(async () => {
    try {
      await fetchCsrfToken().catch(() => {})
      const response = await authService.getMe()
      const userData = response.data?.data?.user || null
      setUser(userData)
      if (userData) {
        localStorage.setItem('__crm_user', JSON.stringify(userData))
      } else {
        localStorage.removeItem('__crm_user')
        localStorage.removeItem('__crm_sid_token')
      }
    } catch (err) {
      // Only clear user if server explicitly replied 401 or 403 (unauthenticated)
      // Never logout employee on network drop, CORS glitch, slow connection or refresh
      const status = err.response?.status
      if (status === 401 || status === 403) {
        setUser(null)
        localStorage.removeItem('__crm_user')
        localStorage.removeItem('__crm_sid_token')
      } else {
        // Retain saved user session from localStorage
        const saved = localStorage.getItem('__crm_user')
        if (saved) {
          try {
            setUser(JSON.parse(saved))
          } catch {
            // Keep existing user state
          }
        }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkSession()
  }, [checkSession])

  const logout = async () => {
    try {
      await authService.logout()
    } finally {
      localStorage.removeItem('__crm_user')
      localStorage.removeItem('__crm_sid_token')
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loading,
        isAuthenticated: Boolean(user),
        checkSession,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
