import { useEffect, useRef, useState } from 'react'
import { fetchHealth, fetchSanctionsImpact, fetchEntityGraph } from './api'
import Header from './components/Header'
import QueryBox, { extractTicker } from './components/QueryBox'
import ProgressPanel from './components/ProgressPanel'
import ImpactInfoCards from './components/ImpactInfoCards'
import ImpactChart, { type ImpactChartHandle } from './components/ImpactChart'
import ProjectionSummary from './components/ProjectionSummary'
import ComparablesTable from './components/ComparablesTable'
import EntityGraphSection from './components/EntityGraphSection'
import type { HealthResponse, SanctionsImpactResponse, EntityGraphResponse, ProgressEntry } from './types'
import './App.css'

export default function App() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [progress, setProgress] = useState<ProgressEntry[]>([])
  const [impactData, setImpactData] = useState<SanctionsImpactResponse | null>(null)
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

  async function loadEntityGraph(ticker: string) {
    setGraphLoading(true)
    setGraphData(null)
    try {
      const data = await fetchEntityGraph(ticker)
      setGraphData(data)
    } catch {
      setGraphData({ nodes: [], edges: [], meta: { query: ticker, node_count: 0, edge_count: 0 } })
    } finally {
      setGraphLoading(false)
    }
  }

  async function startAnalysis(tickerOverride?: string) {
    const raw = query.trim()
    if (!raw && !tickerOverride) return

    const ticker = tickerOverride || extractTicker(raw)
    if (!ticker) return

    setLoading(true)
    setImpactData(null)
    setGraphData(null)
    setGraphLoading(false)
    setProgress([])
    setHiddenDatasets(new Set())

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
    } finally {
      setLoading(false)
    }
  }

  function clearAll() {
    setQuery('')
    setLoading(false)
    setProgress([])
    setImpactData(null)
    setGraphData(null)
    setGraphLoading(false)
    setHiddenDatasets(new Set())
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
          onClear={clearAll}
        />

        {progress.length > 0 && (
          <ProgressPanel entries={progress} loading={loading} />
        )}

        {impactData && (
          <div id="resultsPanel">
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

        <EntityGraphSection graphData={graphData} graphLoading={graphLoading} />
      </div>
    </>
  )
}
