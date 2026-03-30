import type { SectorAnalysisResponse } from '../types'
import NarrativeCard from './NarrativeCard'

interface Props {
  data: SectorAnalysisResponse
}

const FLAG_EMOJI: Record<string, string> = {
  US: '🇺🇸', CN: '🇨🇳', TW: '🇹🇼', KR: '🇰🇷', NL: '🇳🇱', GB: '🇬🇧',
  DE: '🇩🇪', FR: '🇫🇷', JP: '🇯🇵', RU: '🇷🇺', SA: '🇸🇦', SG: '🇸🇬',
  AU: '🇦🇺', HK: '🇭🇰', IN: '🇮🇳', IT: '🇮🇹', SE: '🇸🇪', FI: '🇫🇮',
  DK: '🇩🇰', CH: '🇨🇭', AE: '🇦🇪', PH: '🇵🇭',
}

export default function SectorView({ data }: Props) {
  const sanctionedPct = data.company_count > 0
    ? Math.round((data.sanctioned_count / data.company_count) * 100)
    : 0

  return (
    <div id="resultsPanel">
      <NarrativeCard narrative={data.narrative} />

      {/* Summary cards */}
      <div className="view-grid" style={{ marginBottom: '24px' }}>
        <div className="info-card">
          <h3>Sector</h3>
          <div className="value" style={{ textTransform: 'capitalize' }}>
            {data.sector_key.replace(/_/g, ' ')}
          </div>
          {data.sector.toLowerCase() !== data.sector_key.replace(/_/g, ' ').toLowerCase() && (
            <div className="label">Query: {data.sector}</div>
          )}
        </div>

        <div className="info-card">
          <h3>Sanctions Exposure</h3>
          <div className="value" style={{ color: data.sanctioned_count > 0 ? '#f85149' : '#3fb950' }}>
            {data.sanctioned_count} / {data.company_count}
          </div>
          <div className="label">Key players with OFAC designation ({sanctionedPct}%)</div>
        </div>
      </div>

      {/* Company table */}
      <div className="info-card view-section">
        <h3>Key Players</h3>
        <table className="view-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Country</th>
              <th>Ticker</th>
              <th>Sanctions</th>
            </tr>
          </thead>
          <tbody>
            {data.companies.map((co, i) => (
              <tr key={i}>
                <td>{co.name}</td>
                <td style={{ color: '#8b949e' }}>
                  {co.country
                    ? `${FLAG_EMOJI[co.country] ?? ''} ${co.country}`
                    : '—'}
                </td>
                <td style={{ color: '#58a6ff', fontFamily: 'monospace' }}>
                  {co.ticker ?? '—'}
                </td>
                <td>
                  {co.is_sanctioned ? (
                    <span className="sanctions-badge sanctioned">
                      OFAC {co.sanction_names[0] ? `· ${co.sanction_names[0]}` : ''}
                    </span>
                  ) : (
                    <span className="sanctions-badge clear">Clear</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Trade / geopolitical enrichment (defense & MRO sectors on backend) */}
      {(data.supply_chain_exposures?.length ?? 0) > 0 && (
        <div className="info-card view-section">
          <h3>Supply chain exposures (trade tools)</h3>
          <table className="view-table">
            <thead>
              <tr>
                <th>Commodity</th>
                <th>HS code</th>
                <th>US import share %</th>
                <th>Top suppliers</th>
              </tr>
            </thead>
            <tbody>
              {data.supply_chain_exposures!.map((row, i) => (
                <tr key={i}>
                  <td>{row.label}</td>
                  <td style={{ fontFamily: 'monospace', color: '#8b949e' }}>{row.commodity_code}</td>
                  <td style={{ color: '#8b949e' }}>{row.import_share_pct?.toFixed?.(1) ?? row.import_share_pct ?? '—'}</td>
                  <td style={{ color: '#8b949e', fontSize: '12px' }}>
                    {Array.isArray(row.top_suppliers) && row.top_suppliers.length > 0
                      ? JSON.stringify(row.top_suppliers.slice(0, 3))
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(data.geopolitical_tensions?.length ?? 0) > 0 && (
        <div className="info-card view-section">
          <h3>Geopolitical tensions (GDELT)</h3>
          <table className="view-table">
            <thead>
              <tr>
                <th>Pair</th>
                <th>Events</th>
                <th>Level</th>
                <th>Avg tone</th>
              </tr>
            </thead>
            <tbody>
              {data.geopolitical_tensions!.map((row, i) => (
                <tr key={i}>
                  <td>{row.pair}</td>
                  <td>{row.event_count}</td>
                  <td style={{ textTransform: 'capitalize' }}>{row.tension_level}</td>
                  <td style={{ color: '#8b949e' }}>{row.avg_tone != null ? row.avg_tone.toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="source-chips">
        {data.sources.map((s) => <span key={s} className="source-chip">{s}</span>)}
      </div>
    </div>
  )
}
