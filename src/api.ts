import type { HealthResponse, SanctionsImpactResponse, EntityGraphResponse } from './types'

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  if (!text) throw new Error(`Server returned empty response (HTTP ${res.status})`)
  try {
    const data = JSON.parse(text)
    if (!res.ok) throw new Error(data.detail || data.message || `Request failed (HTTP ${res.status})`)
    return data as T
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(`Server returned non-JSON response (HTTP ${res.status})`)
    }
    throw e
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health')
  return parseJson<HealthResponse>(res)
}

export async function fetchSanctionsImpact(ticker: string): Promise<SanctionsImpactResponse> {
  const res = await fetch('/api/sanctions-impact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker }),
  })
  return parseJson<SanctionsImpactResponse>(res)
}

export async function fetchEntityGraph(query: string): Promise<EntityGraphResponse> {
  const res = await fetch('/api/entity-graph', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return parseJson<EntityGraphResponse>(res)
}
