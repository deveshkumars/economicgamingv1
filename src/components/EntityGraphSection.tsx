import GraphViewer from './GraphViewer'
import type { EntityGraphResponse } from '../types'

const LEGEND = [
  { label: 'Company', color: '#4A90D9' },
  { label: 'Person', color: '#7B68EE' },
  { label: 'Government', color: '#DC143C' },
  { label: 'Sanctions', color: '#F85149' },
  { label: 'Vessel', color: '#2E8B57' },
  { label: 'Sector', color: '#3FB950' },
]

interface Props {
  graphData: EntityGraphResponse | null
  graphLoading: boolean
}

export default function EntityGraphSection({ graphData, graphLoading }: Props) {
  if (!graphData && !graphLoading) return null

  const hasNodes = graphData && graphData.nodes.length > 0

  let emptyText = ''
  if (graphLoading && !graphData) emptyText = 'Loading entity graph...'
  else if (graphData && !hasNodes) emptyText = 'No entity relationships found'

  return (
    <div className="graph-section">
      <div className="graph-section-header">Entity Relationship Graph</div>
      <div className="graph-legend">
        {LEGEND.map((item) => (
          <span key={item.label} className="legend-item">
            <span className="legend-dot" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="graph-container">
        {emptyText && <div className="graph-empty">{emptyText}</div>}
        {hasNodes && (
          <GraphViewer nodes={graphData.nodes} edges={graphData.edges} />
        )}
      </div>
      {graphData && hasNodes && (
        <div className="graph-stats">
          {graphData.meta.node_count} entities · {graphData.meta.edge_count} relationships
        </div>
      )}
    </div>
  )
}
