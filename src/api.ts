import type { HealthResponse, SanctionsImpactResponse, EntityGraphResponse } from './types'

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health')
  return res.json()
}

export async function fetchSanctionsImpact(ticker: string): Promise<SanctionsImpactResponse> {
  const res = await fetch('/api/sanctions-impact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Request failed')
  return data
}

export async function fetchEntityGraph(query: string): Promise<EntityGraphResponse> {
  const res = await fetch('/api/entity-graph', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Graph unavailable')
  return data
}
