import { useRef, useState } from 'react'
import type { SanctionsImpactResponse } from '../types'
import ImpactInfoCards from './ImpactInfoCards'
import ImpactChart, { type ImpactChartHandle } from './ImpactChart'
import ProjectionSummary from './ProjectionSummary'
import ComparablesTable from './ComparablesTable'

export default function CompanyView({ data }: { data: SanctionsImpactResponse }) {
  const chartRef = useRef<ImpactChartHandle>(null)
  const [hiddenDatasets, setHiddenDatasets] = useState<Set<number>>(new Set())

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
    <div id="resultsPanel">
      <ImpactInfoCards target={data.target} />

      <div className="impact-chart-container">
        <ImpactChart ref={chartRef} data={data} />
      </div>

      <div className="info-card" style={{ marginBottom: '24px' }}>
        <h3>Projected Impact Summary</h3>
        <ProjectionSummary summary={data.projection.summary} />
      </div>

      <div className="info-card">
        <h3>
          Historical Comparable Cases{' '}
          <span style={{ fontSize: '11px', color: '#484f58', textTransform: 'none', letterSpacing: 0 }}>
            (click to toggle on chart)
          </span>
        </h3>
        <ComparablesTable
          comparables={data.comparables}
          hidden={hiddenDatasets}
          onToggle={handleToggle}
        />
      </div>

      <div className="source-note">
        Data sources: Yahoo Finance, OFAC SDN, OpenSanctions
      </div>
    </div>
  )
}
