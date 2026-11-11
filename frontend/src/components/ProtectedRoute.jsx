import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { LottieIcon } from './LottieIcon.jsx'

export function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, loading, isAuthenticated } = useAuth()

  if (loading) {
    return (
      <div className="page-loading-container" role="status" aria-live="polite">
        <LottieIcon src="/loading.lottie" size={150} />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return (
      <div className="auth-layout">
        <div className="auth-card">
          <h2 className="auth-title">Access Restricted</h2>
          <p className="auth-description">
            Your account role (<strong>{user.role.toUpperCase()}</strong>) does not have permission to view this module.
          </p>
        </div>
      </div>
    )
  }

  return children
}
