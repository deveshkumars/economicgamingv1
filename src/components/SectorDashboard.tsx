import type { SectorAnalysisResponse } from '../types'
import GraphViewer from './GraphViewer'

export default function SectorDashboard({ data }: { data: SectorAnalysisResponse }) {
  return (
    <div className="entity-report">
      {/* Sector Overview */}
      <div className="info-card">
        <h3>{data.sector_key.charAt(0).toUpperCase() + data.sector_key.slice(1)} Sector</h3>
        <div style={{ display: 'flex', gap: '24px', marginTop: '8px' }}>
          <div className="stat-box">
            <div className="label">Companies</div>
            <div className="value">{data.company_count}</div>
          </div>
          <div className="stat-box">
            <div className="label">Sanctioned</div>
            <div className="value" style={{ color: data.sanctioned_count > 0 ? '#f85149' : '#3fb950' }}>
              {data.sanctioned_count}
            </div>
          </div>
        </div>
      </div>

      {/* Companies Table */}
      <div className="info-card">
        <h3>Key Players</h3>
        <table className="comparables-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Ticker</th>
              <th>Country</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.companies.map((co, i) => (
              <tr key={i}>
                <td>{co.name}</td>
                <td>{co.ticker || 'Private'}</td>
                <td>{co.country || '-'}</td>
                <td>
                  <span className={`sanctions-badge ${co.is_sanctioned ? 'sanctioned' : 'clear'}`}
                        style={{ fontSize: '11px', padding: '2px 8px' }}>
                    {co.is_sanctioned ? 'Sanctioned' : 'Clear'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Entity Graph */}
      {data.graph && data.graph.nodes.length > 0 && (
        <div className="info-card">
          <h3>Sector Entity Graph</h3>
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
