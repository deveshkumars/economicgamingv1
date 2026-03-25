import type { HealthResponse, SanctionsImpactResponse, EntityGraphResponse } from './types'

const API_BASE =
  ((import.meta.env.VITE_API_BASE_URL as string | undefined) ||
    'https://economic-warfare-osint.onrender.com'
  ).replace(/\/$/, '')

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
  const url = `${API_BASE}/api/health`
  const res = await fetch(url)
  return parseJson<HealthResponse>(res)
}

export async function fetchSanctionsImpact(ticker: string): Promise<SanctionsImpactResponse> {
  const url = `${API_BASE}/api/sanctions-impact`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker }),
  })
  return parseJson<SanctionsImpactResponse>(res)
}

export async function fetchEntityGraph(query: string): Promise<EntityGraphResponse> {
  const url = `${API_BASE}/api/entity-graph`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return parseJson<EntityGraphResponse>(res)
}
