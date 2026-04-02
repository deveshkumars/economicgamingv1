import { useState } from 'react'
import type { SectorAnalysisResponse, CompanyProfile } from '../types'
import GraphViewer from './GraphViewer'

const FLAG_EMOJI: Record<string, string> = {
  US: '≡ƒç║≡ƒç╕', CN: '≡ƒç¿≡ƒç│', TW: '≡ƒç╣≡ƒç╝', KR: '≡ƒç░≡ƒç╖', NL: '≡ƒç│≡ƒç▒', GB: '≡ƒç¼≡ƒçº',
  DE: '≡ƒç⌐≡ƒç¬', FR: '≡ƒç½≡ƒç╖', JP: '≡ƒç»≡ƒç╡', RU: '≡ƒç╖≡ƒç║', SA: '≡ƒç╕≡ƒçª', SG: '≡ƒç╕≡ƒç¼',
  AU: '≡ƒçª≡ƒç║', HK: '≡ƒç¡≡ƒç░', IN: '≡ƒç«≡ƒç│', IT: '≡ƒç«≡ƒç╣', SE: '≡ƒç╕≡ƒç¬', FI: '≡ƒç½≡ƒç«',
  DK: '≡ƒç⌐≡ƒç░', CH: '≡ƒç¿≡ƒç¡', AE: '≡ƒçª≡ƒç¬', PH: '≡ƒç╡≡ƒç¡',
}

const SECTOR_ICONS: Record<string, string> = {
  semiconductor: '≡ƒÆ╛',
  energy: 'ΓÜí',
  defense: '≡ƒ¢í∩╕Å',
  aircraft_mro: 'Γ£ê∩╕Å',
  finance: '≡ƒÅª',
  technology: '≡ƒÆ╗',
  pharma: '≡ƒÆè',
  telecom: '≡ƒôí',
}

function getSectorIcon(sectorKey: string): string {
  const key = sectorKey.toLowerCase()
  for (const [k, icon] of Object.entries(SECTOR_ICONS)) {
    if (key.includes(k)) return icon
  }
  return '≡ƒÅ¡'
}

interface CompanyCardProps {
  company: CompanyProfile
  onRunRisk: (ticker: string) => void
}

function CompanyCard({ company, onRunRisk }: CompanyCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`si-company-card ${company.is_sanctioned ? 'sanctioned' : ''} ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="si-company-name">{company.name}</div>
      {company.ticker && (
        <div className="si-company-ticker">{company.ticker}</div>
      )}
      <div className="si-company-country">
        {company.country
          ? `${FLAG_EMOJI[company.country] ?? ''} ${company.country}`
          : 'ΓÇö'}
      </div>
      {company.is_sanctioned && (
        <div className="si-sanctions-badge">
          ΓÜá OFAC Listed
        </div>
      )}

      {expanded && (
        <div className="si-company-expanded" onClick={(e) => e.stopPropagation()}>
          <div className="si-expanded-row">
            <span className="si-expanded-label">Entity</span>
            <span>{company.name}</span>
          </div>
          {company.ticker && (
            <div className="si-expanded-row">
              <span className="si-expanded-label">Ticker</span>
              <span style={{ color: '#58a6ff', fontFamily: 'monospace' }}>{company.ticker}</span>
            </div>
          )}
          {company.country && (
            <div className="si-expanded-row">
              <span className="si-expanded-label">Country</span>
              <span>{FLAG_EMOJI[company.country] ?? ''} {company.country}</span>
            </div>
          )}
          <div className="si-expanded-row">
            <span className="si-expanded-label">Sanctions</span>
            <span style={{ color: company.is_sanctioned ? '#f85149' : '#3fb950' }}>
              {company.is_sanctioned
                ? `OFAC ΓÇö ${company.sanction_names.join(', ') || 'Designated'}`
                : 'Clear'}
            </span>
          </div>
          {company.ticker && (
            <button
              type="button"
              className="si-risk-report-btn"
              onClick={() => onRunRisk(company.ticker!)}
            >
              Run Risk Report
            </button>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  data: SectorAnalysisResponse
  onRunRisk: (ticker: string) => void
}

export default function SectorIntelligenceView({ data, onRunRisk }: Props) {
  const sanctionedPct = data.company_count > 0
    ? Math.round((data.sanctioned_count / data.company_count) * 100)
    : 0
  const icon = getSectorIcon(data.sector_key)
  const hasGraph = data.graph.nodes.length > 0

  return (
    <div className="si-root">
      {/* Section label */}
      <div className="si-section-label">SECTOR INTELLIGENCE</div>

      {/* Sector header */}
      <div className="si-header">
        <span className="si-header-icon">{icon}</span>
        <div>
          <div className="si-header-title">
            {data.sector_key.replace(/_/g, ' ').toUpperCase()} SECTOR
          </div>
          <div className="si-header-sub">{data.company_count} key players tracked</div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="si-stats">
        <div className="si-stat-card">
          <div className="si-stat-label">KEY PLAYERS</div>
          <div className="si-stat-value">{data.company_count}</div>
        </div>
        <div className="si-stat-card">
          <div className="si-stat-label">SANCTIONED ENTITIES</div>
          <div className="si-stat-value" style={{ color: data.sanctioned_count > 0 ? '#f85149' : '#3fb950' }}>
            {data.sanctioned_count}
          </div>
        </div>
        <div className="si-stat-card">
          <div className="si-stat-label">SANCTIONS EXPOSURE</div>
          <div className="si-stat-value" style={{ color: sanctionedPct > 0 ? '#e3b341' : '#3fb950' }}>
            {sanctionedPct}%
          </div>
        </div>
      </div>

      {/* Key players grid */}
      <div className="si-players-section">
        <div className="si-players-label">KEY PLAYERS</div>
        <div className="si-players-grid">
          {data.companies.map((co, i) => (
            <CompanyCard key={i} company={co} onRunRisk={onRunRisk} />
          ))}
        </div>
      </div>

      {/* Sector network */}
      {hasGraph && (
        <div className="si-network-section">
          <div className="si-section-label" style={{ marginBottom: '12px' }}>SECTOR NETWORK</div>
          <div className="si-legend">
            <span className="si-legend-item"><span className="si-legend-dot" style={{ background: '#3fb950' }} />Sector</span>
            <span className="si-legend-item"><span className="si-legend-dot" style={{ background: '#4A90D9' }} />Company</span>
            <span className="si-legend-item"><span className="si-legend-dot" style={{ background: '#f85149' }} />Sanctioned</span>
          </div>
          <div className="si-graph-container">
            <GraphViewer nodes={data.graph.nodes} edges={data.graph.edges} />
          </div>
        </div>
      )}

      {/* Sources */}
      <div className="source-chips" style={{ marginTop: '16px' }}>
        {data.sources.map((s) => <span key={s} className="source-chip">{s}</span>)}
      </div>
    </div>
  )
}
