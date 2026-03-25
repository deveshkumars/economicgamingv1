import type { TargetInfo } from '../types'

interface Props {
  target: TargetInfo
}

export default function ImpactInfoCards({ target }: Props) {
  const sanctions = target.sanctions_status
  const isSanctioned = sanctions.is_sanctioned

  return (
    <div className="impact-info">
      <div className="info-card">
        <h3>Target Company</h3>
        <div className="value">{target.name || target.ticker}</div>
        <div className="label">
          {target.ticker} &mdash; {target.sector || 'N/A'} &mdash; {target.country || 'N/A'}
        </div>
        <div className="sub-value">
          Current Price: <strong>${(target.current_price || 0).toFixed(2)}</strong>
        </div>
        {target.market_cap && (
          <div className="label">
            Market Cap: ${(target.market_cap / 1e9).toFixed(1)}B
          </div>
        )}
      </div>

      <div className="info-card">
        <h3>Sanctions Status</h3>
        <div style={{ marginBottom: '8px' }}>
          <span className={`sanctions-badge ${isSanctioned ? 'sanctioned' : 'clear'}`}>
            {isSanctioned ? 'Sanctioned' : 'Not Currently Sanctioned'}
          </span>
        </div>
        {sanctions.lists.length > 0 && (
          <div className="sub-value">Lists: {sanctions.lists.join(', ')}</div>
        )}
        {sanctions.programs.length > 0 && (
          <div className="label">Programs: {sanctions.programs.slice(0, 3).join(', ')}</div>
        )}
        {sanctions.csl_matches.length > 0 && (
          <div className="label">{sanctions.csl_matches.length} Trade.gov CSL match(es)</div>
        )}
      </div>
    </div>
  )
}
