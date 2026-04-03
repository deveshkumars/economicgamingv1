import { useState } from 'react'
import type { SectorAnalysisResponse, BuildWorkforceRunStatus, EntityRiskReport } from '../types'
import NarrativeCard from './NarrativeCard'
import RiskReportPanel from './RiskReportPanel'
import { fetchEntityRiskReport } from '../api'

interface Props {
  data: SectorAnalysisResponse
  buildworkforceData?: BuildWorkforceRunStatus | null
  buildworkforceLoading?: boolean
}

const FLAG_EMOJI: Record<string, string> = {
  US: '🇺🇸', CN: '🇨🇳', TW: '🇹🇼', KR: '🇰🇷', NL: '🇳🇱', GB: '🇬🇧',
  DE: '🇩🇪', FR: '🇫🇷', JP: '🇯🇵', RU: '🇷🇺', SA: '🇸🇦', SG: '🇸🇬',
  AU: '🇦🇺', HK: '🇭🇰', IN: '🇮🇳', IT: '🇮🇹', SE: '🇸🇪', FI: '🇫🇮',
  DK: '🇩🇰', CH: '🇨🇭', AE: '🇦🇪', PH: '🇵🇭',
}

function RiskBadge({ sanctioned }: { sanctioned: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 8px', borderRadius: '12px',
      fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
      background: sanctioned ? 'rgba(248,81,73,0.15)' : 'rgba(63,185,80,0.12)',
      color: sanctioned ? '#f85149' : '#3fb950',
      border: `1px solid ${sanctioned ? 'rgba(248,81,73,0.3)' : 'rgba(63,185,80,0.25)'}`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: sanctioned ? '#f85149' : '#3fb950',
        display: 'inline-block',
      }} />
      {sanctioned ? 'OFAC Listed' : 'Clear'}
    </span>
  )
}

