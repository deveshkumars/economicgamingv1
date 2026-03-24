export default function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-brand">
          <div className="header-logo-mark" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <polygon points="12,2 22,8 22,16 12,22 2,16 2,8" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <polygon points="12,6 18,9.5 18,14.5 12,18 6,14.5 6,9.5" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.5"/>
            </svg>
          </div>
          <div className="header-title-group">
            <span className="header-product-name">ARCHON</span>
            <span className="header-product-subtitle">Economic Warfare Intelligence Platform</span>
          </div>
        </div>

        <div className="header-center">
          <span className="header-class-badge">UNCLASSIFIED // FOUO</span>
        </div>

        <div className="header-meta">
          <span className="header-version">v0.1.0</span>
          <span className="header-separator" aria-hidden="true" />
          <span className="header-sys-label">MULTI-AGENT OSINT</span>
        </div>
      </div>
      <div className="header-scanline" aria-hidden="true" />
    </header>
  )
}
