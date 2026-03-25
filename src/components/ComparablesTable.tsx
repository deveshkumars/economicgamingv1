import type { Comparable } from '../types'

interface Props {
  comparables: Comparable[]
  hidden: Set<number>
  onToggle: (idx: number) => void
}

export default function ComparablesTable({ comparables, hidden, onToggle }: Props) {
  return (
    <table className="comparables-table">
      <thead>
        <tr>
          <th></th>
          <th>Company</th>
          <th>Ticker</th>
          <th>Sanction Date</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {comparables.map((c, i) => (
          <tr
            key={i}
            className={hidden.has(i) ? 'dimmed' : ''}
            onClick={() => onToggle(i)}
          >
            <td>
              <span className="color-dot" style={{ background: c.color }} />
            </td>
            <td>{c.name}</td>
            <td style={{ fontFamily: 'monospace', color: '#58a6ff' }}>{c.ticker}</td>
            <td>{c.sanction_date}</td>
            <td style={{ color: '#8b949e', fontSize: '12px' }}>{c.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
