import { useEffect, useState } from 'react'
import {
  fetchHealth,
  fetchEntityResolution,
  fetchSanctionsImpact,
  fetchPersonProfile,
  fetchVesselTrack,
  fetchSectorAnalysis,
  fetchEntityGraph,
} from './api'
import Header from './components/Header'
import QueryBox, { extractTicker } from './components/QueryBox'
import ProgressPanel from './components/ProgressPanel'
import EntityTypeBadge from './components/EntityTypeBadge'
import CompanyView from './components/CompanyView'
import PersonReport from './components/PersonReport'
import VesselReport from './components/VesselReport'
import SectorDashboard from './components/SectorDashboard'
import EntityGraphSection from './components/EntityGraphSection'
import type {
  HealthResponse,
  EntityType,
  EntityGraphResponse,
  ProgressEntry,
  AnalysisResult,
} from './types'
import './App.css'

export default function App() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [progress, setProgress] = useState<ProgressEntry[]>([])
  const [entityType, setEntityType] = useState<EntityType | null>(null)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [graphData, setGraphData] = useState<EntityGraphResponse | null>(null)
  const [graphLoading, setGraphLoading] = useState(false)

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => {})
  }, [])

  function addProgress(msg: string, type: ProgressEntry['type'] = 'step') {
    const time = new Date().toLocaleTimeString()
    setProgress((prev) => [...prev, { msg, type, time }])
  }

  async function loadEntityGraph(query: string) {
    setGraphLoading(true)
    setGraphData(null)
    try {
      const data = await fetchEntityGraph(query)
      setGraphData(data)
    } catch {
      setGraphData({ nodes: [], edges: [], meta: { query, node_count: 0, edge_count: 0 } })
    } finally {
      setGraphLoading(false)
    }
  }

  async function startAnalysis(tickerOverride?: string) {
    const raw = query.trim()
    if (!raw && !tickerOverride) return

    setLoading(true)
    setResult(null)
    setEntityType(null)
    setGraphData(null)
    setGraphLoading(false)
    setProgress([])

    try {
      // Step 1: Resolve entity type (skip if ticker override from chip)
      let resolvedType: EntityType = 'company'
      let resolvedName = tickerOverride || raw

      if (!tickerOverride) {
        addProgress('Classifying entity type...')
        try {
          const resolution = await fetchEntityResolution(raw)
          resolvedType = resolution.entity_type
          resolvedName = resolution.entity_name
          addProgress(`Detected: ${resolvedType.toUpperCase()} \u2014 ${resolvedName}`)
        } catch {
          addProgress('Entity resolution failed, defaulting to company')
        }
      }

      setEntityType(resolvedType)

      // Step 2: Route to entity-specific handler
      switch (resolvedType) {
        case 'company': {
          const ticker = tickerOverride || extractTicker(raw)
          addProgress('Checking sanctions status (OFAC, OpenSanctions)...')
          addProgress('Fetching historical comparable data...')
          const data = await fetchSanctionsImpact(ticker)
          addProgress(`Found ${data.metadata.comparable_count} comparable sanctions cases`)
          addProgress('Computing projection with confidence interval...')
          addProgress('Done!', 'done')
          setResult({ type: 'company', data })
          loadEntityGraph(ticker)
          break
        }
        case 'person': {
          addProgress('Searching OFAC SDN + OpenSanctions (person schema)...')
          addProgress('Looking up corporate affiliations...')
          addProgress('Pulling GDELT news events...')
          const data = await fetchPersonProfile(resolvedName)
          addProgress('Done!', 'done')
          setResult({ type: 'person', data })
          // Person endpoint returns its own graph
          if (data.graph) setGraphData(data.graph)
          break
        }
        case 'vessel': {
          addProgress('Searching AIS database (Datalastic)...')
          addProgress('Checking OFAC sanctions for vessel...')
          const data = await fetchVesselTrack(resolvedName)
          addProgress('Done!', 'done')
          setResult({ type: 'vessel', data })
          if (data.graph) setGraphData(data.graph)
          break
        }
        case 'sector': {
          addProgress('Analyzing sector composition...')
          addProgress('Checking sanctions exposure for key players...')
          const data = await fetchSectorAnalysis(resolvedName)
          addProgress(`Found ${data.company_count} companies, ${data.sanctioned_count} sanctioned`)
          addProgress('Done!', 'done')
          setResult({ type: 'sector', data })
          if (data.graph) setGraphData(data.graph)
          break
        }
      }
    } catch (e) {
      addProgress(`Error: ${(e as Error).message}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  function clearAll() {
    setQuery('')
    setLoading(false)
    setProgress([])
    setResult(null)
    setEntityType(null)
    setGraphData(null)
    setGraphLoading(false)
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
          onClear={clearAll}
        />

        {entityType && (
          <div style={{ marginBottom: '12px' }}>
            <EntityTypeBadge entityType={entityType} />
          </div>
        )}

        {progress.length > 0 && (
          <ProgressPanel entries={progress} loading={loading} />
        )}

        {result?.type === 'company' && <CompanyView data={result.data} />}
        {result?.type === 'person' && <PersonReport data={result.data} />}
        {result?.type === 'vessel' && <VesselReport data={result.data} />}
        {result?.type === 'sector' && <SectorDashboard data={result.data} />}

        {/* Entity graph for company type (others include graph inline) */}
        {result?.type === 'company' && (
          <EntityGraphSection graphData={graphData} graphLoading={graphLoading} />
        )}
      </div>
    </>
  )
}
