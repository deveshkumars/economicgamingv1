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
  fetchSayariResolve,
  fetchSayariUBO,
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
import FollowUpBar from './components/FollowUpBar'
import type {
  HealthResponse,
  SanctionsImpactResponse,
  EntityGraphResponse,
  ProgressEntry,
  PersonProfileResponse,
  SectorAnalysisResponse,
  VesselTrackResponse,
  ImpactAssessmentResult,
  SayariUBOOwner,
} from './types'
import './App.css'

type ViewMode = 'company' | 'person' | 'sector' | 'vessel' | 'orchestrator'


function classifyClient(query: string): ViewMode | null {
  const raw = query.trim()
  const digits = raw.replace(/[\s-]/g, '')

  // Only unambiguous numeric vessel identifiers are safe to classify client-side.
  // Everything else goes to /api/resolve-entity so Claude decides.
  if (/^\d{9}$/.test(digits)) return 'vessel'
  if (/^\d{7}$/.test(digits) || /^imo\s*\d/i.test(raw)) return 'vessel'

  return null
}

export default function App() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [progress, setProgress] = useState<ProgressEntry[]>([])
  const [mode, setMode] = useState<ViewMode | null>(null)

  const [impactData, setImpactData] = useState<SanctionsImpactResponse | null>(null)
  const [personData, setPersonData] = useState<PersonProfileResponse | null>(null)
  const [sectorData, setSectorData] = useState<SectorAnalysisResponse | null>(null)
  const [vesselData, setVesselData] = useState<VesselTrackResponse | null>(null)
  const [vesselDrillDown, setVesselDrillDown] = useState('')
  const [orchestratorData, setOrchestratorData] = useState<ImpactAssessmentResult | null>(null)
  const [graphData, setGraphData] = useState<EntityGraphResponse | null>(null)
  const [graphLoading, setGraphLoading] = useState(false)

  const [uboOwners, setUboOwners] = useState<SayariUBOOwner[]>([])
  const [uboLoading, setUboLoading] = useState(false)
  const [uboTargetName, setUboTargetName] = useState('')

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
    setMode(null)
    setImpactData(null)
    setPersonData(null)
    setSectorData(null)
    setVesselData(null); setVesselDrillDown('')
    setOrchestratorData(null)
    setGraphData(null)
    setGraphLoading(false)
    setUboOwners([])
    setUboLoading(false)
    setUboTargetName('')
    setHiddenDatasets(new Set())
  }

  async function loadEntityGraph(ticker: string) {
    setGraphLoading(true)
    setGraphData(null)
    setUboOwners([])
    setUboLoading(true)
    setUboTargetName('')

    try {
      const data = await fetchEntityGraph(ticker)
      setGraphData(data)
    } catch {
      // non-critical
    } finally {
      setGraphLoading(false)
    }

    try {
      const resolved = await fetchSayariResolve(ticker)
      if (resolved.entities.length > 0) {
        const primaryId = resolved.entities[0].entity_id
        setUboTargetName(resolved.entities[0].label || ticker)
        const uboResult = await fetchSayariUBO(primaryId)
        setUboOwners(uboResult.owners)
      }
    } catch {
      // non-critical — Sayari may not be configured
    } finally {
      setUboLoading(false)
    }
  }

  async function startAnalysis(queryOverride?: string) {
    const raw = (queryOverride !== undefined ? queryOverride : query).trim()
    if (!raw) return

    setLoading(true)
    setImpactData(null)
    setPersonData(null)
    setSectorData(null)
    setVesselData(null); setVesselDrillDown('')
    setOrchestratorData(null)
    setGraphData(null)
    setGraphLoading(false)
    setUboOwners([])
    setUboLoading(false)
    setUboTargetName('')
    setProgress([])
    setHiddenDatasets(new Set())
    setMode(null)

    // Tier 1: client-side classification
    let detectedMode = classifyClient(raw)

    // Short-circuit: orchestrator-pattern queries skip the structured endpoints
    if (detectedMode === 'orchestrator') {
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

    if (detectedMode === 'orchestrator') {
      setLoading(false)
      await runOrchestratorAnalysis(raw)
      return
    }

    setMode(detectedMode)

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
    setVesselData(null); setVesselDrillDown('')
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
          onQueryChange={setQuery}
          onAnalyze={startAnalysis}
          onDeepAnalyze={() => runOrchestratorAnalysis()}
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

            {impactData.projection.coherence_low && (
              <div style={{
                background: 'rgba(248,193,53,0.1)',
                border: '1px solid rgba(248,193,53,0.35)',
                borderRadius: '6px',
                padding: '10px 14px',
                marginBottom: '16px',
                fontSize: '12px',
                color: '#e3b341',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}>
                <span style={{ flexShrink: 0, fontWeight: 700 }}>Low Coherence</span>
                <span>
                  Comparable cases are split on direction (agreement:{' '}
                  {((impactData.projection.coherence_score ?? 0) * 100).toFixed(0)}%). The projected
                  mean may mask significant divergence — treat confidence bands as indicative only.
                </span>
              </div>
            )}

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
                {impactData.metadata.sourcing_method && (
                  <span style={{
                    marginLeft: '10px',
                    fontSize: '10px',
                    fontWeight: 500,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    background: impactData.metadata.sourcing_method === 'static_fallback'
                      ? 'rgba(72,79,88,0.4)'
                      : 'rgba(63,185,80,0.15)',
                    color: impactData.metadata.sourcing_method === 'static_fallback'
                      ? '#8b949e'
                      : '#3fb950',
                    border: `1px solid ${impactData.metadata.sourcing_method === 'static_fallback' ? '#30363d' : 'rgba(63,185,80,0.3)'}`,
                  }}>
                    {impactData.metadata.sourcing_method === 'claude' ? 'AI-sourced'
                     : impactData.metadata.sourcing_method === 'cache' ? 'AI-sourced (cached)'
                     : 'Reference dataset'}
                  </span>
                )}
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

            <FollowUpBar
              contextType="company"
              context={{
                target: impactData.target,
                projection: {
                  summary: impactData.projection.summary,
                  coherence_score: impactData.projection.coherence_score,
                  coherence_low: impactData.projection.coherence_low,
                },
                comparables: impactData.comparables.map((c) => ({
                  name: c.name,
                  ticker: c.ticker,
                  sanction_date: c.sanction_date,
                  description: c.description,
                  sector: c.sector,
                  sanction_type: c.sanction_type,
                })),
                control_comparables: (impactData.control_comparables ?? []).map((c) => ({
                  name: c.name,
                  ticker: c.ticker,
                })),
                narrative: impactData.narrative,
                metadata: impactData.metadata,
              }}
            />
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
          <>
            <VesselView data={vesselData} onDrillDown={(q) => setVesselDrillDown(q)} />
            <FollowUpBar
              contextType="vessel"
              context={{
                vessel: vesselData.vessel,
                ownership_chain: vesselData.ownership_chain,
                trade_activity: vesselData.trade_activity,
                countries_visited: vesselData.countries_visited,
                narrative: vesselData.narrative,
                is_sanctioned: vesselData.is_sanctioned,
                risk_scores: vesselData.risk_scores,
              }}
              prefillQuestion={vesselDrillDown}
            />
          </>
        )}

        {/* Full orchestrator view */}
        {mode === 'orchestrator' && orchestratorData && (
          <OrchestratorView data={orchestratorData} />
        )}

        {/* Entity graph — rendered for structured modes when available (vessel has its own tabbed graph) */}
        {mode !== 'orchestrator' && mode !== 'vessel' && (
          <EntityGraphSection
            graphData={graphData}
            graphLoading={graphLoading}
            uboOwners={uboOwners}
            uboLoading={uboLoading}
            uboTargetName={uboTargetName}
          />
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
