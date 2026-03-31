import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { VesselTrackResponse, RoutePoint } from '../types'
import NarrativeCard from './NarrativeCard'
import GraphViewer from './GraphViewer'

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

export default function VesselView({ data }: Props) {
  const { vessel, is_sanctioned, sanctions_matches, route_history } = data
  const hasGraph = data.graph.nodes.length > 0

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

      {/* Sanctions + route table */}
      <div className="view-grid">
        <div className="info-card">
          <h3>Sanctions Status</h3>
          <div style={{ marginTop: '8px' }}>
            {is_sanctioned ? (
              <>
                <span className="sanctions-badge sanctioned">🚨 OFAC LISTED</span>
                <ul style={{ marginTop: '8px', listStyle: 'none' }}>
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
        </div>

        <div className="info-card">
          <h3>Recent AIS Track (last 14 days)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="view-table">
              <thead>
                <tr>
                  <th>Lat</th>
                  <th>Lon</th>
                  <th>Speed</th>
                </tr>
              </thead>
              <tbody>
                {route_history.slice(-12).length > 0
                  ? route_history.slice(-12).map((p, i) => (
                      <tr key={i}>
                        <td>{p.lat || '—'}</td>
                        <td>{p.lon || '—'}</td>
                        <td>{p.speed != null ? p.speed + ' kn' : '—'}</td>
                      </tr>
                    ))
                  : (
                      <tr>
                        <td colSpan={3} style={{ color: '#484f58' }}>No AIS track data available</td>
                      </tr>
                    )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* AIS Route Map */}
      <VesselMap routeHistory={route_history} />

      {/* Ownership & Sanctions Network */}
      {hasGraph && (
        <div className="graph-section">
          <div className="graph-section-header">Ownership &amp; Sanctions Network</div>
          <div className="graph-legend">
            {[
              { label: 'Vessel', color: '#2E8B57' },
              { label: 'Flag State', color: '#DC143C' },
              { label: 'Sanctions', color: '#F85149' },
            ].map((item) => (
              <span key={item.label} className="legend-item">
                <span className="legend-dot" style={{ background: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
          <div className="graph-container">
            <GraphViewer nodes={data.graph.nodes} edges={data.graph.edges} />
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
