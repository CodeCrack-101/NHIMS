import '../styles/BrandLogo.css'

export function BrandLogo({ subtitle = null }) {
  return (
    <div className="brand-header">
      <div className="brand-logo-box" aria-hidden="true">
        <img className='logo' src="/Logo.png" alt="NH Wallpaper Stock" />
      </div>
      {subtitle && <p className="brand-subtitle">{subtitle}</p>}
    </div>
  )
}
