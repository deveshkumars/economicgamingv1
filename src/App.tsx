import { useEffect, useRef, useState } from 'react'
import {
  fetchHealth,
  fetchSanctionsImpact,
  fetchEntityGraph,
  resolveEntity,
  fetchPersonProfile,
  fetchSectorAnalysis,
  fetchVesselTrack,
  startOrchestratorAnalysis,
  pollAnalysisStatus,
} from './api'
import Header from './components/Header'
import QueryBox, { extractTicker } from './components/QueryBox'
import ProgressPanel from './components/ProgressPanel'
import ImpactInfoCards from './components/ImpactInfoCards'
import ImpactChart, { type ImpactChartHandle } from './components/ImpactChart'
import ProjectionSummary from './components/ProjectionSummary'
import ComparablesTable from './components/ComparablesTable'
import EntityGraphSection from './components/EntityGraphSection'
import PersonView from './components/PersonView'
import SectorView from './components/SectorView'
import VesselView from './components/VesselView'
import OrchestratorView from './components/OrchestratorView'
import NarrativeCard from './components/NarrativeCard'
import DebugPanel from './components/DebugPanel'
import type { EntityType } from './components/EntityTypeBadge'
import type {
  HealthResponse,
  SanctionsImpactResponse,
  EntityGraphResponse,
  ProgressEntry,
  PersonProfileResponse,
  SectorAnalysisResponse,
  VesselTrackResponse,
  ImpactAssessmentResult,
} from './types'
import './App.css'

type ViewMode = 'company' | 'person' | 'sector' | 'vessel' | 'orchestrator'

// Client-side sector keywords — avoids a round-trip to /api/resolve-entity
const SECTOR_KEYWORDS = [
  'semiconductor', 'chip', 'chips', 'semis', 'semiconductors',
  'energy', 'oil', 'gas', 'oil and gas',
  'shipping', 'maritime',
  'mro', 'aircraft mro', 'aviation mro', 'aviation maintenance', 'aircraft repair',
  'defense', 'defence', 'aerospace', 'defense aerospace', 'defense primes',
  'critical minerals', 'rare earth', 'rare earths', 'lithium', 'cobalt',
  'port', 'ports', 'logistics', 'port logistics',
  'financial', 'banking', 'finance', 'correspondent banking',
  'surveillance', 'dual use',
  'satellite', 'space', 'commercial space',
  'telecom', 'telecommunications',
]

// Natural language question patterns that should go straight to the orchestrator.
// These are compound/analytical questions — not simple entity lookups.
const ORCHESTRATOR_PATTERNS = [
  /^what (if|happens|would|is the impact|is the relationship)/i,
  /^how (would|does|has|will)/i,
  /^(analyze|analyse) (the|impact|relationship)/i,
  /\bif (we|the us|the eu|china|russia)\b/i,
  /relationship between/i,
  /\bimpact (of|on)\b/i,
  /\bexposure (of|to)\b/i,
  /\bsanction(s)? (the|their|its)\b/i,
  /\bsupply chain\b/i,
  /\bpension fund/i,
  /\bbeneficial owner/i,
  /\bmap (the|ownership)/i,
  /\bwhich .*(fund|bank|company|firm)/i,
]

function classifyClient(query: string): ViewMode | null {
  const raw = query.trim()
  const digits = raw.replace(/[\s-]/g, '')

  // Vessel: MMSI = 9 digits, IMO = 7 digits or "IMO" prefix
  if (/^\d{9}$/.test(digits)) return 'vessel'
  if (/^\d{7}$/.test(digits) || /^imo\s*\d/i.test(raw)) return 'vessel'

  // Natural language questions → orchestrator (before sector check)
  if (ORCHESTRATOR_PATTERNS.some((p) => p.test(raw))) return 'orchestrator'

  // Sector: exact or contained keyword match
  const lower = raw.toLowerCase()
  if (SECTOR_KEYWORDS.some((kw) => lower === kw)) return 'sector'
  if (SECTOR_KEYWORDS.some((kw) =>
    lower.startsWith(kw + ' ') || lower.endsWith(' ' + kw) || lower.includes(' ' + kw + ' ')
  )) return 'sector'

  return null
}

