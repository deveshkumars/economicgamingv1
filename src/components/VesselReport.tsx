import type { VesselTrackResponse, OwnershipLink } from '../types'
import GraphViewer from './GraphViewer'
import AISRouteMap from './AISRouteMap'

function RelLabel({ rel }: { rel: string }) {
  const labels: Record<string, string> = {
    registered_owner: 'Registered Owner',
    owner: 'Owner',
    beneficial_owner: 'Beneficial Owner',
    operator: 'Operator',
    builder: 'Builder',
    manager: 'Manager',
    charterer: 'Charterer',
  }
  return <span style={{ fontSize: '11px', color: '#8b949e' }}>{labels[rel] || rel || 'Related'}</span>
}

function OwnershipNode({ link }: { link: OwnershipLink }) {
  const icon = link.entity_type === 'person' ? '\u{1F464}' : '\u{1F3E2}'
  const color = link.entity_type === 'person' ? '#a371f7' : '#4A90D9'
  const pct = link.ownership_percentage ? ` (${link.ownership_percentage}%)` : ''
  return (
    <div style={{
      padding: '10px',
      border: '1px solid #30363d',
      borderRadius: '6px',
      margin: '2px 0',
      background: '#0d1117',
      marginLeft: `${(link.depth - 1) * 24}px`,
    }}>
      <span style={{ color }}>{icon}</span>{' '}
      <strong>{link.name}</strong>{pct}
      {link.is_sanctioned && (
        <span className="sanctions-badge sanctioned" style={{ fontSize: '10px', padding: '2px 6px', marginLeft: '8px' }}>SANCTIONED</span>
      )}
      {link.is_pep && (
        <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: '12px', fontSize: '10px', background: 'rgba(184,134,11,0.15)', color: '#b8860b', border: '1px solid rgba(184,134,11,0.3)', marginLeft: '8px' }}>PEP</span>
      )}
      <div style={{ fontSize: '11px', color: '#8b949e' }}>
        <RelLabel rel={link.relationship_type} /> &middot; {link.country || 'Unknown'}
      </div>
    </div>
  )
}

