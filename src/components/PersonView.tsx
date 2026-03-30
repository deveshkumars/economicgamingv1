import type { PersonProfileResponse } from '../types'
import NarrativeCard from './NarrativeCard'

interface Props {
  data: PersonProfileResponse
}

function ToneBadge({ tone }: { tone: number | null }) {
  if (tone === null) return <span className="tone-badge neutral">—</span>
  if (tone > 1) return <span className="tone-badge positive">+{tone.toFixed(1)}</span>
  if (tone < -1) return <span className="tone-badge negative">{tone.toFixed(1)}</span>
  return <span className="tone-badge neutral">{tone.toFixed(1)}</span>
}

export default function PersonView({ data }: Props) {
  return (
    <div id="resultsPanel">
      <NarrativeCard narrative={data.narrative} />

      {/* Sanctions banner */}
      <div className={`sanctions-banner ${data.is_sanctioned ? 'sanctioned' : 'clear'}`}>
        {data.is_sanctioned
          ? `SANCTIONED — ${data.sanction_programs.join(', ') || 'SDN/Sanctions list'}`
          : 'No active sanctions designation found'}
      </div>

      {/* Profile header + aliases */}
      <div className="view-grid">
        <div className="info-card">
          <h3>Identity</h3>
          <div className="profile-name">{data.name}</div>
          <div className="profile-meta">
            {data.nationality && <span>Nationality: {data.nationality}</span>}
            {data.dob && <span>DOB: {data.dob}</span>}
          </div>
          {data.aliases.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <div style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                Aliases
              </div>
              {data.aliases.map((a) => (
                <div key={a} style={{ fontSize: '13px', color: '#c9d1d9', marginBottom: '2px' }}>{a}</div>
              ))}
            </div>
          )}
        </div>

        {/* Offshore connections — only show if non-empty */}
        {data.offshore_connections.length > 0 ? (
          <div className="info-card">
            <h3>Offshore Connections (ICIJ)</h3>
            <table className="view-table">
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Dataset</th>
                  <th>Jurisdiction</th>
                </tr>
              </thead>
              <tbody>
                {data.offshore_connections.map((c, i) => (
                  <tr key={i}>
                    <td>{c.entity}</td>
                    <td style={{ color: '#8b949e' }}>{c.dataset}</td>
                    <td style={{ color: '#8b949e' }}>{c.jurisdiction || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      {/* Corporate affiliations */}
      <div className="info-card view-section">
        <h3>Corporate Affiliations (OpenCorporates)</h3>
        {data.affiliations.length > 0 ? (
          <table className="view-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Role</th>
                <th>Nationality</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.affiliations.map((a, i) => (
                <tr key={i}>
                  <td>{a.company}</td>
                  <td style={{ color: '#8b949e' }}>{a.role}</td>
                  <td style={{ color: '#8b949e' }}>{a.nationality || '—'}</td>
                  <td>
                    <span className={`status-badge ${a.active ? 'ok' : 'error'}`}>
                      {a.active ? 'Active' : 'Former'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-note">No corporate officer records found.</div>
        )}
      </div>

      {/* Recent events */}
      <div className="info-card view-section">
        <h3>Recent Coverage (GDELT — last 30 days)</h3>
        {data.recent_events.length > 0 ? (
          <table className="view-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Date</th>
                <th>Tone</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_events.map((ev, i) => (
                <tr key={i}>
                  <td>
                    {ev.source
                      ? <a href={ev.source} target="_blank" rel="noreferrer" style={{ color: '#58a6ff', textDecoration: 'none' }}>{ev.title}</a>
                      : ev.title}
                  </td>
                  <td style={{ color: '#8b949e', whiteSpace: 'nowrap' }}>{ev.date || '—'}</td>
                  <td><ToneBadge tone={ev.tone} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-note">No recent GDELT coverage in the past 30 days.</div>
        )}
      </div>

      <div className="source-chips">
        {data.sources.map((s) => <span key={s} className="source-chip">{s}</span>)}
      </div>
    </div>
  )
}
