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
  SayariResolveResponse,
  SayariTraversalResponse,
  SayariUBOResponse,
  EntityRiskReport,
  SanctionsScreenBatchResponse,
} from './types'

const API_BASE =
  ((import.meta.env.VITE_API_BASE_URL as string | undefined) ||
    ''
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

// --- Sayari ---

export async function fetchSayariResolve(query: string, entityType?: string): Promise<SayariResolveResponse> {
  const url = `${API_BASE}/api/sayari/resolve`
  const body: Record<string, unknown> = { query }
  if (entityType) body.entity_type = entityType
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson<SayariResolveResponse>(res)
}

export async function fetchSayariRelated(entityId: string, depth = 1, limit = 20): Promise<SayariTraversalResponse> {
  const url = `${API_BASE}/api/sayari/related`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_id: entityId, depth, limit }),
  })
  return parseJson<SayariTraversalResponse>(res)
}

export async function fetchEntityRiskReport(
  name: string,
  entityType: string,
  ticker?: string,
  lei?: string,
): Promise<EntityRiskReport> {
  const url = `${API_BASE}/api/entity-risk-report`
  const body: Record<string, unknown> = { name, entity_type: entityType }
  if (ticker) body.ticker = ticker
  if (lei) body.lei = lei
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson<EntityRiskReport>(res)
}

export async function fetchSanctionsScreenBatch(names: string[]): Promise<SanctionsScreenBatchResponse> {
  const url = `${API_BASE}/api/sanctions/screen-batch`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names }),
  })
  return parseJson<SanctionsScreenBatchResponse>(res)
}

export async function fetchFollowUp(
  question: string,
  contextType: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: Record<string, any>,
  history: { role: 'user' | 'assistant'; text: string }[] = [],
): Promise<{ answer: string }> {
  const url = `${API_BASE}/api/followup`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, context_type: contextType, context, history }),
  })
  return parseJson<{ answer: string }>(res)
}

export async function fetchSayariUBO(entityId: string): Promise<SayariUBOResponse> {
  const url = `${API_BASE}/api/sayari/ubo`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entity_id: entityId }),
  })
  return parseJson<SayariUBOResponse>(res)
}
