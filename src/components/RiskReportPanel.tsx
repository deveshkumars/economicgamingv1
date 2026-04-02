import type { EntityRiskReport, RiskIndicator } from '../types'

interface Props {
  report: EntityRiskReport | null
  loading: boolean
  entityName: string | null
  onClose: () => void
}

function RiskLevelBadge({ level }: { level: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const styles: Record<string, React.CSSProperties> = {
    HIGH:   { background: 'rgba(248,81,73,0.15)',   color: '#f85149', border: '1px solid rgba(248,81,73,0.3)' },
    MEDIUM: { background: 'rgba(248,193,53,0.15)',  color: '#f8c135', border: '1px solid rgba(248,193,53,0.3)' },
    LOW:    { background: 'rgba(63,185,80,0.15)',   color: '#3fb950', border: '1px solid rgba(63,185,80,0.3)' },
  }
  return (
    <span style={{ display:'inline-block', padding:'3px 10px', borderRadius:'12px', fontSize:'11px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', ...styles[level] }}>
      {level} RISK
    </span>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize:'11px', color:'#8b949e', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'8px', paddingBottom:'5px', borderBottom:'1px solid #21262d', marginTop:'16px' }}>
      {children}
    </div>
  )
}

function KV({ label, children, highlight }: { label: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'6px 0', borderBottom:'1px solid #1a1f27', gap:'12px', fontSize:'12px' }}>
      <span style={{ color:'#8b949e', flexShrink:0 }}>{label}</span>
      <span style={{ color: highlight ? '#e6edf3' : '#c9d1d9', textAlign:'right', wordBreak:'break-word', fontWeight: highlight ? 600 : 400 }}>{children}</span>
    </div>
  )
}

function IndicatorRow({ ind }: { ind: RiskIndicator }) {
  const color = { high:'#f85149', medium:'#f8c135', low:'#3fb950' }[ind.severity]
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'7px 0', borderBottom:'1px solid #21262d', gap:'12px' }}>
      <span style={{ fontSize:'12px', color:'#8b949e', flexShrink:0 }}>{ind.label}</span>
      <span style={{ fontSize:'12px', color, fontWeight: ind.severity === 'high' ? 600 : 400, textAlign:'right', wordBreak:'break-word' }}>
        {ind.value}
      </span>
    </div>
  )
}

function fmtMC(mc: number | null): string {
  if (!mc) return '—'
  if (mc >= 1e12) return `$${(mc / 1e12).toFixed(2)}T`
  if (mc >= 1e9)  return `$${(mc / 1e9).toFixed(1)}B`
  if (mc >= 1e6)  return `$${(mc / 1e6).toFixed(0)}M`
  return `$${mc.toLocaleString()}`
}

