import type { SayariUBOOwner } from '../types'

interface Props {
  targetName: string
  owners: SayariUBOOwner[]
  loading: boolean
}

export default function UBOPanel({ targetName, owners, loading }: Props) {
  if (!loading && owners.length === 0) return null

  return (
    <div className="ubo-panel">
      <div className="ubo-header">
        Ultimate Beneficial Ownership
        {targetName && <span className="ubo-target"> — {targetName}</span>}
      </div>
      {loading && <div className="ubo-loading">Loading UBO data...</div>}
      {!loading && owners.length > 0 && (
        <table className="ubo-table">
          <thead>
            <tr>
              <th>Owner</th>
              <th>Type</th>
              <th>Country</th>
              <th>Ownership</th>
              <th>Depth</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            {owners.map((o, i) => (
              <tr key={o.entity_id || i}>
                <td className="ubo-name">{o.name}</td>
                <td>{o.type || '—'}</td>
                <td>{o.country || '—'}</td>
                <td>
                  {o.ownership_percentage != null
                    ? `${o.ownership_percentage.toFixed(1)}%`
                    : '—'}
                </td>
                <td>{o.path_length}</td>
                <td className="ubo-flags">
                  {o.sanctioned && <span className="ubo-flag ubo-flag-sanction">Sanctioned</span>}
                  {o.pep && <span className="ubo-flag ubo-flag-pep">PEP</span>}
                  {!o.sanctioned && !o.pep && '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
