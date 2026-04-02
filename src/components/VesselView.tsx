import { useState } from 'react'
import type { VesselTrackResponse, OwnershipLink } from '../types'
import GraphViewer from './GraphViewer'
import AISRouteMap from './AISRouteMap'
import SankeyChart from './SankeyChart'

interface Props {
  data: VesselTrackResponse
  onDrillDown?: (question: string) => void
}

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
  const color = link.entity_type === 'person' ? '#a371f7' : '#58a6ff'
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

function cpiColor(score: number): string {
  if (score > 60) return '#3fb950'
  if (score >= 30) return '#e3b341'
  return '#f85149'
}

function baselColor(score: number): string {
  if (score < 5) return '#3fb950'
  if (score <= 7) return '#e3b341'
  return '#f85149'
}

export default function VesselView({ data, onDrillDown }: Props) {
  const v = data.vessel
  const [graphTab, setGraphTab] = useState<'ownership' | 'trade'>('ownership')

  return (
    <div className="entity-report" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

      {/* 1. Vessel Stats Grid */}
      <div className="vessel-stat-grid">
        <div className="vessel-stat">
          <div className="v-label">Vessel Name</div>
          <div className="v-value">{v.name || 'Unknown'}</div>
        </div>
        <div className="vessel-stat">
          <div className="v-label">IMO</div>
          <div className="v-value">{v.imo || '\u2014'}</div>
        </div>
        <div className="vessel-stat">
          <div className="v-label">MMSI</div>
          <div className="v-value">{v.mmsi || '\u2014'}</div>
        </div>
        <div className="vessel-stat">
          <div className="v-label">Flag</div>
          <div className="v-value">{v.flag || '\u2014'}</div>
        </div>
        <div className="vessel-stat">
          <div className="v-label">Type</div>
          <div className="v-value">{v.vessel_type || '\u2014'}</div>
        </div>
        <div className="vessel-stat">
          <div className="v-label">OFAC Status</div>
          <div className="v-value">
            {data.is_sanctioned
              ? <span style={{ color: '#f85149', fontWeight: 600 }}>SANCTIONED</span>
              : <span style={{ color: '#3fb950', fontWeight: 600 }}>Clear</span>}
          </div>
        </div>
        <div className="vessel-stat">
          <div className="v-label">Speed</div>
          <div className="v-value">{v.speed != null ? `${v.speed} kn` : '\u2014'}</div>
        </div>
        <div className="vessel-stat">
          <div className="v-label">Destination</div>
          <div className="v-value">{v.destination || '\u2014'}</div>
        </div>
        <div className="vessel-stat">
          <div className="v-label">Owner</div>
          <div className="v-value">{data.owner_name || '\u2014'}</div>
        </div>
        {data.risk_scores?.cpi_score != null && (
          <div className="vessel-stat">
            <div className="v-label">CPI Score</div>
            <div className="v-value" style={{ color: cpiColor(data.risk_scores.cpi_score) }}>
              {data.risk_scores.cpi_score}
            </div>
          </div>
        )}
        {data.risk_scores?.basel_aml != null && (
          <div className="vessel-stat">
            <div className="v-label">Basel AML</div>
            <div className="v-value" style={{ color: baselColor(data.risk_scores.basel_aml) }}>
              {data.risk_scores.basel_aml}
            </div>
          </div>
        )}
      </div>

      {/* 2. Sanctions Matches */}
      {data.sanctions_matches && data.sanctions_matches.length > 0 && (
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

      {/* 3. Risk Assessment */}
      {data.narrative && (
        <div className="info-card">
          <h3>Risk Assessment</h3>
          <p style={{ color: '#e6edf3', lineHeight: '1.6', margin: 0 }}>{data.narrative}</p>
        </div>
      )}

      {/* 4. Recommended Courses of Action */}
      {data.recommendations && data.recommendations.length > 0 && (
        <div className="info-card">
          <h3>Recommended Courses of Action</h3>
          <ol style={{ paddingLeft: '20px', color: '#c9d1d9', lineHeight: '1.8', margin: 0 }}>
            {data.recommendations.map((rec, i) => (
              <li key={i} style={{ fontSize: '13px' }}>{rec}</li>
            ))}
          </ol>
        </div>
      )}

      {/* 5. Countries Visited */}
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

      {/* 6. Ownership Chain */}
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

      {/* 7. Trade Activity */}
      {data.trade_activity && data.trade_activity.records && data.trade_activity.records.length > 0 && (
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
          {data.trade_activity.top_hs_codes && data.trade_activity.top_hs_codes.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <span style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Top Commodities</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {data.trade_activity.top_hs_codes.map((hs, i) => (
                  <span
                    key={i}
                    onClick={() => onDrillDown?.(`What are the forced labor, sanctions, and supply chain risks associated with international trade in ${hs.description || hs.code}?`)}
                    style={{
                      background: '#1c2129', border: '1px solid #30363d', borderRadius: '12px',
                      padding: '3px 10px', fontSize: '11px', color: '#8b949e',
                      cursor: onDrillDown ? 'pointer' : 'default',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => { if (onDrillDown) (e.currentTarget.style.borderColor = '#58a6ff') }}
                    onMouseLeave={e => { (e.currentTarget.style.borderColor = '#30363d') }}
                  >
                    {hs.description || hs.code}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Country pills */}
          {data.trade_activity.trade_countries && data.trade_activity.trade_countries.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <span style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Trade Countries</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {data.trade_activity.trade_countries.map((c, i) => (
                  <span
                    key={i}
                    onClick={() => onDrillDown?.(`What are the sanctions risks and geopolitical factors affecting trade with ${c}?`)}
                    style={{
                      background: '#1c2129', border: '1px solid #30363d', borderRadius: '12px',
                      padding: '3px 10px', fontSize: '11px', color: '#58a6ff',
                      cursor: onDrillDown ? 'pointer' : 'default',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => { if (onDrillDown) (e.currentTarget.style.borderColor = '#58a6ff') }}
                    onMouseLeave={e => { (e.currentTarget.style.borderColor = '#30363d') }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 8. Sankey Trade Flow */}
      {data.trade_activity?.sankey_flows && (
        <div className="info-card">
          <h3>Trade Flow Diagram</h3>
          <SankeyChart flows={data.trade_activity.sankey_flows} />
        </div>
      )}

      {/* 9. AIS Route Map */}
      {data.route_history && data.route_history.length > 0 && (
        <div className="info-card">
          <h3>AIS Route Map</h3>
          <AISRouteMap points={data.route_history} vesselName={v.name} />
        </div>
      )}

      {/* 10. AIS Position History */}
      {data.route_history && data.route_history.length > 0 && (
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

      {/* 11. Tabbed Graph Pane */}
      {((data.graph?.nodes?.length ?? 0) > 0 || (data.trade_graph?.nodes?.length ?? 0) > 0) && (
        <div className="info-card">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              className={`map-range-btn${graphTab === 'ownership' ? ' active' : ''}`}
              onClick={() => setGraphTab('ownership')}
            >
              Ownership &amp; Sanctions
            </button>
            <button
              className={`map-range-btn${graphTab === 'trade' ? ' active' : ''}`}
              onClick={() => setGraphTab('trade')}
            >
              Trade Network
            </button>
          </div>

          {/* Legend */}
          <div className="graph-legend">
            {graphTab === 'ownership' ? (
              <>
                <div className="legend-item"><span className="legend-dot" style={{ background: '#3fb950' }} />Vessel</div>
                <div className="legend-item"><span className="legend-dot" style={{ background: '#58a6ff' }} />Company</div>
                <div className="legend-item"><span className="legend-dot" style={{ background: '#a371f7' }} />Person / UBO</div>
                <div className="legend-item"><span className="legend-dot" style={{ background: 'crimson' }} />Flag State</div>
                <div className="legend-item"><span className="legend-dot" style={{ background: '#f85149' }} />Sanctions</div>
              </>
            ) : (
              <>
                <div className="legend-item"><span className="legend-dot" style={{ background: '#3fb950' }} />Vessel</div>
                <div className="legend-item"><span className="legend-dot" style={{ background: '#58a6ff' }} />Trade Partner</div>
                <div className="legend-item"><span className="legend-dot" style={{ background: '#f85149' }} />Risk Flagged</div>
              </>
            )}
          </div>

          <div style={{ height: '400px' }}>
            {graphTab === 'ownership' && data.graph?.nodes?.length ? (
              <GraphViewer nodes={data.graph.nodes} edges={data.graph.edges} />
            ) : graphTab === 'trade' && data.trade_graph?.nodes?.length ? (
              <GraphViewer nodes={data.trade_graph.nodes} edges={data.trade_graph.edges} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#484f58', fontSize: '14px' }}>
                No graph data available for this view.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 12. Source Chips */}
      {data.sources && data.sources.length > 0 && (
        <div className="source-chips">
          <span className="source-chip">{data.sources.join(', ')}</span>
        </div>
      )}
    </div>
  )
}
