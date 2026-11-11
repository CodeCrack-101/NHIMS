import { BrandLogo } from '../components/BrandLogo.jsx'
import '../styles/AuthLayout.css'

export function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="auth-layout">
      <div className="auth-card">
        <BrandLogo />
        {title && <h1 className="auth-title">{title}</h1>}
        {subtitle && <p className="auth-description">{subtitle}</p>}
        <div className="auth-card-body">{children}</div>
      </div>
      <footer className="auth-footer">
        <span>Protected by Enterprise Session &amp; Two-Step Email Verification</span>
      </footer>
    </div>
  )
}
