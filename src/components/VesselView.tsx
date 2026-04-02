import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Chart, LinearScale, Tooltip } from 'chart.js'
import { SankeyController, Flow } from 'chartjs-chart-sankey'
import type { VesselTrackResponse, RoutePoint, OwnershipLink, SankeyFlow } from '../types'
import NarrativeCard from './NarrativeCard'
import GraphViewer from './GraphViewer'

Chart.register(LinearScale, Tooltip, SankeyController, Flow)

interface Props {
  data: VesselTrackResponse
}

function vf(vessel: Record<string, unknown>, key: string): string {
  const v = vessel[key]
  if (v === null || v === undefined || v === '') return '—'
  if (key === 'deadweight' && typeof v === 'number' && v > 0)
    return v.toLocaleString() + ' t'
  if (key === 'speed' && v != null) return v + ' kn'
  return String(v)
}

function fmtSpan(sec: number): string {
  const h = Math.round(sec / 3600)
  if (h < 1) return Math.round(sec / 60) + 'min'
  if (h < 48) return h + 'h'
  return Math.round(h / 24) + 'd'
}

type MapRange = 'recent' | 'half' | 'all'

function VesselMap({ routeHistory }: { routeHistory: RoutePoint[] }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const routeLayer = useRef<L.Polyline | null>(null)
  const markerList = useRef<L.CircleMarker[]>([])
  const [range, setRange] = useState<MapRange>('all')
  const [toggleLabels, setToggleLabels] = useState<{ recent: string; half: string; all: string }>({
    recent: 'Recent', half: 'Half', all: 'All',
  })
  const [cadenceNote, setCadenceNote] = useState('')

  const points = routeHistory.filter((p) => p.lat && p.lon)
  const hasData = points.length > 0

  useEffect(() => {
    if (!mapRef.current) return
    if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null }

    const map = L.map(mapRef.current, { zoomControl: true, attributionControl: true })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19,
    }).addTo(map)
    mapInstance.current = map

    if (!hasData) return

    const now = Date.now() / 1000
    const timestamps = points.map((p) => p.ts || 0).filter((t) => t > 0)
    if (timestamps.length) {
      const oldest = Math.min(...timestamps)
      const spanSec = now - oldest
      const t1 = Math.round(spanSec / 3)
      const t2 = Math.round((spanSec * 2) / 3)
      setToggleLabels({
        recent: 'Last ' + fmtSpan(t1),
        half: 'Last ' + fmtSpan(t2),
        all: 'All (' + fmtSpan(spanSec) + ')',
      })
      if (timestamps.length >= 2) {
        const avgGap = spanSec / (timestamps.length - 1)
        const cadence = avgGap < 3600
          ? Math.round(avgGap / 60) + 'min intervals'
          : fmtSpan(avgGap) + ' intervals'
        setCadenceNote(timestamps.length + ' positions · ' + cadence)
      }
    }

    return () => { map.remove(); mapInstance.current = null }
  }, [hasData, points.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapInstance.current
    if (!map || !hasData) return

    if (routeLayer.current) { map.removeLayer(routeLayer.current); routeLayer.current = null }
    markerList.current.forEach((m) => map.removeLayer(m))
    markerList.current = []

    const now = Date.now() / 1000
    const timestamps = points.map((p) => p.ts || 0).filter((t) => t > 0)
    const oldest = timestamps.length ? Math.min(...timestamps) : 0
    const totalSpan = now - oldest

    let filtered: RoutePoint[]
    if (range === 'all' || !timestamps.length) {
      filtered = points
    } else if (range === 'recent') {
      const cutoff = now - totalSpan / 3
      filtered = points.filter((p) => (p.ts || 0) >= cutoff)
    } else {
      const cutoff = now - (totalSpan * 2) / 3
      filtered = points.filter((p) => (p.ts || 0) >= cutoff)
    }
    if (!filtered.length) filtered = points

    const latLngs: [number, number][] = filtered.map((p) => [p.lat, p.lon])
    routeLayer.current = L.polyline(latLngs, {
      color: '#58a6ff', weight: 3, opacity: 0.8, dashArray: '8 4',
    }).addTo(map)

    filtered.forEach((p, i) => {
      const isLast = i === filtered.length - 1
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: isLast ? 7 : 4,
        fillColor: isLast ? '#3fb950' : '#58a6ff',
        color: isLast ? '#fff' : '#30363d',
        weight: isLast ? 2 : 1,
        fillOpacity: 0.8,
      }).addTo(map)
      const time = p.ts ? new Date(p.ts * 1000).toLocaleString() : '—'
      marker.bindPopup(
        `<b>${time}</b><br>Lat: ${p.lat.toFixed(4)}, Lon: ${p.lon.toFixed(4)}<br>Speed: ${p.speed || 0} kn`
      )
      markerList.current.push(marker)
    })

    if (latLngs.length) {
      map.fitBounds(L.latLngBounds(latLngs).pad(0.5), { maxZoom: 6 })
    }
  }, [range, hasData]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="info-card view-section">
      <h3>AIS Route Map</h3>
      <div className="map-range-toggles">
        {(['recent', 'half', 'all'] as MapRange[]).map((r) => (
          <button
            key={r}
            className={`map-range-btn${range === r ? ' active' : ''}`}
            onClick={() => setRange(r)}
          >
            {toggleLabels[r]}
          </button>
        ))}
        {cadenceNote && (
          <span style={{ color: '#484f58', fontSize: '11px', marginLeft: '12px', alignSelf: 'center' }}>
            {cadenceNote}
          </span>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <div
          ref={mapRef}
          style={{
            height: '420px', borderRadius: '8px', marginTop: '12px',
            background: '#0d1117', border: '1px solid #30363d',
            opacity: hasData ? 1 : 0.3,
          }}
        />
        {!hasData && (
          <div className="graph-empty" style={{ top: '50%', position: 'absolute' }}>
            No AIS position data available
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sankey diagram ───────────────────────────────────────────────────────────

function TradeFlowSankey({ flows, labels }: { flows: SankeyFlow[]; labels?: Record<string, string> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current || flows.length === 0) return
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }

    const agg = new Map<string, number>()
    for (const f of flows) {
      const key = `${f.source}\x00${f.target}`
      agg.set(key, (agg.get(key) || 0) + (f.value || 1))
    }
    const sankeyData = Array.from(agg.entries()).map(([key, flow]) => {
      const [from, to] = key.split('\x00')
      return { from, to, flow }
    })

    const palette = ['#58a6ff','#3fb950','#f0883e','#a371f7','#f85149','#79c0ff','#56d364','#d2a8ff']
    const nodeColors: Record<string, string> = {}
    let ci = 0
    for (const d of sankeyData) {
      if (!nodeColors[d.from]) nodeColors[d.from] = palette[ci++ % palette.length]
      if (!nodeColors[d.to])   nodeColors[d.to]   = palette[ci++ % palette.length]
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chartRef.current = new Chart(canvasRef.current, {
      type: 'sankey',
      data: {
        datasets: [{
          data: sankeyData,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          colorFrom: (c: any) => nodeColors[c.dataset?.data?.[c.dataIndex]?.from] || '#58a6ff',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          colorTo:   (c: any) => nodeColors[c.dataset?.data?.[c.dataIndex]?.to]   || '#3fb950',
          colorMode: 'gradient',
          labels: labels || {},
          borderWidth: 0,
          nodeWidth: 14,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              label: (ctx: any) => `${ctx.raw?.from} → ${ctx.raw?.to}: ${ctx.raw?.flow} shipments`,
            },
          },
        },
      },
    } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    return () => { chartRef.current?.destroy(); chartRef.current = null }
  }, [flows, labels])

  if (flows.length === 0) return <p style={{ color: '#484f58', fontSize: '13px' }}>No trade flow data available.</p>
  return <div style={{ height: 320, position: 'relative' }}><canvas ref={canvasRef} /></div>
}

// ── Ownership chain ───────────────────────────────────────────────────────────

function OwnershipChain({ chain }: { chain: OwnershipLink[] }) {
  if (chain.length === 0) return <p style={{ color: '#484f58', fontSize: '13px' }}>No Sayari ownership data.</p>

  const sorted = [...chain].sort((a, b) => a.depth - b.depth)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sorted.map((link, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          paddingLeft: (link.depth - 1) * 20,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: link.is_sanctioned ? '#f85149' : link.is_pep ? '#f0883e' : '#58a6ff',
          }} />
          <span style={{ fontSize: 13, color: link.is_sanctioned ? '#f85149' : '#e6edf3', fontWeight: link.depth === 1 ? 600 : 400 }}>
            {link.name}
          </span>
          {link.entity_type && (
            <span style={{ fontSize: 10, color: '#8b949e', background: '#21262d', padding: '1px 6px', borderRadius: 4 }}>
              {link.entity_type}
            </span>
          )}
          {link.country && (
            <span style={{ fontSize: 11, color: '#8b949e' }}>{link.country}</span>
          )}
          {link.ownership_percentage != null && (
            <span style={{ fontSize: 11, color: '#3fb950' }}>{link.ownership_percentage.toFixed(1)}%</span>
          )}
          {link.is_sanctioned && (
            <span style={{ fontSize: 10, color: '#f85149', fontWeight: 700 }}>SANCTIONED</span>
          )}
          {link.is_pep && !link.is_sanctioned && (
            <span style={{ fontSize: 10, color: '#f0883e' }}>PEP</span>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VesselView({ data }: Props) {
  const { vessel, is_sanctioned, sanctions_matches, route_history } = data
  const [graphTab, setGraphTab] = useState<'ownership' | 'trade'>('ownership')

  const hasOwnershipGraph = data.graph.nodes.length > 0
  const hasTradeGraph = (data.trade_graph?.nodes?.length ?? 0) > 0
  const hasAnyGraph = hasOwnershipGraph || hasTradeGraph

  const ta = data.trade_activity
  const sankeyFlows = ta?.sankey_flows && ta.sankey_flows.length > 0
    ? ta.sankey_flows
    : (() => {
        // client-side fallback: build two-hop flows from records
        const counts = new Map<string, number>()
        for (const r of (ta?.records ?? [])) {
          if (r.departure_country && r.arrival_country && r.commodity_category) {
            const key = `${r.departure_country} (origin)\x00${r.commodity_category}\x00${r.arrival_country} (dest)`
            counts.set(key, (counts.get(key) || 0) + 1)
          }
        }
        const flows: SankeyFlow[] = []
        for (const [key, v] of counts) {
          const [src, mid, dst] = key.split('\x00')
          flows.push({ source: src, target: mid, value: v })
          flows.push({ source: mid, target: dst, value: v })
        }
        return flows
      })()

  const stats = [
    { label: 'Vessel Name', value: vf(vessel, 'name') },
    { label: 'IMO', value: vf(vessel, 'imo') },
    { label: 'MMSI', value: vf(vessel, 'mmsi') },
    { label: 'Flag', value: vf(vessel, 'flag') },
    { label: 'Type', value: vf(vessel, 'vessel_type') },
    { label: 'DWT', value: vf(vessel, 'deadweight') },
    { label: 'Speed', value: vf(vessel, 'speed') },
    { label: 'Destination', value: vf(vessel, 'destination') },
    { label: 'Status', value: vf(vessel, 'status') },
  ]

  return (
    <div id="resultsPanel">
      <NarrativeCard narrative={data.narrative} />

      {/* 9-tile stat grid */}
      <div className="vessel-stat-grid">
        {stats.map((s) => (
          <div key={s.label} className="vessel-stat">
            <div className="v-label">{s.label}</div>
            <div className="v-value">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Sanctions + AIS track */}
      <div className="view-grid">
        <div className="info-card">
          <h3>Sanctions Status</h3>
          <div style={{ marginTop: '8px' }}>
            {is_sanctioned ? (
              <>
                <span className="sanctions-badge sanctioned">🚨 OFAC LISTED</span>
                <ul style={{ marginTop: '8px', listStyle: 'none', padding: 0 }}>
                  {sanctions_matches.slice(0, 3).map((m, i) => (
                    <li key={i} style={{ fontSize: '12px', color: '#f85149', padding: '4px 0' }}>
                      {m.name} (score: {(m.score || 0).toFixed(2)})
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <span className="sanctions-badge clear">✓ No OFAC Vessel Match</span>
            )}
          </div>
          {/* Countries visited */}
          {(data.countries_visited?.length ?? 0) > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                Countries Visited
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {data.countries_visited.map((c) => (
                  <span key={c} style={{ fontSize: 11, background: '#21262d', border: '1px solid #30363d', borderRadius: 4, padding: '2px 7px', color: '#c9d1d9' }}>{c}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="info-card">
          <h3>Recent AIS Track</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="view-table">
              <thead><tr><th>Lat</th><th>Lon</th><th>Speed</th></tr></thead>
              <tbody>
                {route_history.slice(-12).length > 0
                  ? route_history.slice(-12).map((p, i) => (
                      <tr key={i}>
                        <td>{p.lat || '—'}</td>
                        <td>{p.lon || '—'}</td>
                        <td>{p.speed != null ? p.speed + ' kn' : '—'}</td>
                      </tr>
                    ))
                  : <tr><td colSpan={3} style={{ color: '#484f58' }}>No AIS track data</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Beneficial Ownership Chain */}
      {(data.ownership_chain?.length ?? 0) > 0 && (
        <div className="info-card" style={{ marginTop: 20 }}>
          <h3>
            Beneficial Ownership Chain
            {data.owner_name && <span style={{ fontSize: 12, color: '#8b949e', fontWeight: 400, marginLeft: 8 }}>— {data.owner_name}</span>}
            <span style={{ fontSize: 11, color: '#58a6ff', fontWeight: 400, marginLeft: 8 }}>(Sayari Graph)</span>
          </h3>
          <div style={{ marginTop: 10 }}>
            <OwnershipChain chain={data.ownership_chain} />
          </div>
        </div>
      )}

      {/* Port Calls */}
      {(data.port_calls?.length ?? 0) > 0 && (
        <div className="info-card" style={{ marginTop: 20 }}>
          <h3>Port Calls <span style={{ fontSize: 11, color: '#8b949e', fontWeight: 400 }}>(last 90 days)</span></h3>
          <div style={{ overflowX: 'auto', marginTop: 8 }}>
            <table className="view-table">
              <thead><tr><th>Port</th><th>Country</th><th>Arrival</th><th>Departure</th></tr></thead>
              <tbody>
                {data.port_calls.map((pc, i) => (
                  <tr key={i}>
                    <td>{pc.port_name || '—'}</td>
                    <td>{pc.country || '—'}</td>
                    <td style={{ fontSize: 11 }}>{pc.arrival ? new Date(pc.arrival).toLocaleDateString() : '—'}</td>
                    <td style={{ fontSize: 11 }}>{pc.departure ? new Date(pc.departure).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trade Activity */}
      {ta && ta.record_count > 0 && (
        <div className="info-card" style={{ marginTop: 20 }}>
          <h3>
            Trade Activity
            <span style={{ fontSize: 11, color: '#58a6ff', fontWeight: 400, marginLeft: 8 }}>(Sayari Graph — {ta.record_count} records)</span>
          </h3>

          {/* Top HS codes */}
          {ta.top_hs_codes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0' }}>
              {ta.top_hs_codes.map((hs, i) => (
                <span key={i} style={{ fontSize: 11, background: '#161b22', border: '1px solid #30363d', borderRadius: 4, padding: '2px 8px', color: '#8b949e' }}>
                  {hs.description || hs.code}
                </span>
              ))}
            </div>
          )}

          {/* Sankey diagram */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
              Trade Flow Diagram
            </div>
            <TradeFlowSankey flows={sankeyFlows} labels={ta.sankey_labels || {}} />
          </div>

          {/* Shipment records table */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
              Recent Shipments
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="view-table">
                <thead>
                  <tr><th>Date</th><th>Supplier</th><th>Buyer</th><th>Route</th><th>Commodity</th></tr>
                </thead>
                <tbody>
                  {ta.records.slice(0, 12).map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 11 }}>{r.date || '—'}</td>
                      <td style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.supplier}>{r.supplier || '—'}</td>
                      <td style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.buyer}>{r.buyer || '—'}</td>
                      <td style={{ fontSize: 11, color: '#8b949e' }}>{r.departure_country || '?'} → {r.arrival_country || '?'}</td>
                      <td style={{ fontSize: 11, color: '#8b949e' }}>{r.commodity_category || r.hs_code || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* AIS Route Map */}
      <VesselMap routeHistory={route_history} />

      {/* Tabbed graphs: ownership network + trade network */}
      {hasAnyGraph && (
        <div className="info-card" style={{ marginTop: 20 }}>
          {(hasOwnershipGraph && hasTradeGraph) && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
              {(['ownership', 'trade'] as const).map((tab) => (
                <button key={tab} onClick={() => setGraphTab(tab)} style={{
                  padding: '5px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${graphTab === tab ? '#58a6ff' : '#30363d'}`,
                  borderRadius: 6, background: graphTab === tab ? 'rgba(88,166,255,0.1)' : 'transparent',
                  color: graphTab === tab ? '#58a6ff' : '#8b949e',
                }}>
                  {tab === 'ownership' ? 'Ownership & Sanctions Network' : 'Trade Network'}
                </button>
              ))}
            </div>
          )}
          {!hasOwnershipGraph || !hasTradeGraph ? (
            <h3>{hasOwnershipGraph ? 'Ownership & Sanctions Network' : 'Trade Network'}</h3>
          ) : null}
          <div style={{ height: 400 }}>
            {graphTab === 'ownership' && hasOwnershipGraph && (
              <GraphViewer nodes={data.graph.nodes} edges={data.graph.edges} />
            )}
            {graphTab === 'trade' && hasTradeGraph && (
              <GraphViewer nodes={data.trade_graph!.nodes} edges={data.trade_graph!.edges} />
            )}
            {graphTab === 'ownership' && !hasOwnershipGraph && hasTradeGraph && (
              <GraphViewer nodes={data.trade_graph!.nodes} edges={data.trade_graph!.edges} />
            )}
          </div>
        </div>
      )}

      <div className="source-chips" style={{ marginTop: '24px' }}>
        {data.sources.map((s) => (
          <span key={s} className="source-chip">{s}</span>
        ))}
      </div>
    </div>
  )
}