export default function App() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [entityTypeBadge, setEntityTypeBadge] = useState<{ type: EntityType; text?: string; showIcon?: boolean } | null>(null)
  const [progress, setProgress] = useState<ProgressEntry[]>([])
  const [mode, setMode] = useState<ViewMode | null>(null)

  const [impactData, setImpactData] = useState<SanctionsImpactResponse | null>(null)
  const [personData, setPersonData] = useState<PersonProfileResponse | null>(null)
  const [sectorData, setSectorData] = useState<SectorAnalysisResponse | null>(null)
  const [vesselData, setVesselData] = useState<VesselTrackResponse | null>(null)
  const [orchestratorData, setOrchestratorData] = useState<ImpactAssessmentResult | null>(null)
  const [graphData, setGraphData] = useState<EntityGraphResponse | null>(null)
  const [graphLoading, setGraphLoading] = useState(false)

  const [hiddenDatasets, setHiddenDatasets] = useState<Set<number>>(new Set())
  const chartRef = useRef<ImpactChartHandle>(null)

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => {})
  }, [])

  function addProgress(msg: string, type: ProgressEntry['type'] = 'step') {
    const time = new Date().toLocaleTimeString()
    setProgress((prev) => [...prev, { msg, type, time }])
  }

  function clearAll() {
    setQuery('')
    setLoading(false)
    setProgress([])
    setEntityTypeBadge(null)
    setMode(null)
    setImpactData(null)
    setPersonData(null)
    setSectorData(null)
    setVesselData(null)
    setOrchestratorData(null)
    setGraphData(null)
    setGraphLoading(false)
    setHiddenDatasets(new Set())
  }

  async function loadEntityGraph(ticker: string) {
    setGraphLoading(true)
    setGraphData(null)
    try {
      const data = await fetchEntityGraph(ticker)
      setGraphData(data)
    } catch {
      // non-critical
    } finally {
      setGraphLoading(false)
    }
  }

  async function startAnalysis(queryOverride?: string) {
    const raw = (queryOverride !== undefined ? queryOverride : query).trim()
    if (!raw) return

    setLoading(true)
    setEntityTypeBadge(null)
    setImpactData(null)
    setPersonData(null)
    setSectorData(null)
    setVesselData(null)
    setOrchestratorData(null)
    setGraphData(null)
    setGraphLoading(false)
    setProgress([])
    setHiddenDatasets(new Set())
    setMode(null)

    // Tier 1: client-side classification
    let detectedMode = classifyClient(raw)

    // Short-circuit: orchestrator-pattern queries skip the structured endpoints
    if (detectedMode === 'orchestrator') {
      setEntityTypeBadge({ type: 'sector', text: 'Deep Analysis', showIcon: false })
      setLoading(false)  // runOrchestratorAnalysis manages its own loading state
      await runOrchestratorAnalysis(raw)
      return
    }

    // Tier 2: API classification for ambiguous queries
    if (!detectedMode) {
      addProgress('Classifying query...')
      try {
        const resolution = await resolveEntity(raw)
        detectedMode = resolution.entity_type as ViewMode
        addProgress(`Identified as: ${resolution.entity_type} (${(resolution.confidence * 100).toFixed(0)}% confidence)`)
      } catch {
        detectedMode = 'company'
      }
    }

    setMode(detectedMode)
    if (detectedMode && detectedMode !== 'orchestrator') {
      setEntityTypeBadge({ type: detectedMode as EntityType })
    }

    if (detectedMode === 'company') {
      await runCompanyAnalysis(raw)
    } else if (detectedMode === 'person') {
      await runPersonAnalysis(raw)
    } else if (detectedMode === 'sector') {
      await runSectorAnalysis(raw)
    } else if (detectedMode === 'vessel') {
      await runVesselAnalysis(raw)
    }

    setLoading(false)
  }

  async function runCompanyAnalysis(raw: string) {
    const ticker = extractTicker(raw)
    addProgress(`Resolving ticker: ${ticker}`)
    addProgress('Checking sanctions status (OFAC, OpenSanctions, Trade.gov CSL)...')
    addProgress('Fetching historical comparable data...')
    try {
      const data = await fetchSanctionsImpact(ticker)
      addProgress(`Found ${data.metadata.comparable_count} comparable sanctions cases`)
      addProgress('Computing projection with confidence interval...')
      addProgress('Done!', 'done')
      setImpactData(data)
      loadEntityGraph(ticker)
    } catch (e) {
      addProgress(`Error: ${(e as Error).message}`, 'error')
    }
  }

  async function runPersonAnalysis(raw: string) {
    addProgress(`Building risk profile for: ${raw}`)
    addProgress('Searching OpenSanctions, OFAC, OpenCorporates, ICIJ Offshore Leaks, GDELT...')
    try {
      const data = await fetchPersonProfile(raw)
      addProgress('Done!', 'done')
      setPersonData(data)
      if (data.graph.nodes.length > 0) {
        setGraphData({
          nodes: data.graph.nodes,
          edges: data.graph.edges,
          meta: { query: raw, node_count: data.graph.nodes.length, edge_count: data.graph.edges.length },
        })
      }
    } catch (e) {
      addProgress(`Error: ${(e as Error).message}`, 'error')
    }
  }

  async function runSectorAnalysis(raw: string) {
    addProgress(`Analyzing sector: ${raw}`)
    addProgress('Checking key players for sanctions exposure (OFAC)...')
    try {
      const data = await fetchSectorAnalysis(raw)
      addProgress(
        `${data.sanctioned_count} of ${data.company_count} key players have OFAC designations`,
        'done',
      )
      setSectorData(data)
      if (data.graph.nodes.length > 0) {
        setGraphData({
          nodes: data.graph.nodes,
          edges: data.graph.edges,
          meta: { query: raw, node_count: data.graph.nodes.length, edge_count: data.graph.edges.length },
        })
      }
    } catch (e) {
      addProgress(`Error: ${(e as Error).message}`, 'error')
    }
  }

  async function runVesselAnalysis(raw: string) {
    addProgress(`Tracking vessel: ${raw}`)
    addProgress('Checking OFAC sanctions list, AIS database, OpenSanctions...')
    try {
      const data = await fetchVesselTrack(raw)
      addProgress(
        data.is_sanctioned ? 'OFAC match found — vessel is sanctioned!' : 'No OFAC designation found.',
        data.is_sanctioned ? 'error' : 'done',
      )
      setVesselData(data)
      if (data.graph.nodes.length > 0) {
        setGraphData({
          nodes: data.graph.nodes,
          edges: data.graph.edges,
          meta: { query: raw, node_count: data.graph.nodes.length, edge_count: data.graph.edges.length },
        })
      }
    } catch (e) {
      addProgress(`Error: ${(e as Error).message}`, 'error')
    }
  }

  async function runOrchestratorAnalysis(rawOverride?: string) {
    const raw = (rawOverride !== undefined ? rawOverride : query).trim()
    if (!raw) {
      setProgress([
        {
          msg: 'Enter a question in the search box first, then click Deep Analysis (or Ctrl+Enter / ⌘+Enter).',
          type: 'error',
          time: new Date().toLocaleTimeString(),
        },
      ])
      return
    }

    setLoading(true)
    setImpactData(null)
    setPersonData(null)
    setSectorData(null)
    setVesselData(null)
    setOrchestratorData(null)
    setGraphData(null)
    setGraphLoading(false)
    setProgress([])
    setHiddenDatasets(new Set())
    setMode('orchestrator')

    addProgress('Submitting to orchestrator pipeline...')
    try {
      const { analysis_id } = await startOrchestratorAnalysis(raw)
      addProgress(`Pipeline started (ID: ${analysis_id})`)

      // Poll every 2 seconds for progress + completion
      let done = false
      while (!done) {
        await new Promise<void>((r) => setTimeout(r, 2000))
        const status = await pollAnalysisStatus(analysis_id)

        // Replace progress list with server's authoritative list
        const entries: ProgressEntry[] = status.progress.map((msg) => ({
          msg,
          type: (msg.toLowerCase().startsWith('error') ? 'error'
                : msg.toLowerCase().includes('complete') || msg === 'Done.' ? 'done'
                : 'step') as ProgressEntry['type'],
          time: '',
        }))
        setProgress(entries)

        if (status.status === 'completed' && status.result) {
          setOrchestratorData(status.result)
          done = true
        } else if (status.status === 'failed') {
          setProgress((prev) => [
            ...prev,
            { msg: `Failed: ${status.error ?? 'Unknown error'}`, type: 'error', time: '' },
          ])
          done = true
        }
      }
    } catch (e) {
      addProgress(`Error: ${(e as Error).message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  function handleToggle(idx: number) {
    chartRef.current?.toggleDataset(idx)
    setHiddenDatasets((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  return (
    <>
      <Header />
      <div className="main">
        <QueryBox
          query={query}
          loading={loading}
          health={health}
          entityTypeBadge={entityTypeBadge}
          onQueryChange={setQuery}
          onAnalyze={startAnalysis}
          onOrchestrate={(q) => runOrchestratorAnalysis(q)}
          onClear={clearAll}
        />

        {progress.length > 0 && (
          <ProgressPanel entries={progress} loading={loading} />
        )}

        {/* Company / sanctions impact view */}
        {mode === 'company' && impactData && (
          <div id="resultsPanel">
            <NarrativeCard narrative={impactData.narrative} />
            <ImpactInfoCards target={impactData.target} />

            <div className="impact-chart-container">
              <ImpactChart ref={chartRef} data={impactData} />
            </div>

            <div className="info-card" style={{ marginBottom: '24px' }}>
              <h3>Projected Impact Summary</h3>
              <ProjectionSummary summary={impactData.projection.summary} />
            </div>

            <div className="info-card">
              <h3>
                Historical Comparable Cases{' '}
                <span style={{ fontSize: '11px', color: '#484f58', textTransform: 'none', letterSpacing: 0 }}>
                  (click to toggle on chart)
                </span>
              </h3>
              <ComparablesTable
                comparables={impactData.comparables}
                hidden={hiddenDatasets}
                onToggle={handleToggle}
              />
            </div>

            <div className="source-note">
              Data sources: Yahoo Finance, OFAC SDN, Trade.gov Consolidated Screening List, OpenSanctions
            </div>
          </div>
        )}

        {/* Person risk profile view */}
        {mode === 'person' && personData && (
          <PersonView data={personData} />
        )}

        {/* Sector analysis view */}
        {mode === 'sector' && sectorData && (
          <SectorView data={sectorData} />
        )}

        {/* Vessel intelligence view */}
        {mode === 'vessel' && vesselData && (
          <VesselView data={vesselData} />
        )}

        {/* Full orchestrator view */}
        {mode === 'orchestrator' && orchestratorData && (
          <OrchestratorView data={orchestratorData} />
        )}

        {/* Entity graph — rendered for structured modes when available */}
        {mode !== 'orchestrator' && (
          <EntityGraphSection graphData={graphData} graphLoading={graphLoading} />
        )}

        {/* Debug panel — shows raw JSON for whatever mode just ran */}
        {mode === 'company' && impactData && (
          <DebugPanel data={impactData} label="Raw API Response — sanctions-impact" />
        )}
        {mode === 'person' && personData && (
          <DebugPanel data={personData} label="Raw API Response — person-profile" />
        )}
        {mode === 'sector' && sectorData && (
          <DebugPanel data={sectorData} label="Raw API Response — sector-analysis" />
        )}
        {mode === 'vessel' && vesselData && (
          <DebugPanel data={vesselData} label="Raw API Response — vessel-track" />
        )}
      </div>
    </>
  )
}
