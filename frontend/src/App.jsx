import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import { DownloadProgressProvider } from './context/DownloadProgressContext.jsx'
import { ProtectedRoute } from './components/ProtectedRoute.jsx'
import { Login } from './pages/Login.jsx'
import { VerifyOTP } from './pages/VerifyOTP.jsx'
import { ForgotPassword } from './pages/ForgotPassword.jsx'
import { ResetPassword } from './pages/ResetPassword.jsx'
import { Dashboard } from './pages/Dashboard.jsx'

function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <DownloadProgressProvider>
          <AuthProvider>
            <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/verify-otp" element={<VerifyOTP />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/roll-details"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/roll-details/:slug"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/add-products"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/add-products/:slug"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/billing"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/invoice-history"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers/:mobileNumber"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/search-roll"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
          </AuthProvider>
        </DownloadProgressProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}

export default App
