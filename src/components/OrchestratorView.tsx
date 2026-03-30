import type { CSSProperties } from 'react'
import type { GraphEdge, GraphNode, ImpactAssessmentResult } from '../types'
import GraphViewer from './GraphViewer'
import DebugPanel from './DebugPanel'

const ENTITY_GROUP_COLOR: Record<string, string> = {
  company: '#4A90D9',
  person: '#7B68EE',
  government: '#DC143C',
  vessel: '#2E8B57',
  sanctions_list: '#F85149',
  sector: '#3FB950',
}

function assessmentGraphToVis(data: ImpactAssessmentResult): { nodes: GraphNode[]; edges: GraphEdge[] } | null {
  const eg = data.entity_graph
  if (!eg?.entities?.length) return null
  const nodes: GraphNode[] = eg.entities.map((e) => {
    const group = e.entity_type || 'company'
    const color = ENTITY_GROUP_COLOR[group] ?? '#8b949e'
    return {
      id: e.id,
      label: e.name.length > 42 ? `${e.name.slice(0, 40)}…` : e.name,
      title: `${e.name}\n${group}${e.country ? ` · ${e.country}` : ''}`,
      group,
      color,
    }
  })
  const edges: GraphEdge[] = (eg.relationships ?? []).map((r) => ({
    from: r.source_id,
    to: r.target_id,
    label: r.relationship_type.replace(/_/g, ' '),
    arrows: 'to',
    dashes: true,
  }))
  return { nodes, edges }
}

interface Props {
  data: ImpactAssessmentResult
}

const CONFIDENCE_STYLE: Record<string, CSSProperties> = {
  HIGH:   { color: '#3fb950' },
  MEDIUM: { color: '#f2cc60' },
  LOW:    { color: '#f85149' },
}

function ConfidenceBadge({ level }: { level: string }) {
  const style = CONFIDENCE_STYLE[level] ?? CONFIDENCE_STYLE.LOW
  return (
    <span style={{
      ...style,
      fontSize: '11px',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      padding: '2px 8px',
      border: `1px solid ${style.color}`,
      borderRadius: '12px',
      background: `${style.color}22`,
    }}>
      {level}
    </span>
  )
}

export default function OrchestratorView({ data }: Props) {
  const scenarioLabel = data.scenario_type.replace(/_/g, ' ')
  const visGraph = assessmentGraphToVis(data)

  return (
    <div id="resultsPanel">
      {/* Executive summary */}
      <div className="info-card" style={{ marginBottom: '24px', borderLeft: '3px solid #58a6ff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <h3 style={{ margin: 0 }}>Executive Assessment</h3>
          <span style={{
            fontSize: '11px', color: '#8b949e', background: '#21262d',
            padding: '3px 10px', borderRadius: '12px', textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            {scenarioLabel}
          </span>
        </div>
        <p style={{ fontSize: '14px', lineHeight: '1.7', color: '#c9d1d9', margin: 0 }}>
          {data.executive_summary || 'No summary generated.'}
        </p>
      </div>

      <div className="view-grid">
        {/* Findings */}
        <div className="info-card">
          <h3>Findings ({data.findings.length})</h3>
          {data.findings.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
              {data.findings.map((f, i) => (
                <div key={i} style={{ borderLeft: '2px solid #30363d', paddingLeft: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {f.category || 'General'}
                    </span>
                    <ConfidenceBadge level={f.confidence || 'LOW'} />
                  </div>
                  <p style={{ fontSize: '13px', color: '#c9d1d9', margin: 0, lineHeight: '1.5' }}>
                    {f.finding}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-note">No findings returned.</div>
          )}
        </div>

        {/* Friendly fire + recommendations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {data.friendly_fire.length > 0 && (
            <div className="info-card" style={{ border: '1px solid rgba(248,81,73,0.3)', background: 'rgba(248,81,73,0.05)' }}>
              <h3 style={{ color: '#f85149' }}>⚠ Friendly Fire Alerts ({data.friendly_fire.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                {data.friendly_fire.map((ff, i) => (
                  <div key={i}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#e6edf3' }}>{ff.entity}</div>
                    <div style={{ fontSize: '13px', color: '#8b949e', marginTop: '2px' }}>
                      {ff.details
                        || [ff.exposure_type, ff.estimated_impact].filter(Boolean).join(' · ')
                        || '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.recommendations.length > 0 && (
            <div className="info-card">
              <h3>Recommendations</h3>
              <ul style={{ margin: '8px 0 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {data.recommendations.map((r, i) => (
                  <li key={i} style={{ fontSize: '13px', color: '#c9d1d9', lineHeight: '1.5' }}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Confidence summary */}
          {Object.keys(data.confidence_summary).length > 0 && (
            <div className="info-card">
              <h3>Confidence by Domain</h3>
              <table className="view-table" style={{ marginTop: '8px' }}>
                <tbody>
                  {Object.entries(data.confidence_summary).map(([domain, level]) => (
                    <tr key={domain}>
                      <td style={{ color: '#8b949e', textTransform: 'capitalize' }}>{domain.replace(/_/g, ' ')}</td>
                      <td><ConfidenceBadge level={String(level)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {visGraph && visGraph.nodes.length > 0 && (
        <div className="graph-section" style={{ marginTop: '24px' }}>
          <div className="graph-section-header">Orchestrator entity graph</div>
          <div className="graph-container" style={{ height: '420px' }}>
            <GraphViewer nodes={visGraph.nodes} edges={visGraph.edges} />
          </div>
        </div>
      )}

      {/* Sources */}
      {data.sources.length > 0 && (
        <div className="source-chips" style={{ marginTop: '8px' }}>
          {data.sources.map((s, i) => (
            <span key={i} className="source-chip">{s.name}</span>
          ))}
        </div>
      )}

      <DebugPanel data={data} label="Raw API Response — orchestrator" />
    </div>
  )
}
