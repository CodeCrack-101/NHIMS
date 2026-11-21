import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { staffAccessService } from '../services/api.js'
import { TableSkeleton } from '../components/Skeleton.jsx'
import '../styles/StaffAccess.css'

export function StaffAccess() {
  const { user } = useAuth()
  const { showToast } = useToast()

  // OTP Verification Gate State
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [otpStep, setOtpStep] = useState('REQUEST') // 'REQUEST' | 'ENTER_OTP'
  const [challengeId, setChallengeId] = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')
  const [enteredOtp, setEnteredOtp] = useState('')
  const [verifyingOtp, setVerifyingOtp] = useState(false)
  const [sendingOtp, setSendingOtp] = useState(false)

  // Staff User Management State
  const [staffUsers, setStaffUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  // Add User Modal State
  const [showAddModal, setShowAddModal] = useState(false)
  const [newFullName, setNewFullName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [addingUser, setAddingUser] = useState(false)

  // Change Password Modal State
  const [userToEdit, setUserToEdit] = useState(null)
  const [editPassword, setEditPassword] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Delete User Modal State
  const [userToDelete, setUserToDelete] = useState(null)
  const [deletingUser, setDeletingUser] = useState(false)

  // Request OTP handler
  const handleRequestOtp = async () => {
    try {
      setSendingOtp(true)
      const res = await staffAccessService.requestOtp()
      const data = res.data?.data
      setChallengeId(data?.challengeId || '')
      setMaskedEmail(data?.maskedEmail || user?.email || '')
      setOtpStep('ENTER_OTP')

      if (data?.previewOtp) {
        setEnteredOtp(data.previewOtp)
        showToast({
          type: 'success',
          title: 'OTP Generated',
          message: `Code: ${data.previewOtp} (Auto-filled for verification)`,
        })
      } else {
        showToast({
          type: 'info',
          title: 'OTP Sent',
          message: res.data?.message || 'Verification code sent to your email.',
        })
      }
    } catch (err) {
      showToast({
        type: 'error',
        title: 'OTP Request Failed',
        message: err.response?.data?.message || err.message,
      })
    } finally {
      setSendingOtp(false)
    }
  }

  // Verify OTP handler
  const handleVerifyOtp = async (e) => {
    e?.preventDefault()
    if (!enteredOtp || enteredOtp.trim().length !== 6) {
      showToast({ type: 'warning', title: 'Invalid OTP', message: 'Please enter a valid 6-digit code.' })
      return
    }

    try {
      setVerifyingOtp(true)
      await staffAccessService.verifyOtp({ challengeId, otp: enteredOtp.trim() })
      setIsUnlocked(true)
      showToast({
        type: 'success',
        title: 'Access Granted',
        message: 'Staff Control Panel is now unlocked.',
      })
      fetchStaffUsers()
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Verification Failed',
        message: err.response?.data?.message || err.message,
      })
    } finally {
      setVerifyingOtp(false)
    }
  }

  // Fetch users
  const fetchStaffUsers = async () => {
    try {
      setLoadingUsers(true)
      const res = await staffAccessService.getUsers()
      setStaffUsers(res.data?.data?.users || [])
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Failed to load users',
        message: err.response?.data?.message || err.message,
      })
    } finally {
      setLoadingUsers(false)
    }
  }

  // Toggle User Status (Active / Inactive)
  const handleToggleStatus = async (staff) => {
    const nextStatus = staff.status === 'active' ? 'inactive' : 'active'
    try {
      await staffAccessService.updateUser(staff._id || staff.id, { status: nextStatus })
      showToast({
        type: 'success',
        title: 'Status Updated',
        message: `${staff.fullName} is now ${nextStatus.toUpperCase()}.`,
      })
      fetchStaffUsers()
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Status Update Failed',
        message: err.response?.data?.message || err.message,
      })
    }
  }

  // Create New User
  const handleCreateUser = async (e) => {
    e?.preventDefault()
    if (!newFullName.trim() || !newEmail.trim() || !newPassword.trim()) {
      showToast({ type: 'warning', title: 'Fields Required', message: 'Name, email, and password are required.' })
      return
    }

    try {
      setAddingUser(true)
      await staffAccessService.createUser({
        fullName: newFullName.trim(),
        email: newEmail.trim().toLowerCase(),
        password: newPassword.trim(),
      })
      showToast({
        type: 'success',
        title: 'Staff Member Added',
        message: `Account for ${newFullName} created successfully.`,
      })
      setShowAddModal(false)
      setNewFullName('')
      setNewEmail('')
      setNewPassword('')
      fetchStaffUsers()
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Creation Failed',
        message: err.response?.data?.message || err.message,
      })
    } finally {
      setAddingUser(false)
    }
  }

  // Change Password
  const handleSavePassword = async (e) => {
    e?.preventDefault()
    if (!editPassword.trim() || editPassword.trim().length < 6) {
      showToast({ type: 'warning', title: 'Weak Password', message: 'Password must be at least 6 characters.' })
      return
    }

    try {
      setSavingEdit(true)
      await staffAccessService.updateUser(userToEdit._id || userToEdit.id, { password: editPassword.trim() })
      showToast({
        type: 'success',
        title: 'Password Updated',
        message: `Password changed for ${userToEdit.fullName}.`,
      })
      setUserToEdit(null)
      setEditPassword('')
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Update Failed',
        message: err.response?.data?.message || err.message,
      })
    } finally {
      setSavingEdit(false)
    }
  }

  // Delete User
  const handleDeleteUser = async () => {
    if (!userToDelete) return
    try {
      setDeletingUser(true)
      await staffAccessService.deleteUser(userToDelete._id || userToDelete.id)
      showToast({
        type: 'success',
        title: 'User Deleted',
        message: `Staff member ${userToDelete.fullName} removed.`,
      })
      setUserToDelete(null)
      fetchStaffUsers()
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Delete Failed',
        message: err.response?.data?.message || err.message,
      })
    } finally {
      setDeletingUser(false)
    }
  }

  return (
    <div className="staff-access-page">
      {/* Breadcrumb */}
      <nav className="staff-breadcrumb" aria-label="Breadcrumb">
        <Link to="/dashboard" className="staff-breadcrumb-link">
          Home
        </Link>
        <span className="staff-breadcrumb-sep">&gt;</span>
        <span className="staff-breadcrumb-current">Staff Access Control</span>
      </nav>

      {/* Top Header */}
      <div className="staff-topbar">
        <div>
          <h1 className="staff-heading">Staff Access & Permissions</h1>
          <p className="staff-subtext">
            Protected Admin Gate: Manage employee accounts, login credentials, and permission limits.
          </p>
        </div>

        {isUnlocked && (
          <div className="staff-meta-pills">
            <button
              type="button"
              className="staff-btn staff-btn-primary"
              onClick={() => setShowAddModal(true)}
            >
              + Add New Staff
            </button>
          </div>
        )}
      </div>

      {/* Security Gate (If Locked) */}
      {!isUnlocked ? (
        <div className="staff-gate-card">
          <div className="staff-gate-icon">🔐</div>
          <h2>Admin Master Security Verification</h2>
          <p className="staff-gate-desc">
            To view passwords, configure staff accounts, and grant permissions, please verify yourself using a 6-digit OTP.
          </p>

          {otpStep === 'REQUEST' ? (
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <button
                type="button"
                className="staff-btn staff-btn-primary"
                disabled={sendingOtp}
                onClick={handleRequestOtp}
                style={{ padding: '12px 28px', fontSize: '15px' }}
              >
                {sendingOtp ? 'Sending OTP...' : 'Send OTP to Admin Email'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleVerifyOtp} className="staff-gate-form">
              <div className="staff-gate-info">
                Code sent to: <strong>{maskedEmail}</strong>
              </div>
              <input
                type="text"
                maxLength={6}
                placeholder="Enter 6-digit OTP"
                className="staff-otp-input"
                value={enteredOtp}
                onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '16px' }}>
                <button
                  type="submit"
                  className="staff-btn staff-btn-primary"
                  disabled={verifyingOtp || enteredOtp.length !== 6}
                >
                  {verifyingOtp ? 'Verifying...' : 'Unlock Panel'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={sendingOtp}
                  onClick={handleRequestOtp}
                >
                  Resend Code
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        /* Unlocked Management Panel */
        <div className="staff-content-card">
          <div className="staff-panel-header">
            <div>
              <h3>Active Staff Members</h3>
              <p>These users have access restricted strictly to Search Roll, Dashboard, and Regular Billing.</p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={fetchStaffUsers}
              style={{ padding: '6px 14px', fontSize: '13px' }}
            >
              Refresh
            </button>
          </div>

          {loadingUsers ? (
            <TableSkeleton rows={4} cols={5} />
          ) : staffUsers.length === 0 ? (
            <div className="empty-state">No staff accounts configured. Click &quot;Add New Staff&quot; above.</div>
          ) : (
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Staff Name</th>
                  <th>Login Email</th>
                  <th>Allowed Access</th>
                  <th>Access Permission</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffUsers.map((st) => (
                  <tr key={st._id}>
                    <td>
                      <strong>{st.fullName}</strong>
                    </td>
                    <td>{st.email}</td>
                    <td>
                      <span className="staff-tag-allowed">Dashboard</span>
                      <span className="staff-tag-allowed">Search Roll</span>
                      <span className="staff-tag-allowed">Billing</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(st)}
                        className={`staff-toggle-btn ${st.status === 'active' ? 'on' : 'off'}`}
                        title={st.status === 'active' ? 'Click to Turn OFF Access' : 'Click to Turn ON Access'}
                      >
                        {st.status === 'active' ? 'Access ON' : 'Access OFF'}
                      </button>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setUserToEdit(st)
                          setEditPassword('')
                        }}
                        style={{ marginRight: '8px', padding: '6px 14px', fontSize: '12px' }}
                      >
                        Change Pass
                      </button>
                      <button
                        type="button"
                        className="staff-btn-danger"
                        onClick={() => setUserToDelete(st)}
                        style={{ padding: '6px 14px', fontSize: '12px' }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Add New Staff Modal */}
      {showAddModal && (
        <div className="staff-modal-overlay" onClick={() => !addingUser && setShowAddModal(false)}>
          <div className="staff-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="staff-modal-header">
              <h3>Add New Staff Member</h3>
              <button type="button" className="btn-close" onClick={() => setShowAddModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateUser}>
              <div className="staff-modal-body">
                <div className="staff-field">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pooja"
                    className="staff-input"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                  />
                </div>
                <div className="staff-field" style={{ marginTop: '12px' }}>
                  <label>Login Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. nhpooja@gmail.com"
                    className="staff-input"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                <div className="staff-field" style={{ marginTop: '12px' }}>
                  <label>Login Password *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. pooja@8879"
                    className="staff-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
              </div>
              <div className="staff-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={addingUser}
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="staff-btn staff-btn-primary" disabled={addingUser}>
                  {addingUser ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {userToEdit && (
        <div className="staff-modal-overlay" onClick={() => !savingEdit && setUserToEdit(null)}>
          <div className="staff-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="staff-modal-header">
              <h3>Change Password for {userToEdit.fullName}</h3>
              <button type="button" className="btn-close" onClick={() => setUserToEdit(null)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSavePassword}>
              <div className="staff-modal-body">
                <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#64748b' }}>
                  Set a new password for account <strong>{userToEdit.email}</strong>.
                </p>
                <div className="staff-field">
                  <label>New Password (Min 6 chars) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter new password"
                    className="staff-input"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              <div className="staff-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={savingEdit}
                  onClick={() => setUserToEdit(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="staff-btn staff-btn-primary" disabled={savingEdit}>
                  {savingEdit ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {userToDelete && (
        <div className="staff-modal-overlay" onClick={() => !deletingUser && setUserToDelete(null)}>
          <div className="staff-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="staff-modal-header">
              <h3>Confirm Remove Staff Member</h3>
              <button type="button" className="btn-close" onClick={() => setUserToDelete(null)}>
                &times;
              </button>
            </div>
            <div className="staff-modal-body">
              <p>
                Are you sure you want to remove <strong>{userToDelete.fullName}</strong> ({userToDelete.email})?
              </p>
              <p style={{ fontSize: '12px', color: '#dc2626', margin: '4px 0 0' }}>
                This user will immediately lose access to sign in to the application.
              </p>
            </div>
            <div className="staff-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                disabled={deletingUser}
                onClick={() => setUserToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="staff-btn-danger"
                disabled={deletingUser}
                onClick={handleDeleteUser}
                style={{ padding: '8px 18px', fontWeight: '700' }}
              >
                {deletingUser ? 'Removing...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
