import type { PersonProfileResponse } from '../types'
import GraphViewer from './GraphViewer'

export default function PersonReport({ data }: { data: PersonProfileResponse }) {
  return (
    <div className="entity-report">
      {/* Header */}
      <div className="info-card">
        <h3>{data.name}</h3>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className={`sanctions-badge ${data.is_sanctioned ? 'sanctioned' : 'clear'}`}>
            {data.is_sanctioned ? 'Sanctioned' : 'Not Currently Sanctioned'}
          </span>
          {data.nationality && <span className="label">Nationality: {data.nationality}</span>}
          {data.dob && <span className="label">DOB: {data.dob}</span>}
        </div>
        {data.aliases.length > 0 && (
          <div className="label" style={{ marginTop: '8px' }}>
            Aliases: {data.aliases.join(', ')}
          </div>
        )}
        {data.sanction_programs.length > 0 && (
          <div className="label" style={{ marginTop: '4px' }}>
            Programs: {data.sanction_programs.join(', ')}
          </div>
        )}
      </div>

      {/* Corporate Affiliations */}
      {data.affiliations.length > 0 && (
        <div className="info-card">
          <h3>Corporate Affiliations</h3>
          <table className="comparables-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.affiliations.map((aff, i) => (
                <tr key={i}>
                  <td>{aff.company}</td>
                  <td>{aff.role}</td>
                  <td>
                    <span style={{ color: aff.active ? '#3fb950' : '#8b949e' }}>
                      {aff.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Offshore Connections */}
      {data.offshore_connections.length > 0 && (
        <div className="info-card">
          <h3>Offshore Connections (ICIJ)</h3>
          <table className="comparables-table">
            <thead>
              <tr>
                <th>Entity</th>
                <th>Dataset</th>
                <th>Jurisdiction</th>
              </tr>
            </thead>
            <tbody>
              {data.offshore_connections.map((off, i) => (
                <tr key={i}>
                  <td>{off.entity}</td>
                  <td>{off.dataset}</td>
                  <td>{off.jurisdiction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Events */}
      {data.recent_events.length > 0 && (
        <div className="info-card">
          <h3>Recent Events (GDELT)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.recent_events.map((ev, i) => (
              <div key={i} style={{ borderBottom: '1px solid #21262d', paddingBottom: '8px' }}>
                <div style={{ fontSize: '13px' }}>{ev.title}</div>
                <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>
                  {ev.date && <span>{ev.date} &middot; </span>}
                  {ev.source && (
                    <a href={ev.source} target="_blank" rel="noreferrer" style={{ color: '#58a6ff' }}>
                      source
                    </a>
                  )}
                  {ev.tone != null && <span> &middot; tone: {ev.tone.toFixed(1)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Entity Graph */}
      {data.graph && data.graph.nodes.length > 0 && (
        <div className="info-card">
          <h3>Entity Relationship Graph</h3>
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