function CompanyCard({
  co,
  onRunReport,
}: {
  co: SectorAnalysisResponse['companies'][0]
  onRunReport: (name: string, ticker?: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const flag = co.country ? FLAG_EMOJI[co.country] ?? '' : ''

  return (
    <div
      style={{
        background: co.is_sanctioned ? 'rgba(248,81,73,0.04)' : '#161b22',
        border: `1px solid ${co.is_sanctioned ? 'rgba(248,81,73,0.25)' : '#30363d'}`,
        borderRadius: '10px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        transition: 'border-color 0.15s',
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        if (!co.is_sanctioned) (e.currentTarget as HTMLDivElement).style.borderColor = '#484f58'
      }}
      onMouseLeave={(e) => {
        if (!co.is_sanctioned) (e.currentTarget as HTMLDivElement).style.borderColor = '#30363d'
      }}
    >
      {/* Top row: name + sanctions badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#e6edf3', lineHeight: '1.35', flex: 1, minWidth: 0 }}>
          {co.name}
        </div>
        <RiskBadge sanctioned={co.is_sanctioned} />
      </div>

      {/* Meta row: flag + ticker */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '12px' }}>
        {co.country && (
          <span style={{ color: '#8b949e' }}>
            {flag && <span style={{ marginRight: '4px' }}>{flag}</span>}
            {co.country}
          </span>
        )}
        {co.ticker && (
          <span style={{
            fontFamily: 'monospace', fontSize: '11px', color: '#58a6ff',
            background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.2)',
            borderRadius: '4px', padding: '1px 6px',
          }}>
            {co.ticker}
          </span>
        )}
      </div>

      {/* Sanction names if applicable */}
      {co.is_sanctioned && co.sanction_names.length > 0 && (
        <div style={{ fontSize: '11px', color: '#f85149', background: 'rgba(248,81,73,0.07)', borderRadius: '5px', padding: '5px 8px' }}>
          {co.sanction_names.slice(0, 2).join(' · ')}
        </div>
      )}

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          background: 'none', border: 'none', padding: 0,
          color: '#484f58', fontSize: '11px', cursor: 'pointer',
          textAlign: 'left', display: 'flex', alignItems: 'center', gap: '4px',
        }}
      >
        <span style={{ transform: expanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▶</span>
        {expanded ? 'Less info' : 'More info'}
      </button>

      {expanded && (
        <div style={{ borderTop: '1px solid #21262d', paddingTop: '10px', fontSize: '12px', color: '#8b949e', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {co.country && <div><span style={{ color: '#484f58' }}>Country: </span>{flag} {co.country}</div>}
          {co.ticker && <div><span style={{ color: '#484f58' }}>Ticker: </span><span style={{ color: '#58a6ff', fontFamily: 'monospace' }}>{co.ticker}</span></div>}
          <div><span style={{ color: '#484f58' }}>Sanctions status: </span>
            <span style={{ color: co.is_sanctioned ? '#f85149' : '#3fb950' }}>
              {co.is_sanctioned ? `OFAC listed${co.sanction_names.length > 0 ? ` (${co.sanction_names.join(', ')})` : ''}` : 'No designations found'}
            </span>
          </div>
        </div>
      )}

      {/* Run Risk Report CTA */}
      <button
        onClick={() => onRunReport(co.name, co.ticker ?? undefined)}
        style={{
          marginTop: 'auto',
          background: 'rgba(88,166,255,0.08)',
          border: '1px solid rgba(88,166,255,0.25)',
          borderRadius: '6px',
          color: '#58a6ff',
          fontSize: '12px',
          fontWeight: 500,
          padding: '7px 12px',
          cursor: 'pointer',
          width: '100%',
          textAlign: 'center',
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(88,166,255,0.14)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(88,166,255,0.08)')}
      >
        Run Risk Report →
      </button>
    </div>
  )
}

export default function SectorView({ data, buildworkforceData, buildworkforceLoading }: Props) {
  const [expandedSteps, setExpandedSteps] = useState(false)

  // Risk report panel state
  const [riskReport, setRiskReport] = useState<EntityRiskReport | null>(null)
  const [riskLoading, setRiskLoading] = useState(false)
  const [riskEntityName, setRiskEntityName] = useState<string | null>(null)

  const sanctionedPct = data.company_count > 0
    ? Math.round((data.sanctioned_count / data.company_count) * 100)
    : 0

  async function handleRunReport(name: string, ticker?: string) {
    setRiskEntityName(name)
    setRiskReport(null)
    setRiskLoading(true)
    try {
      const report = await fetchEntityRiskReport(name, 'company', ticker)
      setRiskReport(report)
    } catch {
      // panel will show the entity name, failure is silent
    } finally {
      setRiskLoading(false)
    }
  }

  function closePanel() {
    setRiskReport(null)
    setRiskLoading(false)
    setRiskEntityName(null)
  }

  return (
    <div id="resultsPanel">
      {/* ── Original Report ────────────────────────────────────────────── */}
      <NarrativeCard narrative={data.narrative} />

      {/* Summary cards */}
      <div className="view-grid" style={{ marginBottom: '24px' }}>
        <div className="info-card">
          <h3>Sector</h3>
          <div className="value" style={{ textTransform: 'capitalize' }}>
            {data.sector_key.replace(/_/g, ' ')}
          </div>
          {data.sector.toLowerCase() !== data.sector_key.replace(/_/g, ' ').toLowerCase() && (
            <div className="label">Query: {data.sector}</div>
          )}
        </div>

        <div className="info-card">
          <h3>Sanctions Exposure</h3>
          <div className="value" style={{ color: data.sanctioned_count > 0 ? '#f85149' : '#3fb950' }}>
            {data.sanctioned_count} / {data.company_count}
          </div>
          <div className="label">Key players with OFAC designation ({sanctionedPct}%)</div>
        </div>
      </div>

      {/* Trade / geopolitical enrichment */}
      {(data.supply_chain_exposures?.length ?? 0) > 0 && (
        <div className="info-card view-section">
          <h3>Supply chain exposures (trade tools)</h3>
          <table className="view-table">
            <thead>
              <tr>
                <th>Commodity</th>
                <th>HS code</th>
                <th>US import share %</th>
                <th>Top suppliers</th>
              </tr>
            </thead>
            <tbody>
              {data.supply_chain_exposures!.map((row, i) => (
                <tr key={i}>
                  <td>{row.label}</td>
                  <td style={{ fontFamily: 'monospace', color: '#8b949e' }}>{row.commodity_code}</td>
                  <td style={{ color: '#8b949e' }}>{row.import_share_pct?.toFixed?.(1) ?? row.import_share_pct ?? '—'}</td>
                  <td style={{ color: '#8b949e', fontSize: '12px' }}>
                    {Array.isArray(row.top_suppliers) && row.top_suppliers.length > 0
                      ? JSON.stringify(row.top_suppliers.slice(0, 3))
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(data.geopolitical_tensions?.length ?? 0) > 0 && (
        <div className="info-card view-section">
          <h3>Geopolitical tensions (GDELT)</h3>
          <table className="view-table">
            <thead>
              <tr>
                <th>Pair</th>
                <th>Events</th>
                <th>Level</th>
                <th>Avg tone</th>
              </tr>
            </thead>
            <tbody>
              {data.geopolitical_tensions!.map((row, i) => (
                <tr key={i}>
                  <td>{row.pair}</td>
                  <td>{row.event_count}</td>
                  <td style={{ textTransform: 'capitalize' }}>{row.tension_level}</td>
                  <td style={{ color: '#8b949e' }}>{row.avg_tone != null ? row.avg_tone.toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="source-chips" style={{ marginBottom: '32px' }}>
        {data.sources.map((s) => <span key={s} className="source-chip">{s}</span>)}
      </div>

      {/* ── Key Players Card Grid ──────────────────────────────────────── */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: '16px',
        }}>
          <h2 style={{
            fontSize: '16px', fontWeight: 700, color: '#e6edf3',
            margin: 0, letterSpacing: '-0.01em',
          }}>
            Key Players
            <span style={{ marginLeft: '10px', fontSize: '12px', fontWeight: 400, color: '#484f58' }}>
              {data.company_count} companies · {data.sanctioned_count} OFAC flagged
            </span>
          </h2>
          {data.sanctioned_count > 0 && (
            <span style={{
              fontSize: '11px', fontWeight: 600, color: '#f85149',
              background: 'rgba(248,81,73,0.12)', border: '1px solid rgba(248,81,73,0.25)',
              borderRadius: '20px', padding: '3px 10px',
            }}>
              ⚠ {sanctionedPct}% sanctioned exposure
            </span>
          )}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '12px',
        }}>
          {data.companies.map((co, i) => (
            <CompanyCard key={i} co={co} onRunReport={handleRunReport} />
          ))}
        </div>
      </div>

      {/* ── BuildWorkforce AI Sector Intelligence ─────────────────────── */}
      {(buildworkforceLoading || buildworkforceData) && (
        <div className="info-card view-section" style={{ marginBottom: '32px' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            BuildWorkforce AI — Sector Intelligence Report
            {buildworkforceLoading && !buildworkforceData?.output && (
              <span style={{
                fontSize: '11px', fontWeight: 400, color: '#8b949e',
                display: 'inline-flex', alignItems: 'center', gap: '6px',
              }}>
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: '#f8c132', display: 'inline-block',
                  animation: 'pulse 1.4s ease-in-out infinite',
                }} />
                Generating deep analysis…
              </span>
            )}
            {buildworkforceData?.status === 'complete' && (
              <span style={{
                fontSize: '11px', fontWeight: 500, color: '#3fb950',
                background: 'rgba(63,185,80,0.12)', border: '1px solid rgba(63,185,80,0.3)',
                borderRadius: '4px', padding: '2px 8px',
              }}>Complete</span>
            )}
          </h3>

          {buildworkforceLoading && buildworkforceData && !buildworkforceData.output && (
            <div style={{ color: '#8b949e', fontSize: '13px', marginBottom: '12px' }}>
              {buildworkforceData.steps.filter((s) => s.completedAt).length} of{' '}
              {buildworkforceData.steps.length || '?'} research steps completed…
            </div>
          )}

          {buildworkforceData?.output && (
            <div style={{
              color: '#e6edf3', fontSize: '14px', lineHeight: '1.75',
              whiteSpace: 'pre-wrap', marginBottom: '16px',
            }}>
              {buildworkforceData.output}
            </div>
          )}

          {buildworkforceData && buildworkforceData.steps.length > 0 && (
            <div>
              <button
                onClick={() => setExpandedSteps((v) => !v)}
                style={{
                  background: 'none', border: '1px solid #30363d', borderRadius: '6px',
                  color: '#8b949e', cursor: 'pointer', fontSize: '12px',
                  padding: '4px 12px', marginBottom: '12px',
                }}
              >
                {expandedSteps ? '▲ Hide' : '▼ Show'} research steps ({buildworkforceData.steps.filter((s) => s.completedAt).length} completed)
              </button>

              {expandedSteps && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {buildworkforceData.steps.filter((s) => s.output).map((step, i) => (
                    <div key={step.id} style={{
                      background: '#161b22', border: '1px solid #30363d',
                      borderRadius: '6px', padding: '12px',
                    }}>
                      <div style={{
                        color: '#58a6ff', fontSize: '11px', fontWeight: 600,
                        marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        Step {i + 1}
                      </div>
                      <div style={{
                        color: '#c9d1d9', fontSize: '13px', lineHeight: '1.6',
                        whiteSpace: 'pre-wrap',
                      }}>
                        {step.output}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Risk Report slide-in panel */}
      <RiskReportPanel
        report={riskReport}
        loading={riskLoading}
        entityName={riskEntityName}
        onClose={closePanel}
      />
    </div>
  )
}