function fmtUSD(v: number | null): string {
  if (!v) return '—'
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`
  return `$${v.toLocaleString()}`
}

/** Visual 52-week range bar */
function RangeBar({ low, high, current }: { low: number; high: number; current: number }) {
  const span = high - low || 1
  const pct = Math.max(0, Math.min(100, ((current - low) / span) * 100))
  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
      <div style={{ position:'relative', height:6, background:'#30363d', borderRadius:3 }}>
        <div style={{ position:'absolute', left:0, top:0, height:'100%', width:`${pct}%`, background:'#58a6ff', borderRadius:3, minWidth:4 }} />
        <div style={{ position:'absolute', left:`${pct}%`, top:'50%', transform:'translate(-50%,-50%)', width:10, height:10, background:'#fff', borderRadius:'50%', border:'2px solid #58a6ff' }} />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'10px', color:'#484f58', marginTop:4 }}>
        <span>${low.toFixed(2)} 52w low</span>
        <span>52w high ${high.toFixed(2)}</span>
      </div>
    </div>
  )
}

export default function RiskReportPanel({ report, loading, entityName, onClose }: Props) {
  if (!report && !loading && !entityName) return null

  return (
    <>
      <div className="risk-panel-backdrop" onClick={onClose} />
      <div className="risk-panel">
        {/* Header */}
        <div className="risk-panel-header">
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'11px', color:'#8b949e', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'4px' }}>Entity Risk Report</div>
            <div style={{ fontSize:'16px', fontWeight:600, color:'#e6edf3', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{entityName ?? '…'}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#8b949e', cursor:'pointer', fontSize:'20px', lineHeight:1, padding:'4px', flexShrink:0 }} aria-label="Close">×</button>
        </div>

        <div className="risk-panel-body">
          {loading && !report && (
            <div className="risk-panel-loading">
              <div className="spinner" style={{ width:20, height:20, borderWidth:3, marginRight:10 }} />
              Analyzing {entityName}…
            </div>
          )}

          {report && (
            <>
              {/* Badges */}
              <div style={{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'14px', flexWrap:'wrap' }}>
                <RiskLevelBadge level={report.risk_level} />
                <span style={{
                  display:'inline-block', padding:'3px 10px', borderRadius:'12px', fontSize:'11px', fontWeight:600,
                  textTransform:'uppercase', letterSpacing:'0.05em',
                  background: report.is_sanctioned ? 'rgba(248,81,73,0.15)' : 'rgba(63,185,80,0.15)',
                  color: report.is_sanctioned ? '#f85149' : '#3fb950',
                  border: `1px solid ${report.is_sanctioned ? 'rgba(248,81,73,0.3)' : 'rgba(63,185,80,0.3)'}`,
                }}>
                  {report.is_sanctioned ? 'Sanctioned' : 'Not Sanctioned'}
                </span>
                {report.market_info?.sector && (
                  <span style={{ fontSize:'11px', color:'#8b949e' }}>{report.market_info.sector}</span>
                )}
              </div>

              {/* Narrative */}
              {report.narrative && (
                <div style={{ background:'#161b22', border:'1px solid #30363d', borderRadius:'6px', padding:'12px 14px', fontSize:'13px', lineHeight:'1.65', color:'#c9d1d9', marginBottom:'4px' }}>
                  {report.narrative}
                </div>
              )}

              {/* Risk Indicators */}
              {report.risk_indicators.length > 0 && (
                <>
                  <SectionTitle>Risk Indicators</SectionTitle>
                  {report.risk_indicators.map((ind, i) => <IndicatorRow key={i} ind={ind} />)}
                </>
              )}

              {/* Sanctions Details */}
              {report.sanction_details?.length > 0 && (
                <>
                  <SectionTitle>Sanctions Matches</SectionTitle>
                  {report.sanction_details.map((d, i) => (
                    <div key={i} style={{ background:'rgba(248,81,73,0.06)', border:'1px solid rgba(248,81,73,0.15)', borderRadius:'5px', padding:'8px 10px', marginBottom:'6px' }}>
                      <div style={{ fontSize:'12px', fontWeight:600, color:'#f85149' }}>{d.name}</div>
                      <div style={{ fontSize:'11px', color:'#8b949e', marginTop:'3px' }}>
                        Score: {(d.score * 100).toFixed(0)}%
                        {d.programs.length > 0 && <> · {d.programs.join(', ')}</>}
                      </div>
                      {d.remarks && <div style={{ fontSize:'11px', color:'#6e7681', marginTop:'4px', fontStyle:'italic' }}>{d.remarks}</div>}
                    </div>
                  ))}
                </>
              )}

              {/* Sanction programs chips */}
              {!report.sanction_details?.length && report.sanction_programs.length > 0 && (
                <>
                  <SectionTitle>Sanction Programs</SectionTitle>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'6px', marginTop:'4px' }}>
                    {report.sanction_programs.map((p) => (
                      <span key={p} style={{ background:'rgba(248,81,73,0.12)', border:'1px solid rgba(248,81,73,0.25)', color:'#f85149', borderRadius:'4px', padding:'2px 8px', fontSize:'11px', fontWeight:500 }}>{p}</span>
                    ))}
                  </div>
                </>
              )}

              {/* Market data */}
              {report.market_info && (
                <>
                  <SectionTitle>Market Data ({report.market_info.ticker})</SectionTitle>
                  {report.market_info.current_price != null && (
                    <KV label="Price" highlight>
                      ${report.market_info.current_price.toFixed(2)}
                      {report.market_info.change_pct != null && (
                        <span style={{ marginLeft:8, fontSize:'11px', color: report.market_info.change_pct >= 0 ? '#3fb950' : '#f85149' }}>
                          {report.market_info.change_pct >= 0 ? '+' : ''}{report.market_info.change_pct.toFixed(2)}%
                        </span>
                      )}
                    </KV>
                  )}
                  {report.market_info.market_cap != null && <KV label="Market Cap">{fmtMC(report.market_info.market_cap)}</KV>}
                  {report.market_info.industry && <KV label="Industry">{report.market_info.industry}</KV>}
                  {report.market_info.exchange && <KV label="Exchange">{report.market_info.exchange}</KV>}

                  {/* 52-week range bar */}
                  {report.market_info.fifty_two_week_low != null && report.market_info.fifty_two_week_high != null && report.market_info.current_price != null && (
                    <div style={{ marginTop:'8px' }}>
                      <div style={{ fontSize:'11px', color:'#8b949e', marginBottom:'2px' }}>
                        52-Week Range
                        {report.market_info.pct_from_52w_high != null && (
                          <span style={{ marginLeft:8, color: report.market_info.pct_from_52w_high < -20 ? '#f85149' : '#8b949e' }}>
                            ({report.market_info.pct_from_52w_high > 0 ? '+' : ''}{report.market_info.pct_from_52w_high.toFixed(1)}% vs high)
                          </span>
                        )}
                      </div>
                      <RangeBar low={report.market_info.fifty_two_week_low} high={report.market_info.fifty_two_week_high} current={report.market_info.current_price} />
                    </div>
                  )}

                  {/* Analyst consensus */}
                  {(report.market_info.analyst_target || report.market_info.analyst_recommendation) && (
                    <div style={{ marginTop:'8px', background:'rgba(88,166,255,0.06)', border:'1px solid rgba(88,166,255,0.15)', borderRadius:'5px', padding:'8px 10px' }}>
                      <div style={{ fontSize:'11px', color:'#8b949e', marginBottom:'4px' }}>
                        Analyst Consensus{report.market_info.analyst_count ? ` (${report.market_info.analyst_count} analysts)` : ''}
                      </div>
                      <div style={{ display:'flex', gap:'16px', alignItems:'center' }}>
                        {report.market_info.analyst_recommendation && (
                          <span style={{ fontSize:'13px', fontWeight:600, color:'#58a6ff', textTransform:'uppercase' }}>
                            {report.market_info.analyst_recommendation}
                          </span>
                        )}
                        {report.market_info.analyst_target && report.market_info.current_price && (
                          <span style={{ fontSize:'12px', color:'#8b949e' }}>
                            Target: ${report.market_info.analyst_target.toFixed(2)}
                            <span style={{ marginLeft:6, color: report.market_info.analyst_target > report.market_info.current_price ? '#3fb950' : '#f85149' }}>
                              ({report.market_info.analyst_target > report.market_info.current_price ? '+' : ''}{((report.market_info.analyst_target / report.market_info.current_price - 1) * 100).toFixed(1)}% implied)
                            </span>
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Company description */}
                  {report.market_info.description && (
                    <div style={{ fontSize:'12px', color:'#6e7681', marginTop:'10px', lineHeight:'1.55', fontStyle:'italic' }}>
                      {report.market_info.description}
                    </div>
                  )}
                </>
              )}

              {/* Institutional exposure */}
              {report.exposure && report.exposure.top_holders.length > 0 && (
                <>
                  <SectionTitle>Institutional Exposure</SectionTitle>
                  {report.exposure.total_institutional_usd != null && (
                    <div style={{ fontSize:'12px', color:'#8b949e', marginBottom:'8px' }}>
                      Total tracked: <strong style={{ color:'#c9d1d9' }}>{fmtUSD(report.exposure.total_institutional_usd)}</strong>
                      {report.exposure.pension_count > 0 && (
                        <span style={{ marginLeft:8, color:'#f8c135' }}>· {report.exposure.pension_count} pension/sovereign fund(s)</span>
                      )}
                    </div>
                  )}
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign:'left', color:'#8b949e', fontWeight:500, padding:'4px 0', borderBottom:'1px solid #30363d', fontSize:'10px', textTransform:'uppercase' }}>Holder</th>
                        <th style={{ textAlign:'right', color:'#8b949e', fontWeight:500, padding:'4px 0', borderBottom:'1px solid #30363d', fontSize:'10px', textTransform:'uppercase' }}>% Held</th>
                        <th style={{ textAlign:'right', color:'#8b949e', fontWeight:500, padding:'4px 0', borderBottom:'1px solid #30363d', fontSize:'10px', textTransform:'uppercase' }}>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.exposure.top_holders.map((h, i) => (
                        <tr key={i}>
                          <td style={{ padding:'6px 0', borderBottom:'1px solid #1a1f27', color: h.is_pension ? '#f8c135' : '#c9d1d9' }}>
                            {h.name}
                            {h.is_pension && <span style={{ marginLeft:5, fontSize:'9px', background:'rgba(248,193,53,0.15)', color:'#e3b341', border:'1px solid rgba(248,193,53,0.25)', borderRadius:'3px', padding:'1px 4px' }}>PENSION</span>}
                          </td>
                          <td style={{ padding:'6px 0', borderBottom:'1px solid #1a1f27', textAlign:'right', color:'#c9d1d9' }}>
                            {h.pct_held != null ? `${h.pct_held.toFixed(2)}%` : '—'}
                          </td>
                          <td style={{ padding:'6px 0', borderBottom:'1px solid #1a1f27', textAlign:'right', color:'#8b949e' }}>
                            {fmtUSD(h.value_usd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {/* Officers */}
              {report.officers?.length > 0 && (
                <>
                  <SectionTitle>Key Officers</SectionTitle>
                  {report.officers.map((o, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #1a1f27', fontSize:'12px' }}>
                      <span style={{ color:'#c9d1d9' }}>{o.name}</span>
                      <span style={{ color:'#8b949e' }}>{o.role}</span>
                    </div>
                  ))}
                </>
              )}

              {/* Offshore / ICIJ */}
              {report.offshore_flags?.length > 0 && (
                <>
                  <SectionTitle>ICIJ Offshore Connections</SectionTitle>
                  {report.offshore_flags.map((f, i) => (
                    <div key={i} style={{ background:'rgba(240,136,62,0.08)', border:'1px solid rgba(240,136,62,0.2)', borderRadius:'4px', padding:'7px 10px', marginBottom:'5px', fontSize:'12px' }}>
                      <span style={{ color:'#f0883e', fontWeight:500 }}>{f.entity}</span>
                      {f.jurisdiction && <span style={{ color:'#8b949e', marginLeft:8 }}>{f.jurisdiction}</span>}
                      {f.dataset && <span style={{ color:'#484f58', marginLeft:8, fontSize:'11px' }}>{f.dataset}</span>}
                    </div>
                  ))}
                </>
              )}

              {/* Corporate info */}
              {Object.keys(report.corporate_info).length > 0 && (
                <>
                  <SectionTitle>Corporate Record</SectionTitle>
                  {report.corporate_info.legal_name && <KV label="Legal Name">{report.corporate_info.legal_name}</KV>}
                  {report.corporate_info.lei && <KV label="LEI"><span style={{ fontFamily:'monospace', fontSize:'11px' }}>{report.corporate_info.lei}</span></KV>}
                  {report.corporate_info.status && (
                    <KV label="Status">
                      <span style={{ color: report.corporate_info.status === 'ACTIVE' || report.corporate_info.status === 'ISSUED' ? '#3fb950' : '#8b949e' }}>
                        {report.corporate_info.status}
                      </span>
                    </KV>
                  )}
                  {report.corporate_info.incorporation_date && <KV label="Incorporated">{report.corporate_info.incorporation_date}</KV>}
                  {report.corporate_info.registered_address && (
                    <KV label="Address"><span style={{ fontSize:'11px' }}>{report.corporate_info.registered_address}</span></KV>
                  )}
                </>
              )}

              {/* Sources */}
              {report.sources.length > 0 && (
                <div style={{ fontSize:'11px', color:'#484f58', marginTop:'16px', paddingTop:'10px', borderTop:'1px solid #21262d' }}>
                  Sources: {report.sources.join(' · ')}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
