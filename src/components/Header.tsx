export default function Header() {
  return (
    <div className="header">
      <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        CascAIde <span style={{ opacity: 0.5, fontSize: '0.6em', fontWeight: 400 }}>by</span>{' '}
        <img
          src="/agile-defense-wordmark.png"
          alt="Agile Defense"
          style={{ height: '1.4em', verticalAlign: 'middle' }}
        />
      </h1>
      <p>Multi-source OSINT platform for company, vessel, and sector intelligence</p>
    </div>
  )
}
