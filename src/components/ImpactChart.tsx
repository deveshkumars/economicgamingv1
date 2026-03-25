import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import {
  Chart,
  LinearScale,
  LineElement,
  PointElement,
  LineController,
  Legend,
  Tooltip,
  Filler,
} from 'chart.js'
import Annotation from 'chartjs-plugin-annotation'
import type { SanctionsImpactResponse } from '../types'

Chart.register(LinearScale, LineElement, PointElement, LineController, Legend, Tooltip, Filler, Annotation)

export interface ImpactChartHandle {
  toggleDataset: (idx: number) => void
}

interface Props {
  data: SanctionsImpactResponse
}

const ImpactChart = forwardRef<ImpactChartHandle, Props>(({ data }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useImperativeHandle(ref, () => ({
    toggleDataset(idx: number) {
      const chart = chartRef.current
      if (!chart) return
      const meta = chart.getDatasetMeta(idx)
      meta.hidden = !meta.hidden
      chart.update()
    },
  }))

  useEffect(() => {
    if (!canvasRef.current) return

    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }

    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const datasets: any[] = []

    // Comparable curves — translucent
    data.comparables.forEach((comp) => {
      const hex = comp.color
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      datasets.push({
        label: `${comp.name} (${comp.sanction_date.slice(0, 4)})`,
        data: comp.curve.map((p) => ({ x: p.day, y: p.pct })),
        borderColor: `rgba(${r},${g},${b},0.35)`,
        hoverBorderColor: hex,
        borderWidth: 1.2,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBorderWidth: 2,
        tension: 0.2,
        fill: false,
      })
    })

    // Confidence band
    if (data.projection.upper.length > 0) {
      datasets.push({
        label: 'Confidence Band (1\u03c3)',
        data: data.projection.upper.map((p) => ({ x: p.day, y: p.pct })),
        borderColor: 'transparent',
        backgroundColor: 'rgba(88, 166, 255, 0.12)',
        pointRadius: 0,
        fill: '+1',
        order: 10,
      })
      datasets.push({
        label: '_lower',
        data: data.projection.lower.map((p) => ({ x: p.day, y: p.pct })),
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        pointRadius: 0,
        fill: false,
        order: 10,
      })
    }

    // Projection mean — bold white dashed line
    if (data.projection.mean.length > 0) {
      datasets.push({
        label: `Projected Impact (${data.target.ticker})`,
        data: data.projection.mean.map((p) => ({ x: p.day, y: p.pct })),
        borderColor: '#ffffff',
        borderWidth: 4,
        borderDash: [10, 5],
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBorderWidth: 3,
        tension: 0.2,
        fill: false,
        order: 0,
      })
    }

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: true, axis: 'x' },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Trading Days from Sanctions Event', color: '#8b949e', font: { size: 12 } },
            grid: { color: '#21262d' },
            ticks: { color: '#8b949e', font: { size: 11 } },
          },
          y: {
            title: { display: true, text: 'Price Change (%)', color: '#8b949e', font: { size: 12 } },
            grid: { color: '#21262d' },
            ticks: {
              color: '#8b949e',
              font: { size: 11 },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              callback: (v: any) => v + '%',
            },
          },
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              color: '#c9d1d9',
              font: { size: 11 },
              usePointStyle: true,
              pointStyle: 'line',
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              filter: (item: any) => !item.text.startsWith('_'),
              padding: 16,
            },
          },
          tooltip: {
            backgroundColor: '#161b22',
            borderColor: '#30363d',
            borderWidth: 1,
            titleColor: '#e6edf3',
            bodyColor: '#c9d1d9',
            displayColors: true,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            filter: (item: any) => !item.dataset.label.startsWith('_'),
            callbacks: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              title: (items: any[]) => items[0].dataset.label,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              label: (item: any) => {
                if (item.dataset.label.startsWith('_')) return ''
                const sign = item.parsed.y >= 0 ? '+' : ''
                return `Day ${item.parsed.x}:  ${sign}${item.parsed.y.toFixed(1)}%`
              },
            },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          annotation: {
            annotations: {
              sanctionLine: {
                type: 'line',
                xMin: 0,
                xMax: 0,
                borderColor: '#f85149',
                borderWidth: 2,
                borderDash: [6, 3],
                label: {
                  display: true,
                  content: 'SANCTIONS EVENT',
                  position: 'start',
                  backgroundColor: 'rgba(248, 81, 73, 0.15)',
                  color: '#f85149',
                  font: { size: 10, weight: 'bold' },
                  padding: { top: 4, bottom: 4, left: 8, right: 8 },
                },
              },
              zeroLine: {
                type: 'line',
                yMin: 0,
                yMax: 0,
                borderColor: '#30363d',
                borderWidth: 1,
              },
            },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        },
      },
    })

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [data])

  return <canvas ref={canvasRef} />
})

ImpactChart.displayName = 'ImpactChart'
export default ImpactChart
