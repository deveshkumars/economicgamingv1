import type { ProjectionSummaryData } from '../types'

interface Props {
  summary: ProjectionSummaryData
}

const POST_KEYS = [
  { label: '30-Day Post', expected: 'day_30_post', range: 'day_30_range' },
  { label: '60-Day Post', expected: 'day_60_post', range: 'day_60_range' },
  { label: '90-Day Post', expected: 'day_90_post', range: 'day_90_range' },
] as const

function SummaryCard({ label, val, range, note }: {
  label: string
  val: number | undefined
  range?: [number, number]
  note?: string
}) {
  if (val === undefined) {
    return (
      <div className="proj-card">
        <div className="proj-label">{label}</div>
        <div className="proj-value" style={{ color: '#8b949e' }}>N/A</div>
      </div>
    )
  }
  const cls = val < 0 ? 'negative' : 'positive'
  const sign = val >= 0 ? '+' : ''
  return (
    <div className="proj-card">
      <div className="proj-label">{label}</div>
      <div className={`proj-value ${cls}`}>{sign}{val.toFixed(1)}%</div>
      {range && (
        <div className="proj-range">{range[0].toFixed(1)}% to {range[1].toFixed(1)}%</div>
      )}
      {note && <div className="proj-note">{note}</div>}
    </div>
  )
}

export default function ProjectionSummary({ summary }: Props) {
  return (
    <div className="projection-summary">
      <SummaryCard
        label="60-Day Pre-Event"
        val={summary.pre_event_decline}
        note="Sector-relative performance 60 days before announcement"
      />
      {POST_KEYS.map(({ label, expected, range }) => (
        <SummaryCard
          key={label}
          label={label}
          val={summary[expected]}
          range={summary[range]}
        />
      ))}
      <SummaryCard
        label="Peak-to-Trough"
        val={summary.max_drawdown}
        note="Worst point across full window"
      />
    </div>
  )
}