export default function VesselReport({ data }: { data: VesselTrackResponse }) {
  const v = data.vessel
  return (
    <div className="entity-report">
      {/* Vessel Details */}
      <div className="info-card">
        <h3>{v.name || 'Unknown Vessel'}</h3>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`sanctions-badge ${data.is_sanctioned ? 'sanctioned' : 'clear'}`}>
            {data.is_sanctioned ? 'Sanctioned' : 'Not Sanctioned'}
          </span>
          {v.flag && <span className="label">Flag: {v.flag}</span>}
          {v.vessel_type && <span className="label">Type: {v.vessel_type}</span>}
        </div>
        {v.note && <div className="label" style={{ marginTop: '8px', color: '#f0883e' }}>{v.note}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginTop: '16px' }}>
          {v.imo && <div className="stat-box"><div className="label">IMO</div><div className="value">{v.imo}</div></div>}
          {v.mmsi && <div className="stat-box"><div className="label">MMSI</div><div className="value">{v.mmsi}</div></div>}
          {v.callsign && <div className="stat-box"><div className="label">Callsign</div><div className="value">{v.callsign}</div></div>}
          {v.length != null && <div className="stat-box"><div className="label">Length</div><div className="value">{v.length}m</div></div>}
          {v.deadweight != null && <div className="stat-box"><div className="label">DWT</div><div className="value">{v.deadweight.toLocaleString()}</div></div>}
        </div>
      </div>

      {/* Narrative */}
      {data.narrative && (
        <div className="info-card">
          <h3>Risk Assessment</h3>
          <p style={{ color: '#e6edf3', lineHeight: '1.6', margin: 0 }}>{data.narrative}</p>
        </div>
      )}

      {/* Current Position */}
      {v.latitude != null && v.longitude != null && v.latitude !== 0 && (
        <div className="info-card">
          <h3>Current Position</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            <div className="stat-box"><div className="label">Lat / Lon</div><div className="value">{v.latitude.toFixed(4)}, {v.longitude.toFixed(4)}</div></div>
            {v.speed != null && <div className="stat-box"><div className="label">Speed</div><div className="value">{v.speed} kn</div></div>}
            {v.course != null && <div className="stat-box"><div className="label">Course</div><div className="value">{v.course}&deg;</div></div>}
            {v.status && <div className="stat-box"><div className="label">Status</div><div className="value">{v.status}</div></div>}
            {v.destination && <div className="stat-box"><div className="label">Destination</div><div className="value">{v.destination}</div></div>}
            {v.eta && <div className="stat-box"><div className="label">ETA</div><div className="value">{new Date(v.eta).toLocaleDateString()}</div></div>}
          </div>
        </div>
      )}

      {/* Countries Visited */}
      {data.countries_visited && data.countries_visited.length > 0 && (
        <div className="info-card">
          <h3>Countries / Regions Visited</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
            {data.countries_visited.map((c, i) => (
              <span key={i} style={{
                background: c.startsWith('(') ? '#1c2129' : '#0d2137',
                border: `1px solid ${c.startsWith('(') ? '#30363d' : '#1f6feb'}`,
                borderRadius: '12px', padding: '4px 12px', fontSize: '12px',
                color: c.startsWith('(') ? '#8b949e' : '#58a6ff',
              }}>
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Port Calls */}
      {data.port_calls && data.port_calls.length > 0 && (
        <div className="info-card">
          <h3>Port Call History</h3>
          <table className="comparables-table">
            <thead>
              <tr><th>Port</th><th>Country</th><th>Arrival</th><th>Departure</th></tr>
            </thead>
            <tbody>
              {data.port_calls.map((pc, i) => (
                <tr key={i}>
                  <td>{pc.port_name}</td>
                  <td>{pc.country}</td>
                  <td>{pc.arrival ? new Date(pc.arrival).toLocaleDateString() : '\u2014'}</td>
                  <td>{pc.departure ? new Date(pc.departure).toLocaleDateString() : '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Sanctions Matches */}
      {data.sanctions_matches.length > 0 && (
        <div className="info-card">
          <h3>Sanctions Matches</h3>
          <table className="comparables-table">
            <thead>
              <tr><th>Name</th><th>Score</th><th>Programs</th></tr>
            </thead>
            <tbody>
              {data.sanctions_matches.map((m, i) => (
                <tr key={i}>
                  <td>{m.name}</td>
                  <td>{(m.score * 100).toFixed(0)}%</td>
                  <td>{m.programs.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Beneficial Ownership Chain */}
      {data.ownership_chain && data.ownership_chain.length > 0 && (
        <div className="info-card">
          <h3>
            Beneficial Ownership Chain{' '}
            <span style={{ fontSize: '11px', color: '#58a6ff', fontWeight: 'normal' }}>(Sayari Graph)</span>
          </h3>
          <div style={{ marginTop: '8px' }}>
            {data.ownership_chain.map((link, i) => (
              <OwnershipNode key={link.entity_id || i} link={link} />
            ))}
          </div>
        </div>
      )}

      {/* Trade Activity */}
      {data.trade_activity && data.trade_activity.records.length > 0 && (
        <div className="info-card">
          <h3>
            Trade Activity{' '}
            <span style={{ fontSize: '11px', color: '#58a6ff', fontWeight: 'normal' }}>(Sayari Graph)</span>
          </h3>
          <table className="comparables-table">
            <thead>
              <tr><th>Date</th><th>From</th><th>To</th><th>Commodity</th></tr>
            </thead>
            <tbody>
              {data.trade_activity.records.slice(0, 10).map((r, i) => (
                <tr key={i}>
                  <td>{r.date || '\u2014'}</td>
                  <td>{r.departure_country || '\u2014'}</td>
                  <td>{r.arrival_country || '\u2014'}</td>
                  <td style={{ fontSize: '11px' }}>{r.hs_description || r.hs_code || '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* HS code pills */}
          {data.trade_activity.top_hs_codes.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <span style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Top Commodities</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {data.trade_activity.top_hs_codes.map((hs, i) => (
                  <span key={i} style={{ background: '#1c2129', border: '1px solid #30363d', borderRadius: '12px', padding: '3px 10px', fontSize: '11px', color: '#8b949e' }}>
                    {hs.description || hs.code}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Country pills */}
          {data.trade_activity.trade_countries.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <span style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Trade Countries</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {data.trade_activity.trade_countries.map((c, i) => (
                  <span key={i} style={{ background: '#1c2129', border: '1px solid #30363d', borderRadius: '12px', padding: '3px 10px', fontSize: '11px', color: '#58a6ff' }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AIS Route Map */}
      {data.route_history.length > 0 && (
        <div className="info-card">
          <h3>AIS Route Map</h3>
          <AISRouteMap points={data.route_history} vesselName={v.name} />
        </div>
      )}

      {/* AIS Position Table */}
      {data.route_history.length > 0 && (
        <div className="info-card">
          <h3>AIS Position History ({data.route_history.length} points)</h3>
          <div style={{ maxHeight: '340px', overflowY: 'auto', borderRadius: '6px', border: '1px solid #30363d' }}>
            <table className="comparables-table" style={{ margin: 0 }}>
              <thead style={{ position: 'sticky', top: 0, background: '#161b22', zIndex: 1 }}>
                <tr><th>Time</th><th>Lat</th><th>Lon</th><th>Speed</th></tr>
              </thead>
              <tbody>
                {data.route_history.map((pt, i) => (
                  <tr key={i}>
                    <td>{pt.ts ? new Date(pt.ts * 1000).toLocaleString() : '-'}</td>
                    <td>{pt.lat.toFixed(4)}</td>
                    <td>{pt.lon.toFixed(4)}</td>
                    <td>{pt.speed} kn</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Entity Graph */}
      {data.graph && data.graph.nodes.length > 0 && (
        <div className="info-card">
          <h3>Ownership & Sanctions Network</h3>
          <div style={{ height: '400px' }}>
            <GraphViewer nodes={data.graph.nodes} edges={data.graph.edges} />
          </div>
        </div>
      )}

      <div className="source-note">
        Data sources: {data.sources.join(', ')}
      </div>
    </div>
  )
}
