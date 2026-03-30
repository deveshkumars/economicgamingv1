import type { VesselTrackResponse } from '../types'
import NarrativeCard from './NarrativeCard'

interface Props {
  data: VesselTrackResponse
}

function vesselField(vessel: Record<string, unknown>, key: string): string {
  const v = vessel[key]
  if (v === null || v === undefined || v === '' || v === 0) return '—'
  return String(v)
}

export default function VesselView({ data }: Props) {
  const { vessel, is_sanctioned, sanctions_matches, route_history } = data
  const vesselName = vesselField(vessel, 'name')

  return (
    <div id="resultsPanel">
      <NarrativeCard narrative={data.narrative} />

      {/* Sanctions banner */}
      <div className={`sanctions-banner ${is_sanctioned ? 'sanctioned' : 'clear'}`}>
        {is_sanctioned
          ? `VESSEL SANCTIONED — ${sanctions_matches.map((m) => m.programs.join(', ') || 'OFAC SDN').join('; ')}`
          : 'No active OFAC designation found for this vessel'}
      </div>

      {/* Identity cards */}
      <div className="view-grid">
        <div className="info-card">
          <h3>Vessel Identity</h3>
          <div className="profile-name">{vesselName}</div>
          <div className="profile-meta" style={{ marginTop: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginTop: '8px' }}>
              {[
                ['IMO', 'imo'],
                ['MMSI', 'mmsi'],
                ['Flag', 'flag'],
                ['Type', 'vessel_type'],
                ['DWT', 'deadweight'],
                ['Status', 'status'],
              ].map(([label, key]) => (
                <div key={key}>
                  <span style={{ color: '#484f58', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {label}
                  </span>
                  <div style={{ color: '#c9d1d9', fontSize: '13px', marginTop: '2px' }}>
                    {vesselField(vessel, key)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="info-card">
          <h3>Current Position</h3>
          {vessel['latitude'] || vessel['longitude'] ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginTop: '8px' }}>
              {[
                ['Latitude', 'latitude'],
                ['Longitude', 'longitude'],
                ['Speed (kn)', 'speed'],
                ['Destination', 'destination'],
                ['Owner', 'owner'],
              ].map(([label, key]) => (
                <div key={key}>
                  <span style={{ color: '#484f58', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {label}
                  </span>
                  <div style={{ color: '#c9d1d9', fontSize: '13px', marginTop: '2px' }}>
                    {vesselField(vessel, key)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-note">No live AIS position data available. Add DATALASTIC_API_KEY to enable live tracking.</div>
          )}
        </div>
      </div>

      {/* OFAC matches — only show if sanctioned */}
      {is_sanctioned && sanctions_matches.length > 0 && (
        <div className="info-card view-section">
          <h3>OFAC Matches</h3>
          <table className="view-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Score</th>
                <th>Programs</th>
              </tr>
            </thead>
            <tbody>
              {sanctions_matches.map((m, i) => (
                <tr key={i}>
                  <td>{m.name}</td>
                  <td style={{ color: '#f85149' }}>{(m.score * 100).toFixed(0)}%</td>
                  <td style={{ color: '#8b949e' }}>{m.programs.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Route history */}
      <div className="info-card view-section">
        <h3>Route History (last {route_history.length} positions)</h3>
        {route_history.length > 0 ? (
          <table className="view-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Latitude</th>
                <th>Longitude</th>
                <th>Speed (kn)</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {route_history.slice(0, 10).map((p, i) => (
                <tr key={i}>
                  <td style={{ color: '#484f58' }}>{i + 1}</td>
                  <td>{p.lat.toFixed(4)}</td>
                  <td>{p.lon.toFixed(4)}</td>
                  <td>{p.speed.toFixed(1)}</td>
                  <td style={{ color: '#8b949e' }}>
                    {p.ts ? new Date(p.ts * 1000).toISOString().replace('T', ' ').slice(0, 16) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-note">No route history available. Historical AIS requires DATALASTIC_API_KEY.</div>
        )}
      </div>

      <div className="source-chips">
        {data.sources.map((s) => <span key={s} className="source-chip">{s}</span>)}
      </div>
    </div>
  )
}
