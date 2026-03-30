import type {
  HealthResponse,
  SanctionsImpactResponse,
  EntityGraphResponse,
  EntityResolutionResponse,
  PersonProfileResponse,
  SectorAnalysisResponse,
  VesselTrackResponse,
  OrchestratorStatusResponse,
  StartAnalysisResponse,
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

export async function resolveEntity(query: string): Promise<EntityResolutionResponse> {
  const url = `${API_BASE}/api/resolve-entity`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return parseJson<EntityResolutionResponse>(res)
}

export async function fetchPersonProfile(name: string): Promise<PersonProfileResponse> {
  const url = `${API_BASE}/api/person-profile`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return parseJson<PersonProfileResponse>(res)
}

export async function fetchSectorAnalysis(sector: string): Promise<SectorAnalysisResponse> {
  const url = `${API_BASE}/api/sector-analysis`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sector }),
  })
  return parseJson<SectorAnalysisResponse>(res)
}

export async function startOrchestratorAnalysis(query: string): Promise<StartAnalysisResponse> {
  const url = `${API_BASE}/api/analyze`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return parseJson<StartAnalysisResponse>(res)
}

export async function pollAnalysisStatus(analysisId: string): Promise<OrchestratorStatusResponse> {
  const url = `${API_BASE}/api/analyze/${analysisId}`
  const res = await fetch(url)
  return parseJson<OrchestratorStatusResponse>(res)
}

export async function fetchVesselTrack(query: string): Promise<VesselTrackResponse> {
  const url = `${API_BASE}/api/vessel-track`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return parseJson<VesselTrackResponse>(res)
}
