import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { RoutePoint } from '../types'

interface Props {
  routeHistory: RoutePoint[]
  timeRange: '24h' | '1w' | '2w'
}

const CUTOFFS: Record<string, number> = { '24h': 86400, '1w': 604800, '2w': 1209600 }

export default function VesselMap({ routeHistory, timeRange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const routeLayerRef = useRef<L.Polyline | null>(null)
  const markersRef = useRef<L.CircleMarker[]>([])

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    mapRef.current = L.map(containerRef.current, { zoomControl: true, attributionControl: true })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    }).addTo(mapRef.current)

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // Redraw route when timeRange or data changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    // Clear previous layers
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current)
      routeLayerRef.current = null
    }
    markersRef.current.forEach((m) => map.removeLayer(m))
    markersRef.current = []

    const valid = routeHistory.filter((p) => p.lat && p.lon)
    if (!valid.length) return

    const now = Date.now() / 1000
    const cutoff = now - (CUTOFFS[timeRange] ?? CUTOFFS['2w'])
    const filtered = valid.filter((p) => (p.ts ?? 0) >= cutoff)
    const points = filtered.length ? filtered : valid

    const latLngs: [number, number][] = points.map((p) => [p.lat, p.lon])

    routeLayerRef.current = L.polyline(latLngs, {
      color: '#58a6ff',
      weight: 3,
      opacity: 0.8,
      dashArray: '8 4',
    }).addTo(map)

    points.forEach((p, i) => {
      const isLast = i === points.length - 1
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: isLast ? 7 : 4,
        fillColor: isLast ? '#3fb950' : '#58a6ff',
        color: isLast ? '#fff' : '#30363d',
        weight: isLast ? 2 : 1,
        fillOpacity: 0.8,
      }).addTo(map)

      const time = p.ts ? new Date(p.ts * 1000).toLocaleString() : '—'
      marker.bindPopup(
        `<b>${time}</b><br>Lat: ${p.lat.toFixed(4)}, Lon: ${p.lon.toFixed(4)}<br>Speed: ${p.speed ?? 0} kn`
      )
      markersRef.current.push(marker)
    })

    map.fitBounds(L.latLngBounds(latLngs).pad(0.5), { maxZoom: 6 })
  }, [routeHistory, timeRange])

  const hasData = routeHistory.some((p) => p.lat && p.lon)

  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={containerRef}
        style={{
          height: '380px',
          borderRadius: '6px',
          opacity: hasData ? 1 : 0.3,
          background: '#0d1117',
        }}
      />
      {!hasData && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#8b949e',
            fontSize: '13px',
            pointerEvents: 'none',
          }}
        >
          No AIS track data available
        </div>
      )}
    </div>
  )
}
