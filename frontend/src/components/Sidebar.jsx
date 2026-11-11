import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import '../styles/Sidebar.css'

export function Sidebar(){
  const { user, logout } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  const handleLogout = async () => {
    if (signingOut) return
    setSigningOut(true)
    await logout()
    showToast({
      type: 'info',
      title: 'Logged Out',
      message: 'You have been signed out safely.',
    })
    navigate('/login', { replace: true })
  }

  return (
    <aside className="crm-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo-icon">
          <img src="/Logo.png" className='dimage' alt="" />
        </div>
        <span className="sidebar-brand-title">NH Wallpaper</span>
      </div>

      <nav className="sidebar-nav">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `sidebar-nav-item ${isActive ? 'active' : ''}`
          }
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
          </svg>
          <span>Dashboard</span>
        </NavLink>

        <NavLink
          to="/roll-details"
          className={({ isActive }) =>
            `sidebar-nav-item ${isActive ? 'active' : ''}`
          }
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span>Roll Details</span>
        </NavLink>

        <NavLink
          to="/add-products"
          className={({ isActive }) =>
            `sidebar-nav-item ${isActive ? 'active' : ''}`
          }
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
          <span>Add Products</span>
        </NavLink>

        <NavLink
          to="/billing"
          className={({ isActive }) =>
            `sidebar-nav-item ${isActive ? 'active' : ''}`
          }
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span>Billing</span>
        </NavLink>

        <NavLink
          to="/invoice-history"
          className={({ isActive }) =>
            `sidebar-nav-item ${isActive ? 'active' : ''}`
          }
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>Invoice History</span>
        </NavLink>

        <NavLink
          to="/reports"
          className={({ isActive }) =>
            `sidebar-nav-item ${isActive ? 'active' : ''}`
          }
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 20V10" />
            <path d="M12 20V4" />
            <path d="M6 20v-6" />
          </svg>
          <span>Reports</span>
        </NavLink>

        <NavLink
          to="/customers"
          className={({ isActive }) =>
            `sidebar-nav-item ${isActive ? 'active' : ''}`
          }
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>Users</span>
        </NavLink>

        <NavLink
          to="/search-roll"
          className={({ isActive }) =>
            `sidebar-nav-item ${isActive ? 'active' : ''}`
          }
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Search Roll</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          onClick={handleLogout}
          disabled={signingOut}
          className="sidebar-logout-btn"
        >
          <span>{signingOut ? 'Logging out...' : 'Logout'}</span>
        </button>
      </div>
    </aside>
  )
}
