import type { ProjectionSummaryData } from '../types'

interface Props {
  summary: ProjectionSummaryData
}

const KEYS = [
  { label: '30-Day', expected: 'day_30_expected', range: 'day_30_range' },
  { label: '60-Day', expected: 'day_60_expected', range: 'day_60_range' },
  { label: '90-Day', expected: 'day_90_expected', range: 'day_90_range' },
] as const

export default function ProjectionSummary({ summary }: Props) {
  return (
    <div className="projection-summary">
      {KEYS.map(({ label, expected, range }) => {
        const val = summary[expected]
        const rng = summary[range]

        if (val === undefined) {
          return (
            <div key={label} className="proj-card">
              <div className="proj-label">{label} Projection</div>
              <div className="proj-value" style={{ color: '#8b949e' }}>N/A</div>
            </div>
          )
        }

        const cls = val < 0 ? 'negative' : 'positive'
        const sign = val >= 0 ? '+' : ''

        return (
          <div key={label} className="proj-card">
            <div className="proj-label">{label} Projection</div>
            <div className={`proj-value ${cls}`}>{sign}{val.toFixed(1)}%</div>
            {rng && (
              <div className="proj-range">
                {rng[0].toFixed(1)}% to {rng[1].toFixed(1)}%
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
