import type {
  HealthResponse,
  EntityResolution,
  SanctionsImpactResponse,
  PersonProfileResponse,
  VesselTrackResponse,
  SectorAnalysisResponse,
  EntityGraphResponse,
} from './types'

const API_BASE =
  ((import.meta.env.VITE_API_BASE_URL as string | undefined) ||
    'http://localhost:8000'
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
  const res = await fetch(`${API_BASE}/api/health`)
  return parseJson<HealthResponse>(res)
}

export async function fetchEntityResolution(query: string): Promise<EntityResolution> {
  const res = await fetch(`${API_BASE}/api/resolve-entity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return parseJson<EntityResolution>(res)
}

export async function fetchSanctionsImpact(ticker: string): Promise<SanctionsImpactResponse> {
  const res = await fetch(`${API_BASE}/api/sanctions-impact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticker }),
  })
  return parseJson<SanctionsImpactResponse>(res)
}

export async function fetchPersonProfile(name: string): Promise<PersonProfileResponse> {
  const res = await fetch(`${API_BASE}/api/person-profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return parseJson<PersonProfileResponse>(res)
}

export async function fetchVesselTrack(query: string): Promise<VesselTrackResponse> {
  const res = await fetch(`${API_BASE}/api/vessel-track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return parseJson<VesselTrackResponse>(res)
}

export async function fetchSectorAnalysis(sector: string): Promise<SectorAnalysisResponse> {
  const res = await fetch(`${API_BASE}/api/sector-analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sector }),
  })
  return parseJson<SectorAnalysisResponse>(res)
}

export async function fetchEntityGraph(query: string): Promise<EntityGraphResponse> {
  const res = await fetch(`${API_BASE}/api/entity-graph`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return parseJson<EntityGraphResponse>(res)
}
