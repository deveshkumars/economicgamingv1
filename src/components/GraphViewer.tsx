import { useEffect, useRef } from 'react'
import { Network } from 'vis-network/standalone'
import type { GraphData } from '../types'

interface Props {
  graphData: GraphData
}

export default function GraphViewer({ graphData }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !graphData.nodes.length) return

    const network = new Network(
      containerRef.current,
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodes: graphData.nodes as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        edges: graphData.edges as any,
      },
      {
        nodes: {
          shape: 'dot',
          size: 18,
          font: {
            color: '#e6edf3',
            size: 13,
            strokeWidth: 3,
            strokeColor: '#0d1117',
            vadjust: 4,
          },
          widthConstraint: { maximum: 140 },
        },
        edges: {
          color: { color: '#30363d', highlight: '#58a6ff' },
          font: {
            color: '#8b949e',
            size: 11,
            strokeWidth: 2,
            strokeColor: '#0d1117',
            align: 'middle',
          },
          smooth: { enabled: true, type: 'dynamic', roundness: 0.4 },
        },
        physics: {
          solver: 'forceAtlas2Based',
          forceAtlas2Based: {
            gravitationalConstant: -80,
            centralGravity: 0.01,
            springLength: 160,
            springConstant: 0.06,
            damping: 0.6,
          },
          minVelocity: 0.75,
          stabilization: { iterations: 200 },
        },
        interaction: { hover: true, tooltipDelay: 100, zoomView: true },
        layout: { improvedLayout: true },
      }
    )

    return () => network.destroy()
  }, [graphData])

  return <div id="graph-container" ref={containerRef} />
}
